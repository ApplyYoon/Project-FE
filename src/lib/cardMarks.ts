import type { CardDayMark } from '@/lib/cardResult'
import { isOneOffCard } from '@/lib/cards'
import { toReasonList } from '@/lib/reasons'
import { loadData, saveData } from '@/lib/storage'
import type { Card, MissReason } from '@/types'

/**
 * 미루기 · 실패 기록 (최종 기획서 「4.4 타이머」 미루기와 미실행, #400)
 *
 * - 미루려면 '왜 미루는지 + 어떻게 할지' 를 **100자 이상** 쓰고 새 시각을 정합니다 (의도된 마찰).
 * - 한도: 반복 카드는 카드별 **한 달 5회**(설정으로 3회 권장 가능), 1회성 카드는 **장당 2회**, 절대 카드는 미루기 없음.
 * - 실패는 원인 태그를 하나 이상 골라야 합니다(여러 개 가능, 2026-10-18). 미루기를 다 쓰면 [실패로 기록] 만 남습니다. **자동 삭제는 없습니다.**
 * 같은 규칙이 BE(Project-BE#225)에도 있습니다.
 */

/** 실패 원인 9개 — 옛 MissReason 7개 + '미루다 보니' (procrastinated). 순서대로 버튼이 보입니다 */
export type CardFailCause = MissReason | 'procrastinated'

export const CARD_FAIL_CAUSES: { key: CardFailCause; label: string }[] = [
  { key: 'tired', label: '피곤·수면' },
  { key: 'sick', label: '아픔' },
  { key: 'event', label: '행사·약속' },
  { key: 'tooMuch', label: '계획 과다' },
  { key: 'phone', label: '폰·SNS' },
  { key: 'unwilling', label: '하기 싫음' },
  { key: 'procrastinated', label: '미루다 보니' },
  { key: 'etc', label: '기타' },
]

/** 카드 하루치에 사람이 남긴 표시 한 개 */
export interface CardDayMarkRecord {
  cardId: string
  /** 그 카드를 하려던 날짜 ('YYYY-MM-DD') */
  dateKey: string
  mark: Exclude<CardDayMark, 'rest'>
  /** 남긴 시각 */
  at: number
  /** 미루기: 왜 미루는지 + 어떻게 할지 (100자 이상) */
  reason?: string
  /** 미루기: 새로 정한 날짜 · 시각 */
  newDate?: string
  newStartTime?: string
  /** 실패: 대표 원인 — 처음 고른 것. 서버(칸이 하나) · 하나만 읽는 예전 코드는 이 값을 씁니다 */
  cause?: CardFailCause
  /** 실패: 고른 원인 모두 (2026-10-18 여러 개 고르기). 읽을 때는 getMarkCauses */
  causes?: CardFailCause[]
}

/**
 * 실패 표시에 고른 원인 모두. 예전 기록(cause 하나)도 [하나] 로 돌려줍니다. (lib/reasons.ts)
 *
 *   getMarkCauses({ cause: 'tired', causes: ['tired', 'phone'] }) -> ['tired', 'phone']
 *   getMarkCauses({ cause: 'phone' })                             -> ['phone']
 */
export function getMarkCauses(mark: Pick<CardDayMarkRecord, 'cause' | 'causes'>): CardFailCause[] {
  return toReasonList(mark.causes, mark.cause)
}

/** 미루기 사유의 최소 글자 수 (앞뒤 빈칸을 뺀 글자 수) */
export const POSTPONE_REASON_MIN = 100
/** 1회성 카드 한 장의 미루기 한도 */
export const ONE_OFF_POSTPONE_LIMIT = 2

/**
 * 이 카드를 더 미룰 수 있는 횟수를 돌려줍니다. 0 이면 [실패로 기록] 만 남습니다.
 * - 절대 카드: 0 (미루기 없음)
 * - 반복 카드: 한 달 한도(routineMonthlyLimit, 기본 5) − 그 달(dateKey 의 달)에 미룬 횟수
 * - 1회성 카드: 2 − 그 카드를 지금까지 미룬 횟수
 *
 *   반복 카드, 10월에 3번 미룸, 한도 5     -> 2
 *   1회성 카드, 2번 미룸                    -> 0
 *   절대 카드                               -> 0
 */
export function getPostponeLeft(
  card: Pick<Card, 'id' | 'priority' | 'repeatDays'>,
  dateKey: string,
  marks: CardDayMarkRecord[],
  routineMonthlyLimit: number,
): number {
  if (card.priority === 'absolute') return 0
  const postponed = marks.filter((item) => item.cardId === card.id && item.mark === 'postponed')
  if (isOneOffCard(card)) return Math.max(0, ONE_OFF_POSTPONE_LIMIT - postponed.length)
  const month = dateKey.slice(0, 7)
  const thisMonth = postponed.filter((item) => item.dateKey.slice(0, 7) === month)
  return Math.max(0, routineMonthlyLimit - thisMonth.length)
}

/** 미루기 사유가 충분히 긴지 (앞뒤 빈칸을 뺀 글자 수가 100 이상) */
export function isPostponeReasonLongEnough(reason: string): boolean {
  return reason.trim().length >= POSTPONE_REASON_MIN
}

/** 그 카드 · 그 날짜에 남긴 마지막 표시 (판정 cardResult.ts 의 mark 로 넣습니다) */
export function getCardDayMark(
  marks: CardDayMarkRecord[],
  cardId: string,
  dateKey: string,
): CardDayMarkRecord | undefined {
  return marks.filter((item) => item.cardId === cardId && item.dateKey === dateKey).at(-1)
}

/**
 * 그날 할 카드 목록에서 뺄 카드인지 — 실패로 남겼거나, 다른 날(또는 새 카드)로 미룬 카드
 * 1회성 카드를 **같은 날 더 늦은 시각**으로 미루면 그 카드가 그대로 옮겨 간 것이라 빼지 않습니다.
 *
 *   실패 표시                             -> true
 *   1회성 카드를 내일로 미룸               -> true
 *   1회성 카드를 오늘 저녁으로 미룸        -> false (옮겨 간 그 카드를 오늘 해야 함)
 *   반복 카드를 오늘 저녁으로 미룸         -> true  (오늘 저녁 것은 새로 만든 1회성 카드)
 */
export function isHandledOnDate(
  card: Pick<Card, 'repeatDays'>,
  mark: CardDayMarkRecord | undefined,
  dateKey: string,
): boolean {
  if (!mark) return false
  if (mark.mark === 'failed') return true
  return !(isOneOffCard(card) && mark.newDate === dateKey)
}

/** "다들 미뤄", "원래 다 그래" 같은 허위 합의 표현 (「8.2」 허위 합의) */
const FALSE_CONSENSUS_WORDS = ['다들', '남들도', '원래다', '누구나', '모두그래', '다그래']

/**
 * 글에 허위 합의 표현이 있는지. 띄어쓰기는 지우고 봅니다.
 *
 *   hasFalseConsensus('다들 미루잖아') -> true    hasFalseConsensus('원래 다 그래') -> true    hasFalseConsensus('피곤해서') -> false
 */
export function hasFalseConsensus(text: string): boolean {
  const compact = text.replace(/\s/g, '')
  return FALSE_CONSENSUS_WORDS.some((word) => compact.includes(word))
}

/**
 * 이번 달(dateKey 의 달) 미룬 시간 합 (분). 허위 합의 표현이 나오면 "흔한 건 맞아. 근데 너한테 비용이 없는 건 아니야" 와 같이 보여 줍니다.
 */
export function getPostponedMinutesThisMonth(
  marks: CardDayMarkRecord[],
  cards: Pick<Card, 'id' | 'durationMinutes'>[],
  dateKey: string,
): number {
  const month = dateKey.slice(0, 7)
  return marks
    .filter((item) => item.mark === 'postponed' && item.dateKey.slice(0, 7) === month)
    .reduce(
      (sum, item) => sum + (cards.find((card) => card.id === item.cardId)?.durationMinutes ?? 0),
      0,
    )
}

/** 미룬 카드를 어떻게 놓을지 — 원래 카드를 고치거나(update) 새 카드를 만들거나(create) */
export type PlacedPostponedCard = { update: Pick<Card, 'date' | 'startTime'> } | { create: Card }

/** 지금 시각으로 placePostponedCard 를 부릅니다. (새 카드 id 와 만든 시각을 여기서 찍습니다) */
export function placePostponedCardNow(
  card: Card,
  newDate: string,
  newStartTime: string,
): PlacedPostponedCard {
  const now = Date.now()
  return placePostponedCard(card, newDate, newStartTime, `card-${now}`, now)
}

/**
 * 미룬 카드를 새 시각에 놓습니다.
 * - 1회성 카드: 그 카드의 날짜 · 시각을 바꿉니다 (카드는 그대로 한 장)
 * - 반복 카드: 그날 한 번만 옮기는 1회성 카드를 새로 만듭니다 (반복은 그대로)
 *
 *   1회성 카드 c1(10/17 19:00) → 10/18 20:00 -> { update: { date: '2026-10-18', startTime: '20:00' } }
 *   반복 카드 r1 → 10/18 20:00             -> { create: { id: 새 id, 제목 · 체크리스트 · 길이 그대로, 1회성 } }
 */
export function placePostponedCard(
  card: Card,
  newDate: string,
  newStartTime: string,
  newId: string,
  now: number,
): PlacedPostponedCard {
  if (isOneOffCard(card)) return { update: { date: newDate, startTime: newStartTime } }
  const { repeatDays: _repeatDays, ...rest } = card
  return {
    create: {
      ...rest,
      id: newId,
      date: newDate,
      startTime: newStartTime,
      checklist: card.checklist.map((item, index) => ({
        id: `${newId}-item-${index}`,
        text: item.text,
      })),
      createdAt: now,
    },
  }
}

// ── 저장 ── (실제 키는 'study-card-day-marks')
export const CARD_MARKS_KEY = 'card-day-marks'

/** 저장된 표시 목록. 모양이 틀린 것은 뺍니다 */
export function loadCardMarks(): CardDayMarkRecord[] {
  const saved = loadData<unknown>(CARD_MARKS_KEY, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(
    (item): item is CardDayMarkRecord =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as CardDayMarkRecord).cardId === 'string' &&
      typeof (item as CardDayMarkRecord).dateKey === 'string',
  )
}

/** 표시 하나를 지금 시각으로 덧붙여 저장하고, 새 목록을 돌려줍니다 */
export function addCardMark(mark: Omit<CardDayMarkRecord, 'at'>): CardDayMarkRecord[] {
  const next = [...loadCardMarks(), { ...mark, at: Date.now() }]
  saveData(CARD_MARKS_KEY, next)
  return next
}
