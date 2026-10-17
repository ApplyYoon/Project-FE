import { getCardResult, getRunRate, type CardDayMark, type CardResult } from '@/lib/cardResult'
import { getCardsOnDate } from '@/lib/cards'
import { moveDateKey, toDayKey } from '@/lib/date'
import { getFixedBlocksOnDate } from '@/lib/fixedBlocks'
import { toDayMinutes } from '@/lib/planConflict'
import { getWeekday } from '@/lib/routines'
import { getSessionCardId } from '@/lib/sessionRecords'
import type { Card, FixedBlock, StudySession } from '@/types'

/**
 * 카드 탭의 일 · 주 타임라인(최종 기획서 「4.3 카드」, #394)에 쓰는 순수 함수들입니다.
 * 화면은 pages/CardsPage.tsx 의 CardTimeline 입니다.
 * 시각은 모두 "하루 시작(새벽 4시) 기준 분" 입니다. (lib/planConflict.ts 의 toDayMinutes)
 */

/** 타임라인 한 칸: 카드 또는 고정 일정(학교·학원) */
export type CardTimelineItem =
  | {
      kind: 'card'
      card: Card
      start: number
      end: number
      gapBeforeMinutes: number
      isOverlapping: boolean
    }
  | {
      kind: 'fixed'
      block: FixedBlock
      start: number
      end: number
      gapBeforeMinutes: number
      isOverlapping: boolean
    }

export interface DayTimeline {
  /** 시작 시각 순서로 놓은 카드 · 고정 일정 */
  items: CardTimelineItem[]
  /** 시작 시각이 없는 카드 (옛 계획에서 옮겨 온 카드 등) */
  unscheduled: Card[]
}

/**
 * 그 날짜의 카드와 고정 일정을 시작 시각 순서로 한 줄에 놓습니다.
 * 바로 앞 칸과의 빈 시간, 다른 칸과 겹치는지도 같이 셉니다. (끝과 시작이 딱 붙은 것은 겹침이 아닙니다)
 * 시작이 같으면 고정 일정이 먼저입니다.
 *
 *   카드 수학(19:00 · 60분), 카드 영어(19:30 · 30분), 고정 학원(17:00~18:50)
 *   getDayTimeline([수학, 영어], [학원], 날짜)
 *     -> items: [학원 (빈 0), 수학 (빈 10분, 겹침), 영어 (빈 0, 겹침)], unscheduled: []
 */
export function getDayTimeline(cards: Card[], blocks: FixedBlock[], dateKey: string): DayTimeline {
  const items: CardTimelineItem[] = []
  const unscheduled: Card[] = []

  for (const block of getFixedBlocksOnDate(blocks, dateKey)) {
    const start = toDayMinutes(block.startTime)
    const end = toDayMinutes(block.endTime)
    if (start === null || end === null) continue
    items.push({ kind: 'fixed', block, start, end, gapBeforeMinutes: 0, isOverlapping: false })
  }
  for (const card of getCardsOnDate(cards, dateKey)) {
    const start = toDayMinutes(card.startTime)
    if (start === null) {
      unscheduled.push(card)
      continue
    }
    const end = start + card.durationMinutes
    items.push({ kind: 'card', card, start, end, gapBeforeMinutes: 0, isOverlapping: false })
  }

  items.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    if (a.kind === b.kind) return 0
    return a.kind === 'fixed' ? -1 : 1
  })

  // 지금까지 놓은 칸 중 가장 늦게 끝나는 시각. 다음 칸의 빈 시간은 여기서부터 셉니다.
  let latestEnd: number | null = null
  for (const item of items) {
    item.gapBeforeMinutes = latestEnd === null ? 0 : Math.max(0, item.start - latestEnd)
    item.isOverlapping = items.some(
      (other) => other !== item && item.start < other.end && other.start < item.end,
    )
    latestEnd = latestEnd === null ? item.end : Math.max(latestEnd, item.end)
  }
  return { items, unscheduled }
}

/**
 * 시간이 겹친 칸 중에서 줄여 볼 만한 유연 카드를 돌려줍니다. 절대 카드는 그대로 둡니다. (「4.3」 "일정이 넘치면 유연 카드부터")
 *
 *   수학(유연)과 영어(절대)가 겹침   -> [수학]
 *   학원(고정)과 국어(유연)가 겹침   -> [국어]
 *   절대 카드 둘이 겹침              -> []   (줄일 유연 카드가 없음)
 *   겹친 칸 없음                     -> []
 */
export function getFlexibleCardsToShrink(items: CardTimelineItem[]): Card[] {
  const cards: Card[] = []
  for (const item of items) {
    if (item.kind === 'card' && item.isOverlapping && item.card.priority !== 'absolute') {
      cards.push(item.card)
    }
  }
  return cards
}

/**
 * 그 날짜가 들어 있는 주의 날짜 7개 (월요일부터 일요일까지)
 *
 *   getWeekDateKeys('2026-10-15') (목요일) -> ['2026-10-12', … , '2026-10-18']
 *   getWeekDateKeys('2026-10-18') (일요일) -> ['2026-10-12', … , '2026-10-18']
 */
export function getWeekDateKeys(dateKey: string): string[] {
  const weekday = getWeekday(dateKey)
  // 일요일(0)은 그 주의 마지막 날이라 6일 전이 월요일입니다.
  const monday = moveDateKey(dateKey, weekday === 0 ? -6 : 1 - weekday)
  return Array.from({ length: 7 }, (_, index) => moveDateKey(monday, index))
}

/**
 * 주 보기의 제목. 달이 바뀌는 주면 뒤쪽에도 달을 씁니다.
 *
 *   formatWeekLabel(['2026-10-12', …, '2026-10-18']) -> '10월 12일 ~ 18일'
 *   formatWeekLabel(['2026-10-26', …, '2026-11-01']) -> '10월 26일 ~ 11월 1일'
 */
export function formatWeekLabel(weekKeys: string[]): string {
  const [, firstMonth, firstDay] = weekKeys[0].split('-').map(Number)
  const [, lastMonth, lastDay] = weekKeys[weekKeys.length - 1].split('-').map(Number)
  const lastText = lastMonth === firstMonth ? `${lastDay}일` : `${lastMonth}월 ${lastDay}일`
  return `${firstMonth}월 ${firstDay}일 ~ ${lastText}`
}

/** 블록 높이: 1분 = 1px, 너무 짧거나 길면 이 사이로 맞춥니다 */
export const TIMELINE_MIN_BLOCK_PX = 48
export const TIMELINE_MAX_BLOCK_PX = 240

/**
 * 타임라인 블록의 최소 높이(px). 글자가 더 길면 블록이 늘어납니다.
 * 고정 일정은 길어도(학교 8시간) 화면을 덮지 않게 가장 작은 높이로 둡니다.
 *
 *   카드 60분 -> 60   카드 20분 -> 48   카드 300분 -> 240   고정 일정 -> 48
 */
export function getTimelineBlockHeight(item: CardTimelineItem): number {
  if (item.kind === 'fixed') return TIMELINE_MIN_BLOCK_PX
  const minutes = item.end - item.start
  return Math.min(TIMELINE_MAX_BLOCK_PX, Math.max(TIMELINE_MIN_BLOCK_PX, minutes))
}

/**
 * 하루 시작 기준 분을 'HH:MM' 으로 바꿉니다. 자정을 넘기면 다시 00:00 부터 셉니다.
 *
 *   formatDayClock(1140) -> '19:00'   formatDayClock(1470) -> '00:30'
 */
export function formatDayClock(dayMinutes: number): string {
  const minutes = dayMinutes % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** 블록에 붙일 그날의 결과와 실제로 한 시간 */
export interface CardDayStatus {
  /** 아직 판정할 수 없으면(시작 전 · 하는 중) null */
  result: CardResult | null
  /** 실제로 한 분 (실행률 × 계획 시간). 세션이 없으면 0 */
  doneMinutes: number
}

/**
 * 그 카드 · 그 날짜의 결과와 실제로 한 시간을 구합니다. 노는 기록은 뺍니다.
 *
 *   60분 카드, 그날 45분 공부, 카드 시간이 끝남 -> { result: 'endedEarly' 등, doneMinutes: 45 }
 *   아직 시작 전                                -> { result: null, doneMinutes: 0 }
 */
export function getCardDayStatus(
  card: Card,
  dateKey: string,
  sessions: StudySession[],
  now: number,
  mark?: CardDayMark,
): CardDayStatus {
  const daySessions = sessions.filter(
    (session) =>
      session.kind !== 'play' &&
      getSessionCardId(session, {}) === card.id &&
      toDayKey(session.startedAt) === dateKey,
  )
  const cardDay = { card, dateKey, sessions: daySessions, mark }
  const doneMinutes =
    daySessions.length > 0 ? Math.round(getRunRate(cardDay) * card.durationMinutes) : 0
  return { result: getCardResult(cardDay, now), doneMinutes }
}
