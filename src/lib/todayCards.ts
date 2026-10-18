/**
 * 오늘 카드 중 "지금 할 카드 · 다음 카드 · 시간이 끝났는데 처리 안 한 카드" 를 고릅니다. (홈 「4.2」, #405)
 * 타이머 대기 화면(CardTimerPage)이 대기 목록을 만드는 규칙과 같습니다.
 * React 도 저장소도 쓰지 않는 순수 함수입니다.
 *
 *   - 오늘 한 카드(공부 기록이 있는 카드)와, 미루기 · 실패로 처리한 카드는 뺍니다.
 *   - 오늘을 쉰 날로 처리했으면 남은 카드가 없습니다.
 *   - 카드 시간이 끝났는데 시작도 처리도 안 했으면 '처리 안 한 카드' 입니다. (타이머에서 [미루기] / [실패로 기록])
 *   - 나머지 중 시작 시각이 지난 첫 카드가 '지금', 그 뒤 첫 카드가 '다음' 입니다. 시각이 없는 카드는 맨 뒤입니다.
 *   - 홈의 "오늘 계획" 목록(items)은 오늘 카드 전부를 시작 시각 순서로, 카드마다 상태를 붙여 돌려줍니다. (2026-10-18)
 */
import { getCardDayMark, isHandledOnDate, type CardDayMarkRecord } from '@/lib/cardMarks'
import { getCardResult } from '@/lib/cardResult'
import { getCardsOnDate } from '@/lib/cards'
import { toDayKey } from '@/lib/date'
import { getPlannedStartAt } from '@/lib/facts'
import { getSessionCardId } from '@/lib/sessionRecords'
import type { Card, StudySession } from '@/types'

export interface TodayCardsInput {
  /** 저장된 카드 전체 (오늘 하는 것만 여기서 고릅니다) */
  cards: Card[]
  /** 공부 기록 전체 */
  sessions: StudySession[]
  /** 미루기 · 실패 표시 (lib/cardMarks.ts) */
  marks: CardDayMarkRecord[]
  /** 오늘을 쉰 날로 처리했는지 (lib/restDays.ts) */
  isRestDay: boolean
  todayKey: string
  now: number
}

/**
 * 오늘 계획 목록에서 카드 한 장의 상태
 *   done      : 오늘 한 카드 (공부 기록이 있음)
 *   skipped   : 미루기 · 실패로 처리했거나, 오늘을 쉰 날로 처리함
 *   unhandled : 카드 시간이 끝났는데 시작도 처리도 안 함
 *   current   : 지금 할 카드
 *   waiting   : 아직 시간이 안 됐거나 시각이 없는 카드
 */
export type TodayCardStatus = 'done' | 'skipped' | 'unhandled' | 'current' | 'waiting'

export interface TodayCardItem {
  card: Card
  status: TodayCardStatus
}

export interface TodayCardsState {
  /** 오늘 하는 카드 수 */
  total: number
  /** 오늘 한 카드 수 (공부 기록이 있는 카드) */
  doneCount: number
  /** 시작 시각이 지났고 아직 카드 시간 안인 카드 — [시작] 을 크게 보여 줍니다 */
  current: Card | undefined
  /** 그다음에 할 카드 */
  next: Card | undefined
  /** 카드 시간이 끝났는데 시작도 처리도 안 한 카드 */
  unhandled: Card[]
  /** 오늘 카드 전부 (시작 시각 순서, 시각 없는 카드는 맨 뒤) + 카드마다 상태 */
  items: TodayCardItem[]
}

/**
 * 오늘 카드 상태를 계산합니다.
 *
 *   19:00 수학(60분) · 21:00 영어, 지금 19:20  -> current 수학, next 영어
 *   지금 18:00                                -> current 없음, next 수학
 *   수학은 오늘 함, 지금 19:20                 -> current 없음, next 영어, doneCount 1
 *   수학 카드 시간이 끝났고 기록·표시 없음      -> unhandled [수학]
 */
export function getTodayCardsState(input: TodayCardsInput): TodayCardsState {
  const todayCards = getCardsOnDate(input.cards, input.todayKey)
  const doneIds = new Set(
    input.sessions
      .filter(
        (session) => session.kind !== 'play' && toDayKey(session.startedAt) === input.todayKey,
      )
      .map((session) => getSessionCardId(session, {}))
      .filter((id): id is string => id !== undefined),
  )
  const open = input.isRestDay
    ? []
    : todayCards.filter(
        (card) =>
          !doneIds.has(card.id) &&
          !isHandledOnDate(
            card,
            getCardDayMark(input.marks, card.id, input.todayKey),
            input.todayKey,
          ),
      )
  const unhandled = open.filter(
    (card) =>
      getCardResult({ card, dateKey: input.todayKey, sessions: [] }, input.now) === 'unhandled',
  )
  const waiting = open.filter((card) => !unhandled.includes(card))

  // 시작 시각이 지난 카드(카드 시간 안)가 '지금', 아직 시각이 안 된 카드 · 시각 없는 카드가 '다음' 후보입니다.
  const isStarted = (card: Card) => {
    const startAt = getPlannedStartAt({ date: input.todayKey, startTime: card.startTime })
    return startAt !== null && startAt <= input.now
  }
  const current = waiting.find(isStarted)
  const next = waiting.find((card) => card !== current && !isStarted(card))

  // 카드 한 장의 상태를 위에서 고른 목록으로 정합니다. (한 카드 → 처리 안 함 → 지금 → 남은 카드 → 그 밖은 미룸 · 실패 · 쉰 날)
  function getStatus(card: Card): TodayCardStatus {
    if (doneIds.has(card.id)) return 'done'
    if (unhandled.includes(card)) return 'unhandled'
    if (card === current) return 'current'
    if (waiting.includes(card)) return 'waiting'
    return 'skipped'
  }

  return {
    total: todayCards.length,
    doneCount: todayCards.filter((card) => doneIds.has(card.id)).length,
    current,
    next,
    unhandled,
    items: todayCards.map((card) => ({ card, status: getStatus(card) })),
  }
}
