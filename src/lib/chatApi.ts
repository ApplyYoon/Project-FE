/**
 * AI 코치(멘토) 채팅을 서버(BE)와 주고받는 함수들입니다. (#416, BE 이슈 #238 → 2026-10-18 코치 탭)
 * 채팅은 "글로 하는 통화" 입니다. 통화와 같은 대본으로 AI 코치와 이야기합니다.
 *
 * 서버와 정한 약속입니다. (BE 저장소의 docs/API.md "상담 채팅") 전부 로그인이 필요합니다.
 *   열기      POST /chats?grade=2&classNo=1   { careLevel, maxHarshness, card }   (학년 · 반은 있으면 — 오늘 시간표를 대본에)
 *                                         -> 200 { chatId, reply, showHelp, helpLines, quickReplies?, action? }
 *   말 보내기  POST /chats/{chatId}/messages { lines: [{ speaker: 'ai' | 'me', text }] }  (이 서버 세션의 대화 전체)
 *                                         -> 200 (위와 같은 모양)
 *   정리하기  POST /calls/{chatId}/finish (lib/callReview.ts 의 finishCall). 코치 탭은 날이 바뀌면 지난 세션을 조용히 정리합니다.
 *             정리한 요약은 서버 대본의 [지난 통화] 로 들어가서, 다음 날 AI 가 "어제 약속 지켰어?" 처럼 이어서 물어봅니다.
 *   실패      400 대화 모양이 틀림 · 409 이미 끝났거나 서버가 대본을 잊음 · 429 오늘 AI 사용량을 다 씀 · 503 AI 가 꺼져 있음
 *
 * - 열기 요청은 통화를 걸 때와 똑같습니다. (말투 · 학생 카드. pages/CallActivePage.tsx)
 *   서버는 숫자를 서버의 기록으로 다시 계산하고, 서버에 기록이 없을 때만 이 카드를 씁니다.
 * - showHelp 가 true 면 학생의 말에서 위기 표현이 감지된 것입니다. reply 는 서버가 정해 둔 안내입니다. (BE #307 부터 채팅은 이어 갑니다)
 * - quickReplies · action 은 AI 가 고른 빠른 답 · 행동입니다(BE #309, #327). 없거나 모양이 틀리면 빈 값으로 봅니다.
 *
 * ⚠️ 대화는 학생의 마음 이야기입니다. **서버에는 저장하지 않습니다.** 서버는 답을 받는 데만 쓰고, 정리할 때 요약만 남깁니다.
 *    대신 **이 기기에는** 남깁니다. (lib/coachThread.ts, 2026-10-18 사용자 결정: "멘토와 연속적인 대화를 한다는 느낌으로")
 *    지난 대화가 이어 보여야 멘토와 계속 이야기하는 것 같기 때문입니다. 설정의 "모든 기록 지우기" 로 지울 수 있습니다.
 *    console.log 로 찍지 않습니다.
 */
import { api, ApiError } from '@/lib/api'
import { loadCallCard } from '@/lib/callCard'
import { loadStudySignals } from '@/lib/studySignals'
import type { CallLine } from '@/lib/callReview'
import { loadSchoolClass } from '@/lib/schoolToday'
import { getCallTone } from '@/lib/todayCare'

// 서버가 GPT 의 답을 기다리는 시간(15초)보다 조금 넉넉하게 기다립니다.
const REQUEST_TIMEOUT_MS = 25_000

/** 서버가 받는 대화의 한도입니다. (BE ChatMessageRequest: 60줄, 한 줄 500자) */
export const MAX_CHAT_LINES = 60
export const MAX_CHAT_TEXT_LENGTH = 500

/** 도움받을 곳 하나 (서버의 HelpLine 과 같은 모양) */
export interface ChatHelpLine {
  name: string
  number: string
  detail: string
}

/**
 * AI 가 함께 제안한 행동 하나. 화면은 칩으로 보여 주고, 누를 때만 실행합니다.
 *   start_timer  — 지금 공부 시작 · shrink_today — 오늘 목표를 줄여서 시작 · create_card — 그 제목의 카드로 시작
 *   make_plan    — 시험 · 대회 날까지의 긴 계획 짜기 (title = 목표 한 줄, date = 그 날. BE #327, 2026-10-18)
 *   start_quiz   — 그 주제로 확인 문제 풀기 (title = 주제)
 */
export interface ChatAction {
  type: 'start_timer' | 'shrink_today' | 'create_card' | 'make_plan' | 'start_quiz'
  /** 분 (5 ~ 120). 모르면 null */
  minutes: number | null
  /** create_card 의 카드 제목 · make_plan 의 목표 · start_quiz 의 주제 (30자까지). 모르면 null */
  title: string | null
  /** make_plan 의 시험 · 대회 날 'YYYY-MM-DD'. 모르거나 서버가 범위(내일 ~ 30일 뒤) 밖이라고 비웠으면 null */
  date: string | null
}

/** AI 코치의 말 하나 */
export interface ChatReply {
  chatId: string
  reply: string
  /** true 면 위기 표현이 감지됐습니다. 상담 전화 한 줄을 보여 줍니다. (대화는 이어 갑니다) */
  showHelp: boolean
  helpLines: ChatHelpLine[]
  /** AI 가 고른 빠른 답 (3개까지). 서버가 안 주면 빈 목록 — 그때는 화면이 코드로 칩을 붙입니다. */
  quickReplies: string[]
  /** AI 가 제안한 행동. 없으면 null */
  action: ChatAction | null
}

const ACTION_TYPES: ChatAction['type'][] = [
  'start_timer',
  'shrink_today',
  'create_card',
  'make_plan',
  'start_quiz',
]

// 날짜 모양 'YYYY-MM-DD'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 서버가 준 빠른 답을 확인합니다. 글자만, 빈 것은 빼고, 3개 · 한 개 20자까지 */
function readQuickReplies(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim().slice(0, 20))
    .slice(0, 3)
}

/** 서버가 준 행동을 확인합니다. 모양이 틀리면 null */
function readAction(value: unknown): ChatAction | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!ACTION_TYPES.includes(record.type as ChatAction['type'])) return null
  const minutes =
    typeof record.minutes === 'number' && Number.isInteger(record.minutes)
      ? Math.min(120, Math.max(5, record.minutes))
      : null
  const title =
    typeof record.title === 'string' && record.title.trim() !== ''
      ? record.title.trim().slice(0, 30)
      : null
  const date =
    typeof record.date === 'string' && DATE_PATTERN.test(record.date) ? record.date : null
  return { type: record.type as ChatAction['type'], minutes, title, date }
}

/** 서버가 준 값이 약속한 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) 빠른 답 · 행동은 따로 읽습니다. */
function isChatReply(value: unknown): value is Omit<ChatReply, 'quickReplies' | 'action'> {
  if (typeof value !== 'object' || value === null) return false
  const reply = value as Record<string, unknown>
  return (
    typeof reply.chatId === 'string' &&
    typeof reply.reply === 'string' &&
    typeof reply.showHelp === 'boolean' &&
    Array.isArray(reply.helpLines) &&
    reply.helpLines.every(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        typeof (line as Record<string, unknown>).name === 'string' &&
        typeof (line as Record<string, unknown>).number === 'string',
    )
  )
}

async function postChat(path: string, body: unknown): Promise<ChatReply> {
  const result = await api<unknown>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // 502: 서버가 이상한 응답을 줬다는 뜻으로 씁니다.
  if (!isChatReply(result)) throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  const record = result as unknown as Record<string, unknown>
  return {
    chatId: result.chatId,
    reply: result.reply,
    showHelp: result.showHelp,
    helpLines: result.helpLines,
    quickReplies: readQuickReplies(record.quickReplies),
    action: readAction(record.action),
  }
}

/**
 * 채팅을 엽니다. AI 코치의 첫 인사가 돌아옵니다. 요청은 통화를 걸 때와 같습니다.
 * 이 기기에 학년 · 반이 있으면 같이 보내서, 서버가 오늘 시간표를 대본에 넣게 합니다. (BE #307)
 */
export function startChat(): Promise<ChatReply> {
  const tone = getCallTone()
  const schoolClass = loadSchoolClass()
  const query = schoolClass ? `?grade=${schoolClass.grade}&classNo=${schoolClass.classNo}` : ''
  return postChat(`/chats${query}`, {
    careLevel: tone.careLevel,
    maxHarshness: tone.maxHarshness,
    card: loadCallCard(),
    // 기기에만 있는 최근 7일 집중도 · 폰 든 횟수 · 확인 문제 결과 (lib/studySignals.ts, BE #334)
    studySignals: loadStudySignals(),
    // 생각 습관 테스트(selfReportedBiases · selfReportedWeaknesses)는 #417 에서 지워서 보내지 않습니다. (서버에서 선택 칸)
  })
}

/** 학생의 말을 보냅니다. lines 는 이 서버 세션의 대화 전체이고, 맨 끝이 방금 학생이 쓴 말입니다. */
export function sendChatMessage(chatId: string, lines: CallLine[]): Promise<ChatReply> {
  return postChat(`/chats/${encodeURIComponent(chatId)}/messages`, { lines })
}
