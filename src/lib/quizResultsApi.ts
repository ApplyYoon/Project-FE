/**
 * 채팅 확인 문제의 결과(lib/studyQuiz.ts)를 서버(BE)에도 저장하는 함수들입니다. (#653, BE #375)
 *
 * 서버와 정한 약속입니다. (BE 저장소의 docs/API.md "퀴즈 결과 · 통계") 로그인이 필요합니다.
 *   퀴즈 한 번 저장  POST /quiz-results
 *                    { subjectId: 3, unit: '함수', correctCount: 2, totalCount: 3, questionSeconds: [45, 30, 62] }
 *                    -> 201 { id, subjectId, unit, quizDate: '2026-10-25', correctCount, totalCount, questionSeconds }
 *                    날짜는 보내지 않습니다. 서버가 "받은 시각" 으로 정합니다. (새벽 4시 기준, 이 기기와 같은 규칙)
 *   실패             400 값이 틀림 (단원이 비었거나 30자 넘음 · 문제 1 ~ 20개 밖 · 한 문제 3600초 넘음 등)
 *                    404 과목을 찾을 수 없음 (다른 기기에서 그 과목을 지움)
 *
 * ■ 이 기기에 먼저 저장하고, 서버에는 "같이" 보냅니다. (이번 주에 고른 것 lib/weeklyPicksApi.ts 와 같은 방식)
 *   - 다 풀면 바로, 그리고 앱을 열 때 · 1분마다 아직 못 보낸 것을 보냅니다. (hooks/useQuizResultSync.ts)
 *   - 서버에 올라간 것은 "보낸 목록"('study-quiz-result-sync')에 적어 두고 다시 보내지 않습니다.
 *     서버에는 같은 결과를 알아보는 칸이 없어서, 두 번 보내면 두 번 저장되기 때문입니다.
 *   - 서버가 거절한 것(400 · 404)은 다시 보내도 같아서 "거절 목록" 에 적고 그만 보냅니다. 이 기기의 결과는 그대로입니다.
 *
 * ■ 보내지 않는 것 (지금처럼 이 기기에만 남습니다)
 *   - 테스트 로그인: 이 파일을 부르지 않습니다. (hooks/useQuizResultSync.ts)
 *   - 시연용 예시 문제(isDemo) · 시연 데이터('demo-' 로 시작하는 id, lib/demoQuiz.ts)
 *   - 단원을 모르는 결과: AI 가 단원을 못 정함 · "틀린 문제 다시" · 이 기능 전에 푼 결과 (서버는 단원이 꼭 있어야 합니다)
 *   - 과목을 모르는 결과: 카드에 과목이 없고, 주제 · 카드 제목으로도 내 과목을 못 찾음 (서버는 과목 번호가 꼭 있어야 합니다)
 *   - 오늘(새벽 4시 기준) 푼 것이 아닌 결과: 서버는 받은 날을 푼 날로 저장해서, 어제 것을 오늘 보내면 날짜가 틀어집니다.
 *     그래서 못 보낸 것도 그날 안에만 다시 보냅니다.
 */
import { api, ApiError } from '@/lib/api'
import { loadSavedCards } from '@/lib/cards'
import { isServerDataMode } from '@/lib/dataMode'
import { getTodayKey, isDateKey } from '@/lib/date'
import { DEMO_ID_PREFIX } from '@/lib/demoPersona'
import { queryClient } from '@/lib/queryClient'
import { subjectNameOf } from '@/lib/quizReport'
import { loadData, saveData } from '@/lib/storage'
import { loadQuizResults, type QuizResult } from '@/lib/studyQuiz'
import { subjectsQuery } from '@/lib/subjectsApi'
import type { Card, Subject } from '@/types'

/** 서버 응답을 기다리는 최대 시간(밀리초) */
const REQUEST_TIMEOUT_MS = 10000

/** 서버가 받는 값의 범위 (BE QuizResultRequest 와 같음) */
const MAX_UNIT_LENGTH = 30
const MAX_QUESTIONS = 20
const MAX_QUESTION_SECONDS = 3600

/** 보낸 것 · 거절된 것을 적어 두는 저장 키 (실제 키는 'study-quiz-result-sync'). "모든 기록 지우기" 로 같이 지워집니다. (lib/myData.ts) */
export const QUIZ_RESULT_SYNC_KEY = 'quiz-result-sync'

/** 과목 · 단원 · 날짜 한 칸의 맞은 수 · 전체 수. 서버가 결과를 묶어 세는 단위입니다. */
export interface QuizCount {
  /** 서버 과목 번호 (예: '3') */
  subjectId: string
  /** 단원 (예: '함수') */
  unit: string
  /** 'YYYY-MM-DD' (새벽 4시 기준) */
  date: string
  correct: number
  total: number
}

/** 보낸 것 · 거절된 것 */
export interface QuizResultSyncState {
  /** 서버에 올라간 결과: 이 기기의 결과 id → 서버가 저장한 칸 */
  sent: Record<string, QuizCount>
  /** 서버가 거절해서(400 · 404) 다시 보내지 않는 결과 id */
  rejected: string[]
}

// ---------------------------------------------------------------------------
// 보낸 목록 (저장소)
// ---------------------------------------------------------------------------

/** 저장소에서 꺼낸 칸 하나를 확인합니다. 모양이 틀리면 null */
function toQuizCount(value: unknown): QuizCount | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (typeof item.subjectId !== 'string' || typeof item.unit !== 'string') return null
  if (typeof item.date !== 'string' || !isDateKey(item.date)) return null
  if (typeof item.correct !== 'number' || typeof item.total !== 'number') return null
  return {
    subjectId: item.subjectId,
    unit: item.unit,
    date: item.date,
    correct: item.correct,
    total: item.total,
  }
}

/** 보낸 것 · 거절된 것. 저장된 게 없거나 깨졌으면 빈 목록입니다. */
export function loadQuizResultSync(): QuizResultSyncState {
  const saved = loadData<unknown>(QUIZ_RESULT_SYNC_KEY, null)
  if (typeof saved !== 'object' || saved === null) return { sent: {}, rejected: [] }
  const record = saved as Record<string, unknown>
  const sent: Record<string, QuizCount> = {}
  if (typeof record.sent === 'object' && record.sent !== null) {
    for (const [id, value] of Object.entries(record.sent)) {
      const count = toQuizCount(value)
      if (count) sent[id] = count
    }
  }
  const rejected = Array.isArray(record.rejected)
    ? record.rejected.filter((id): id is string => typeof id === 'string')
    : []
  return { sent, rejected }
}

function saveQuizResultSync(state: QuizResultSyncState): void {
  saveData(QUIZ_RESULT_SYNC_KEY, state)
}

/**
 * 이 기기에서 사라진 결과(100개를 넘어 지워짐 · 시연 데이터 빼기)는 목록에서도 뺍니다. 목록이 끝없이 길어지지 않게 하려는 것입니다.
 * 서버에 올라간 것은 서버에 그대로 남습니다.
 */
function keepOnlyExisting(state: QuizResultSyncState, results: QuizResult[]): QuizResultSyncState {
  const ids = new Set(results.map((result) => result.id))
  const sent: Record<string, QuizCount> = {}
  for (const [id, count] of Object.entries(state.sent)) {
    if (ids.has(id)) sent[id] = count
  }
  return { sent, rejected: state.rejected.filter((id) => ids.has(id)) }
}

// ---------------------------------------------------------------------------
// 보낼 것 고르기 (React 없이 도는 규칙)
// ---------------------------------------------------------------------------

/** 문제마다 걸린 시간(초). 서버는 한 문제에 1시간까지 받아서, 화면을 켜 두고 자리를 비운 문제는 1시간으로 줄입니다. */
function questionSecondsOf(result: QuizResult): number[] {
  return result.answers.map((answer) =>
    Math.min(MAX_QUESTION_SECONDS, Math.max(0, Math.round(answer.ms / 1000))),
  )
}

/**
 * 서버로 보내도 되는 결과인지 확인합니다. 서버가 거절할 것(400)과 날짜가 틀어질 것은 미리 거릅니다.
 * (과목은 내 과목 목록이 있어야 찾을 수 있어서 따로 봅니다. findServerSubjectId)
 *
 *   canSendQuizResult({ id: 'quiz-1761…', date: '2026-10-25', unit: '함수', 문제 3개, … }, '2026-10-25') -> true
 *   canSendQuizResult({ id: 'demo-quiz-…', … }, '2026-10-25')                                     -> false (시연 데이터)
 *   canSendQuizResult({ …, unit: null }, '2026-10-25')                                            -> false (단원 모름)
 *   canSendQuizResult({ …, date: '2026-10-24' }, '2026-10-25')                                    -> false (어제 푼 것)
 */
export function canSendQuizResult(result: QuizResult, todayKey: string): boolean {
  if (result.isDemo || result.id.startsWith(DEMO_ID_PREFIX)) return false
  if (result.date !== todayKey) return false
  const unit = result.unit?.trim() ?? ''
  if (unit === '' || unit.length > MAX_UNIT_LENGTH) return false
  const total = result.questions.length
  if (total < 1 || total > MAX_QUESTIONS || result.answers.length !== total) return false
  return result.correct >= 0 && result.correct <= total
}

/**
 * 이 결과의 서버 과목 번호를 찾습니다. 못 찾으면 null (그러면 보내지 않습니다)
 *   1. 카드로 낸 문제면 그 카드의 과목 (#652 에서 카드에 과목 칸이 생김)
 *   2. 아니면 주제 · 카드 제목에 든 내 과목 이름 (예: '수학 문제집 6쪽' → 수학, '미적분 3단원' → 수학)
 *      문제 풀이 리포트가 과목을 정하는 규칙(lib/quizReport.ts 의 subjectNameOf)과 같습니다.
 */
export function findServerSubjectId(
  result: QuizResult,
  cards: Card[],
  subjects: Subject[],
): string | null {
  const card = cards.find((item) => item.id === result.cardId)
  const cardSubject = subjects.find((subject) => subject.id === card?.subjectId)
  const name = subjectNameOf(`${result.topic} ${card?.title ?? ''}`, subjects)
  const subject = cardSubject ?? subjects.find((item) => item.name === name)
  // 진짜 로그인의 과목은 서버에서 받아서 id 가 곧 서버 번호(숫자)입니다.
  return subject && /^\d{1,18}$/.test(subject.id) ? subject.id : null
}

/** 아직 서버에 안 올라갔고, 거절되지도 않았고, 보내도 되는 결과들 (다 푼 순서) */
export function findQuizResultsToSend(
  results: QuizResult[],
  state: QuizResultSyncState,
  todayKey: string,
): QuizResult[] {
  return results.filter(
    (result) =>
      state.sent[result.id] === undefined &&
      !state.rejected.includes(result.id) &&
      canSendQuizResult(result, todayKey),
  )
}

// ---------------------------------------------------------------------------
// 서버 부르기
// ---------------------------------------------------------------------------

/**
 * 결과 하나를 서버에 저장하고, 서버가 저장한 칸(과목 · 단원 · 날짜 · 맞은 수)을 돌려줍니다.
 * 실패하면 에러를 던집니다. 보낸 결과는 이 기기의 저장소에 그대로 있습니다.
 */
export async function saveQuizResultToServer(
  result: QuizResult,
  subjectId: string,
): Promise<QuizCount> {
  const unit = (result.unit ?? '').trim()
  const total = result.questions.length
  const saved = await api<unknown>('/quiz-results', {
    method: 'POST',
    body: JSON.stringify({
      subjectId: Number(subjectId),
      unit,
      correctCount: result.correct,
      totalCount: total,
      questionSeconds: questionSecondsOf(result),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // 서버가 정한 날짜를 씁니다. 응답 모양이 이상해도 저장은 된 것(201)이라, 보낸 값과 오늘 날짜로 적어 둡니다.
  // (에러로 보면 다시 보내서 서버에 두 번 저장됩니다)
  const quizDate =
    typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>).quizDate : null
  return {
    subjectId,
    unit,
    date: typeof quizDate === 'string' && isDateKey(quizDate) ? quizDate : getTodayKey(),
    correct: result.correct,
    total,
  }
}

/** 서버가 "값이 틀렸다(400) · 과목이 없다(404)" 고 거절한 것인지. 다시 보내도 같아서 그만 보냅니다. */
function isRejected(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 400 || error.status === 404)
}

// 지금 보내는 중인지. 보내는 중에 또 부르면 그냥 돌아갑니다. (같은 결과를 두 번 보내지 않게)
let isPushing = false

/**
 * 아직 못 보낸 오늘의 결과를 하나씩 서버로 보냅니다. 서버에 닿지 못하면 거기서 멈추고 남은 것은 다음에 보냅니다.
 * 하나라도 보냈으면 true 를 돌려줍니다.
 */
export async function pushUnsentQuizResults(): Promise<boolean> {
  if (isPushing || !isServerDataMode()) return false
  isPushing = true
  let didSend = false
  try {
    const results = loadQuizResults()
    const state = keepOnlyExisting(loadQuizResultSync(), results)
    saveQuizResultSync(state)
    const toSend = findQuizResultsToSend(results, state, getTodayKey())
    if (toSend.length === 0) return false

    // 과목 번호를 찾으려면 내 과목 목록이 있어야 합니다. 받아 둔 것이 있으면 그것을, 없으면 서버에서 받습니다.
    const subjects = await queryClient.ensureQueryData(subjectsQuery())
    const cards = loadSavedCards() ?? []
    for (const result of toSend) {
      const subjectId = findServerSubjectId(result, cards, subjects)
      // 과목을 못 찾으면 보내지 않습니다. 거절 목록에도 적지 않아서, 그날 안에 과목을 만들면 다음에 보냅니다.
      if (subjectId === null) continue
      try {
        const saved = await saveQuizResultToServer(result, subjectId)
        const latest = loadQuizResultSync()
        saveQuizResultSync({ ...latest, sent: { ...latest.sent, [result.id]: saved } })
        didSend = true
      } catch (error) {
        if (!isRejected(error)) break
        const latest = loadQuizResultSync()
        saveQuizResultSync({ ...latest, rejected: [...latest.rejected, result.id] })
      }
    }
  } catch {
    // 과목 목록을 못 받았습니다. (인터넷 끊김 등) 다음에 다시 합니다.
  } finally {
    isPushing = false
  }
  return didSend
}
