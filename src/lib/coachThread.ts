/**
 * AI 코치(멘토)와의 대화방을 **이 기기에만** 남기는 곳입니다. (2026-10-18 사용자 결정)
 *   "채팅 탭은 무조건 하나" · "멘토와 연속적인 대화를 한다는 느낌으로"
 *
 * - 대화방은 하나이고, 다시 열면 지난 대화가 이어서 보입니다. 날이 바뀌면 날짜 구분선 아래로 그날 대화가 이어집니다.
 * - 서버에는 대화를 저장하지 않습니다. (lib/chatApi.ts) 이 기기에 최근 14일 · 말풍선 300개까지만 둡니다.
 * - 설정의 "모든 기록 지우기" 가 같이 지웁니다. (lib/myData.ts 의 'coach-thread')
 * - 다른 사람이 로그인하면 빈 대화방에서 시작합니다. (ownerId)
 *
 * 서버 채팅은 하루 단위 "세션" 으로 엽니다. 대화방은 이어지지만, 서버에 보내는 대화는 지금 세션의 말풍선만입니다.
 * 날이 바뀌었거나 오래 쉬었거나 길어지면 새 세션을 엽니다. 앞 세션은 조용히 정리해서(POST /calls/{id}/finish)
 * 요약을 남기고, 그 요약이 다음 세션 대본의 [지난 통화] 가 되어 AI 가 이어서 기억합니다. (pages/CoachPage.tsx)
 */
import type { CallLine } from '@/lib/callReview'
import { MAX_CHAT_LINES } from '@/lib/chatApi'
import type { CoachChip } from '@/lib/coachBriefing'
import { toDayKey } from '@/lib/date'
import { loadData, saveData } from '@/lib/storage'

/** 대화방의 말풍선 하나 */
export interface ThreadBubble {
  id: number
  speaker: 'ai' | 'me'
  text: string
  /** 말한 시각 (Date.now() 값). 날짜 구분선을 그리는 데 씁니다. */
  at: number
  /** 코치 말풍선 아래의 빠른 답 칩. 가장 마지막 코치 말풍선의 칩만 보입니다. */
  chips?: CoachChip[]
  /** true 면 테스트 로그인용 "시연용 정해진 답" 입니다. (AI 가 쓴 말이 아님) */
  isDemo?: boolean
}

/** 이 기기에 남기는 대화방 */
export interface CoachThread {
  /** 대화방 주인 (로그인한 사람 번호) */
  ownerId: string
  bubbles: ThreadBubble[]
  /** 지금 열려 있는 서버 채팅 번호. 없으면 null (학생이 말할 때 처음 엽니다) */
  chatId: string | null
  /** 이 번호의 말풍선부터 끝까지가 지금 서버 세션의 대화입니다. */
  sessionFrom: number
  /** 마지막으로 서버와 주고받은 시각. 없으면 null */
  lastServerAt: number | null
  /** 위기 표현이 감지돼서 상담 전화 한 줄을 보여 주는 중인지 */
  isHelpShown: boolean
}

/** 며칠 치 대화를 남길지 */
export const THREAD_KEEP_DAYS = 14
/** 말풍선을 몇 개까지 남길지 */
export const THREAD_MAX_BUBBLES = 300
/**
 * 서버와 마지막으로 주고받은 지 이만큼 지나면 새 세션을 엽니다.
 * 서버가 대본을 2시간 기억해서(BE ChatScriptStore), 그보다 조금 짧게 잡습니다.
 */
export const SESSION_IDLE_MS = 100 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000
// 저장소에 넣는 이름 (실제 키는 'study-coach-thread')
const STORAGE_KEY = 'coach-thread'

const CHIP_KINDS = ['say', 'startCard', 'startMinutes', 'newCard', 'checkIn', 'startTitled']

/** 빈 대화방 */
export function emptyThread(ownerId: string): CoachThread {
  return {
    ownerId,
    bubbles: [],
    chatId: null,
    sessionFrom: 1,
    lastServerAt: null,
    isHelpShown: false,
  }
}

/** 저장소에서 꺼낸 칩이 쓸 수 있는 모양인지 (이상한 칩은 버립니다) */
function isChip(value: unknown): value is CoachChip {
  if (typeof value !== 'object' || value === null) return false
  const chip = value as Record<string, unknown>
  if (typeof chip.label !== 'string' || !CHIP_KINDS.includes(chip.kind as string)) return false
  if (chip.kind === 'startCard') return typeof chip.cardId === 'string'
  if (chip.kind === 'startMinutes') return typeof chip.minutes === 'number'
  if (chip.kind === 'checkIn')
    return typeof chip.condition === 'number' && Array.isArray(chip.emotions)
  if (chip.kind === 'startTitled')
    return typeof chip.title === 'string' && typeof chip.minutes === 'number'
  return true
}

function toBubble(value: unknown): ThreadBubble | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'number' || typeof item.text !== 'string' || typeof item.at !== 'number') {
    return null
  }
  if (item.speaker !== 'ai' && item.speaker !== 'me') return null
  const bubble: ThreadBubble = { id: item.id, speaker: item.speaker, text: item.text, at: item.at }
  if (Array.isArray(item.chips)) bubble.chips = item.chips.filter(isChip)
  if (item.isDemo === true) bubble.isDemo = true
  return bubble
}

/** 이 기기의 대화방. 없거나 다른 사람 것이거나 깨져 있으면 빈 대화방입니다. */
export function loadCoachThread(ownerId: string): CoachThread {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return emptyThread(ownerId)
  const record = saved as Record<string, unknown>
  if (record.ownerId !== ownerId || !Array.isArray(record.bubbles)) return emptyThread(ownerId)
  return {
    ownerId,
    bubbles: record.bubbles.map(toBubble).filter((bubble) => bubble !== null),
    chatId: typeof record.chatId === 'string' ? record.chatId : null,
    sessionFrom: typeof record.sessionFrom === 'number' ? record.sessionFrom : 1,
    lastServerAt: typeof record.lastServerAt === 'number' ? record.lastServerAt : null,
    isHelpShown: record.isHelpShown === true,
  }
}

/** 대화방을 저장합니다. 14일보다 오래된 말풍선과, 300개를 넘는 앞쪽 말풍선은 버립니다. */
export function saveCoachThread(thread: CoachThread, now: number): void {
  const recent = thread.bubbles.filter((bubble) => now - bubble.at <= THREAD_KEEP_DAYS * DAY_MS)
  saveData(STORAGE_KEY, { ...thread, bubbles: recent.slice(-THREAD_MAX_BUBBLES) })
}

/** 다음 말풍선 번호 */
export function nextBubbleId(bubbles: ThreadBubble[]): number {
  return bubbles.reduce((max, bubble) => Math.max(max, bubble.id), 0) + 1
}

/** 지금 서버 세션의 대화 줄 (sessionFrom 번호부터 끝까지). 서버에는 말 · 사람만 보냅니다. */
export function sessionLines(thread: CoachThread): CallLine[] {
  return thread.bubbles
    .filter((bubble) => bubble.id >= thread.sessionFrom)
    .map(({ speaker, text }) => ({ speaker, text }))
}

/**
 * 열려 있는 서버 세션을 닫고 새로 열어야 하는지.
 *   - 마지막으로 주고받은 날과 오늘이 다름 (하루의 기준은 새벽 4시)
 *   - 100분 넘게 쉼 (서버가 대본을 잊기 전)
 *   - 서버가 받는 줄 수(60)에 거의 닿음
 */
export function needsNewSession(thread: CoachThread, now: number): boolean {
  if (thread.chatId === null) return false
  if (thread.lastServerAt === null) return true
  if (toDayKey(thread.lastServerAt) !== toDayKey(now)) return true
  if (now - thread.lastServerAt > SESSION_IDLE_MS) return true
  return sessionLines(thread).length >= MAX_CHAT_LINES - 2
}

/** 세션 줄에 학생이 한 말이 있는지 (없으면 정리할 것이 없습니다) */
export function hasStudentLine(lines: CallLine[]): boolean {
  return lines.some((line) => line.speaker === 'me')
}

/**
 * 새 세션이 시작될 말풍선 번호. 방금 쓴 내 말 바로 앞의 코치 말부터 보내서, AI 가 무엇에 대한 답인지 알게 합니다.
 *   [... 코치(12) · 나(13)] -> 12
 */
export function newSessionStart(bubbles: ThreadBubble[]): number {
  const last = bubbles[bubbles.length - 1]
  const previous = bubbles[bubbles.length - 2]
  return previous && previous.speaker === 'ai' ? previous.id : (last?.id ?? 1)
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 날짜 구분선의 글자. 하루의 기준(새벽 4시)으로 정합니다.
 *   dayLabel(2026-10-18 오후) -> '10월 18일 일요일'
 */
export function dayLabel(at: number): string {
  const [year, month, day] = toDayKey(at).split('-').map(Number)
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()]
  return `${month}월 ${day}일 ${weekday}요일`
}
