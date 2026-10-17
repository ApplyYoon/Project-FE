/**
 * 목표의 대처(WOOP 의 P)를 서버(GPT)에 보내 루틴 카드 2~3장을 제안받는 함수입니다. (FE#391, BE#239)
 * 아무것도 저장하지 않습니다. 학생이 고른 카드만 화면이 카드로 저장합니다. (원칙: 숫자는 코드가, 말은 AI 가)
 *
 * 서버와 정한 약속입니다. (BE 저장소의 docs/API.md "루틴 카드 제안") 로그인이 필요합니다.
 *   POST /ai/routine-cards  { goal, obstacle, plan, dDay, totalAmount, amountUnit }
 *     -> 200 { showHelp, cards: [{ title, repeatDays, startTime, durationMinutes, checklist: string[] }] | null }
 *   - AI 는 제목 · 체크리스트 · 시간대만 고르고, 요일 · 시작 시각 · 길이는 서버 코드가 정합니다.
 *   - 완주형이면 dDay · totalAmount · amountUnit 을 보내고, 하루 분량은 서버가 계산합니다.
 *   - cards 가 null 이면 AI 가 못 만든 것입니다(AI 꺼짐 · 하루 한도 · 실패). 화면은 기본 제안(lib/goals.ts)을 씁니다.
 *   - 위기 표현이 있으면 AI 를 부르지 않고 { showHelp: true, cards: null } 입니다. 화면은 도움 안내를 먼저 보여 줍니다.
 *   실패  400 목표·대처가 비었거나 너무 김 · 401 로그인 풀림
 */
import { ApiError, api } from '@/lib/api'
import type { Goal } from '@/types'

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 GPT 를 최대 10초 기다리므로 그보다 조금 더 줍니다. */
const REQUEST_TIMEOUT_MS = 15000

/** AI 가 제안한 루틴 카드 한 장 (아직 카드가 아닙니다. 고르면 lib/goals.ts 의 toRoutineCards 로 카드가 됩니다) */
export interface RoutineCardSuggestion {
  title: string
  /** 0 = 일요일 … 6 = 토요일 */
  repeatDays: number[]
  /** 'HH:MM' */
  startTime: string
  durationMinutes: number
  checklist: string[]
}

export interface RoutineCardsResult {
  /** true 면 글에 위기 표현이 있어서 AI 를 쓰지 않은 것입니다. 카드 대신 도움 안내를 보여 줍니다. */
  showHelp: boolean
  /** AI 가 만든 카드. 못 만들었으면 null (기본 제안을 씁니다) */
  cards: RoutineCardSuggestion[] | null
}

function isSuggestion(value: unknown): value is RoutineCardSuggestion {
  if (typeof value !== 'object' || value === null) return false
  const card = value as Record<string, unknown>
  return (
    typeof card.title === 'string' &&
    Array.isArray(card.repeatDays) &&
    card.repeatDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    typeof card.startTime === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(card.startTime) &&
    typeof card.durationMinutes === 'number' &&
    card.durationMinutes > 0 &&
    Array.isArray(card.checklist) &&
    card.checklist.every((item) => typeof item === 'string')
  )
}

/**
 * 만드는 중인 목표로 루틴 카드를 제안받습니다. 실패하면 ApiError 를 던집니다. (서버 응답 모양이 이상하면 502)
 *
 *   const { showHelp, cards } = await fetchRoutineCards(목표)
 */
export async function fetchRoutineCards(
  goal: Pick<Goal, 'title' | 'obstacle' | 'plan' | 'kind' | 'dDay' | 'totalAmount' | 'amountUnit'>,
): Promise<RoutineCardsResult> {
  const isCompletion = goal.kind === 'completion'
  const result = await api<unknown>('/ai/routine-cards', {
    method: 'POST',
    body: JSON.stringify({
      goal: goal.title,
      obstacle: goal.obstacle,
      plan: goal.plan,
      // 하루 분량은 서버가 계산하도록 완주형일 때만 분량을 보냅니다.
      dDay: isCompletion ? goal.dDay : null,
      totalAmount: isCompletion ? (goal.totalAmount ?? null) : null,
      amountUnit: isCompletion ? (goal.amountUnit ?? null) : null,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (typeof result !== 'object' || result === null) {
    throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  }
  const record = result as Record<string, unknown>
  const cards = record.cards
  const cardsOk = cards === null || (Array.isArray(cards) && cards.every(isSuggestion))
  if (typeof record.showHelp !== 'boolean' || !cardsOk) {
    throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  }
  return { showHelp: record.showHelp, cards: cards as RoutineCardSuggestion[] | null }
}
