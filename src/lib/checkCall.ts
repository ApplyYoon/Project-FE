import { api } from '@/lib/api'
import { pushPendingCards } from '@/lib/cardSync'
import { loadSavedCards } from '@/lib/cards'
import { loadAllSessions } from '@/lib/dailyRecords'
import { getTodayKey, toDayKey } from '@/lib/date'
import { pushPendingSessions } from '@/lib/sessionSync'
import { getStudyMs } from '@/lib/studyTime'
import { queryOptions } from '@tanstack/react-query'
import type { Card, StudySession } from '@/types'

/**
 * "확인 통화" 에 쓸 오늘 끝낸 공부입니다. (2026-10-18, 이슈 #577 · BE #327)
 * 오늘 끝낸 공부가 있으면 통화에서 방금 공부한 것을 말로 설명하고(설명하면서 복습),
 * 코치가 질문 2~3개로 이해했는지 확인합니다.
 *
 * ■ 통화는 공부를 안 했어도 걸 수 있습니다. (2026-10-22 사용자 "AI 전화 조건 제거")
 *   처음에는 "오늘 공부를 하나 끝내야 열림" 문이 있었는데 서버(BE CheckCall)와 함께 뺐습니다.
 *   끝낸 공부가 없으면 보통 통화로 시작합니다.
 *
 * 서버와 정한 약속입니다. (BE 저장소의 docs/API.md "확인 통화 열림 확인")
 *   GET  /realtime/check-call -> { open: true, studied: { title, minutes, endedAt } | null, reason: null }
 *        open · reason 은 옛 모양이라 남아 있고, 지금은 studied 만 씁니다.
 *
 * ■ 서버 규칙(BE CheckCall)과 같은 규칙을 이 기기 기록으로도 계산합니다. (countsForCheckCall · localCheckCall)
 *   한쪽을 고치면 다른 쪽도 같이 고쳐 주세요. 이 기기 계산은 테스트 로그인(시연)과 서버에 못 물었을 때 씁니다.
 * ■ 공부 기록은 보통 끝나고 10분 뒤에 서버로 갑니다(lib/sessionSync.ts). 그래서 서버에 묻기 전에 바로 보냅니다.
 */

/** 이만큼(분) 넘게 공부한 기록만 확인 통화의 공부로 칩니다. (BE CheckCall.MIN_STUDY_MINUTES 와 같음) */
export const MIN_CHECK_STUDY_MINUTES = 10

/** 방금 끝낸 공부 하나 */
export interface StudiedInfo {
  /** 카드 제목. 카드 없이 잰 옛 기록이면 null */
  title: string | null
  /** 순공시간 (분) */
  minutes: number
  /** 끝난 시각 */
  endedAt: number
}

/** 오늘 끝낸 공부를 확인한 결과 */
export interface CheckCallState {
  /** 오늘 가장 최근에 끝낸 공부. 없으면 null (그러면 보통 통화) */
  studied: StudiedInfo | null
  /**
   * 어디서 판정했는지
   *   server — 서버 기록으로 봄
   *   device — 서버에 묻지 못해서 이 기기 기록으로 봄
   *   demo   — 테스트 로그인(시연). 이 기기 기록으로 봄
   */
  source: 'server' | 'device' | 'demo'
}

/**
 * "오늘 끝낸 공부" 로 치는 기록인지. (BE CheckCall.counts 와 같은 규칙)
 *   - 공부 기록만 (노는 기록은 빼요)
 *   - 타이머 · 오프라인으로 잰 것만 (끝난 뒤 사후 입력은 빼요 — 앱이 잰 것이 아니라서)
 *   - 순공시간(끝 − 시작 − 일시정지)이 10분 이상 (1~2분 켰다 끈 것은 확인할 거리가 없어서)
 *
 *   타이머 40분 -> true · 타이머 5분 -> false · 사후 입력 60분 -> false
 */
export function countsForCheckCall(session: StudySession): boolean {
  if (session.kind === 'play' || session.mode === 'selfReport') return false
  // 서버처럼 분은 내림으로 셉니다. (9분 59초는 9분)
  return Math.floor(getStudyMs(session) / 60_000) >= MIN_CHECK_STUDY_MINUTES
}

/**
 * 이 기기 기록으로 본 오늘 끝낸 공부. 오늘(새벽 4시 기준) 시작한 기록 중 "끝낸 공부" 로 치는 가장 늦게 끝난 것 하나를 씁니다.
 *
 *   [19:00~19:40 타이머 '미적분' 40분, 20:00~20:05 타이머 5분] -> { studied: { title: '미적분', minutes: 40 } }
 *   [사후 입력 60분]                                              -> { studied: null }
 */
export function localCheckCall(
  sessions: StudySession[],
  cards: Card[],
  todayKey: string,
): { studied: StudiedInfo | null } {
  const latest = sessions
    .filter((session) => toDayKey(session.startedAt) === todayKey && countsForCheckCall(session))
    .sort((a, b) => b.endedAt - a.endedAt)[0]
  if (!latest) return { studied: null }
  const card = latest.cardId ? cards.find((item) => item.id === latest.cardId) : undefined
  return {
    studied: {
      title: card?.title ?? null,
      minutes: Math.floor(getStudyMs(latest) / 60_000),
      endedAt: latest.endedAt,
    },
  }
}

/** 서버가 준 응답을 확인합니다. 모양이 틀리면 null (서버 응답도 그대로 믿지 않고 확인합니다) */
export function readCheckCall(value: unknown): { studied: StudiedInfo | null } | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.open !== 'boolean') return null
  let studied: StudiedInfo | null = null
  if (typeof record.studied === 'object' && record.studied !== null) {
    const raw = record.studied as Record<string, unknown>
    if (typeof raw.minutes === 'number' && typeof raw.endedAt === 'number') {
      studied = {
        title: typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title.trim() : null,
        minutes: Math.max(0, Math.floor(raw.minutes)),
        endedAt: raw.endedAt,
      }
    }
  }
  return { studied }
}

/**
 * 방금 끝낸 공부 기록을 기다리지 않고 서버로 보냅니다.
 * 카드 세션은 그 카드가 서버에 먼저 있어야 받아 주므로 카드부터 보냅니다. (lib/sessionSync.ts)
 * 보내다 실패해도 던지지 않습니다. (그래도 서버에 묻기는 계속합니다)
 */
async function sendStudyNow(): Promise<void> {
  try {
    await pushPendingCards()
    await pushPendingSessions(0)
  } catch {
    // 실패해도 서버에 묻기는 계속합니다.
  }
}

/**
 * 오늘 끝낸 공부를 확인합니다. 통화는 결과와 상관없이 걸 수 있습니다.
 *   테스트 로그인: 이 기기 기록으로 봅니다. (서버에 기록이 없어서)
 *   진짜 로그인: 방금 공부한 기록을 먼저 보내고 서버에 묻습니다. 서버에 못 물으면 이 기기 기록으로 봅니다.
 */
export async function loadCheckCall(isServerData: boolean): Promise<CheckCallState> {
  const local = localCheckCall(loadAllSessions(), loadSavedCards() ?? [], getTodayKey())
  if (!isServerData) return { ...local, source: 'demo' }
  await sendStudyNow()
  let server: { studied: StudiedInfo | null } | null = null
  try {
    server = readCheckCall(await api<unknown>('/realtime/check-call'))
  } catch {
    server = null
  }
  // 서버에 못 물었으면(옛 서버 · 연결 끊김) 이 기기 기록으로 봅니다.
  if (server === null) return { studied: local.studied, source: 'device' }
  return {
    // 서버가 카드 제목을 모르면(카드 없이 잰 기록 등) 이 기기의 제목을 빌려 씁니다.
    studied:
      server.studied && server.studied.title === null && local.studied
        ? { ...server.studied, title: local.studied.title }
        : server.studied,
    source: 'server',
  }
}

/**
 * 통화 화면(/call)이 문을 확인하는 쿼리. 들어올 때마다 새로 확인합니다. (방금 공부를 끝냈을 수 있어서)
 * isServerData 는 진짜 로그인인지입니다. (hooks/useIsServerData)
 */
export function checkCallQuery(isServerData: boolean) {
  return queryOptions({
    queryKey: ['check-call', isServerData],
    queryFn: () => loadCheckCall(isServerData),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

// ---- 통화 요약 끝의 "이해도" (BE #327: 요약 끝에 '이해도: 조금 헷갈림' 처럼 한 번 붙음) ----

/** 확인 통화에서 코치가 말한 이해도 */
export type Understanding = '잘 이해함' | '조금 헷갈림' | '다시 보기 필요'

const UNDERSTANDING_PATTERN = /\s*이해도\s*[:：]\s*(잘 이해함|조금 헷갈림|다시 보기 필요)\.?\s*$/

/**
 * 통화 요약에서 이해도를 떼어 냅니다. 없으면 understanding 이 null 이고 요약은 그대로입니다.
 *
 *   splitUnderstanding('극한 정의를 설명했어. 이해도: 조금 헷갈림')
 *   -> { summary: '극한 정의를 설명했어.', understanding: '조금 헷갈림' }
 */
export function splitUnderstanding(summary: string): {
  summary: string
  understanding: Understanding | null
} {
  const match = summary.match(UNDERSTANDING_PATTERN)
  if (!match) return { summary, understanding: null }
  return {
    summary: summary.slice(0, match.index).trim(),
    understanding: match[1] as Understanding,
  }
}

/** 이해도 배지의 색 (같은 진하기로, 색만으로 구분하지 않게 글자를 같이 씀) */
export const UNDERSTANDING_COLORS: Record<Understanding, string> = {
  '잘 이해함': 'bg-emerald-100 text-emerald-800',
  '조금 헷갈림': 'bg-amber-100 text-amber-800',
  '다시 보기 필요': 'bg-rose-100 text-rose-800',
}
