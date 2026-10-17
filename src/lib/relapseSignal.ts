import { isMissResult, type CardResult } from '@/lib/cardResult'
import { moveDateKey } from '@/lib/date'
import type { CardFailCause } from '@/lib/cardMarks'
import type { CardPriority } from '@/types'

/**
 * 재발 신호 (최종 기획서 「5.2 재발 신호」, #382)
 *
 * 카드 한 장 미실행 = **실수**: 기록만 하고 관리 단계는 움직이지 않습니다.
 * 아래 중 하나라도 맞으면 **재발 신호**입니다.
 *   ① 같은 루틴 카드 2회 연속 미실행 (미루기 또는 실패)
 *   ② 최근 7일 실행률이 개인 기준선(직전 14일)의 70% 미만
 *   ③ 절대 카드 미실행 1회
 * 한 번의 실수를 크게 다루면 "이미 망쳤으니"(될 대로 되라 효과)로 번지기 때문에 나눕니다 (Marlatt, Lally 2010).
 *
 * 고정 일정(학원)은 카드가 아니라서 처음부터 들어오지 않고, 휴식 처리한 날(result 'rest')은 여기서 뺍니다.
 * 같은 규칙이 BE(Project-BE#230)에도 있습니다.
 */

/** 재발 신호를 볼 때 넣는 카드 하루치 (cardResult.ts 로 판정이 끝난 것) */
export interface JudgedCardDay {
  cardId: string
  /** 'YYYY-MM-DD' */
  dateKey: string
  /** 반복(루틴) 카드인지 */
  isRoutine: boolean
  priority: CardPriority
  /** getCardResult 의 결과. 아직 판정 전(null)인 날은 넣지 않습니다 */
  result: CardResult
  /** getRunRate 의 값 (0 ~ 1). 미실행이면 0 */
  runRate: number
  /** 미실행일 때 고른 원인 태그. 아직 안 골랐으면 없음 */
  missReason?: CardFailCause
  /** cardResult.ts 의 isStartedOnTime 값. 시작하지 않았으면 없음 (의지력의 정시 시작 비율에 씀) */
  startedOnTime?: boolean
  /** 그 카드 · 그날 체크리스트 달성률 (0 ~ 1). 세션이 없으면 없음 (관리 단계의 '성공' 판정에 씀) */
  checklistRate?: number
}

/** 어느 조건 때문인지 — routineTwice: ①, rateDrop: ②, absoluteMiss: ③ */
export type RelapseReason = 'routineTwice' | 'rateDrop' | 'absoluteMiss'

export interface RelapseSignal {
  /** 재발 신호가 있는지 */
  hasSignal: boolean
  /** 맞은 조건들 */
  reasons: RelapseReason[]
  /** ① 에 걸린 루틴 카드 id */
  routineCardIds: string[]
  /** ② 계산에 쓴 최근 7일 · 기준선 실행률. 계산할 수 없으면 null */
  recentRate: number | null
  baselineRate: number | null
  /** 최근 7일 미실행 원인 중 가장 많은 것 (관리 단계 판정에 씀). 없으면 undefined */
  mainCause?: CardFailCause
}

/** ① 몇 번 연속이면 신호인지 */
export const ROUTINE_MISS_STREAK = 2
/** ② 최근 기간 · 기준선 기간 (일) */
export const RECENT_DAYS = 7
export const BASELINE_DAYS = 14
/** ② 기준선의 몇 % 밑이면 신호인지 */
export const RATE_DROP_RATIO = 0.7

/** 기간(from ~ to, 둘 다 포함) 카드들의 평균 실행률. 카드가 없으면 null */
function averageRunRate(days: JudgedCardDay[], from: string, to: string): number | null {
  const inRange = days.filter((day) => day.dateKey >= from && day.dateKey <= to)
  if (inRange.length === 0) return null
  return inRange.reduce((sum, day) => sum + day.runRate, 0) / inRange.length
}

/** 가장 많이 나온 원인. 수가 같으면 더 최근에 나온 것 */
function findMainCause(days: JudgedCardDay[]): CardFailCause | undefined {
  const counts = new Map<CardFailCause, { count: number; lastDate: string }>()
  for (const day of days) {
    if (!day.missReason) continue
    const prev = counts.get(day.missReason) ?? { count: 0, lastDate: '' }
    counts.set(day.missReason, {
      count: prev.count + 1,
      lastDate: day.dateKey > prev.lastDate ? day.dateKey : prev.lastDate,
    })
  }
  let best: { cause: CardFailCause; count: number; lastDate: string } | undefined
  for (const [cause, value] of counts) {
    const isBetter =
      best === undefined ||
      value.count > best.count ||
      (value.count === best.count && value.lastDate > best.lastDate)
    if (isBetter) best = { cause, ...value }
  }
  return best?.cause
}

/**
 * 재발 신호를 판정합니다. 매일 1번(통화 때) 부릅니다.
 *
 * - todayKey: 오늘 날짜
 * - sinceKey: 지난 판정 다음 날. ① · ③ 은 이날 이후의 미실행이 있을 때만 신호입니다
 *   (같은 일로 매일 다시 신호가 나지 않게). ② 는 기간 전체를 봅니다.
 * - ② 는 기록이 기준선 기간(14일)보다 짧으면 판정하지 않습니다.
 *
 * ■ 예시 (todayKey = sinceKey = '2026-10-17')
 *   루틴 카드 A: 10/15 실패, 10/17 미루기                       -> ① { reasons: ['routineTwice'], routineCardIds: ['A'] }
 *   루틴 카드 A: 10/15 실패, 10/17 실행                          -> 신호 없음 (연속 아님)
 *   루틴 카드 A: 10/13 실패, 10/15 실패 (sinceKey 10/17)         -> 신호 없음 (어제까지 판정한 일)
 *   절대 카드 B: 10/17 실패                                      -> ③ 'absoluteMiss'
 *   10/11~10/17 평균 실행률 0.5, 9/27~10/10 평균 0.8            -> ② 'rateDrop' (0.5 < 0.8 × 0.7 = 0.56)
 *   10/11~10/17 평균 실행률 0.6, 9/27~10/10 평균 0.8            -> 신호 없음 (0.6 ≥ 0.56)
 *   휴식(rest) 처리한 날은 어느 계산에도 안 들어갑니다
 */
export function getRelapseSignal(
  allDays: JudgedCardDay[],
  todayKey: string,
  sinceKey: string,
): RelapseSignal {
  const days = allDays.filter((day) => day.result !== 'rest' && day.dateKey <= todayKey)
  const reasons: RelapseReason[] = []

  // ① 루틴 카드마다 가장 최근 2번이 모두 미실행이고, 그중 최근 것이 sinceKey 이후
  const routineCardIds: string[] = []
  const routineIds = [...new Set(days.filter((day) => day.isRoutine).map((day) => day.cardId))]
  for (const cardId of routineIds) {
    const recent = days
      .filter((day) => day.cardId === cardId)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, ROUTINE_MISS_STREAK)
    const isStreak =
      recent.length === ROUTINE_MISS_STREAK && recent.every((day) => isMissResult(day.result))
    if (isStreak && recent[0].dateKey >= sinceKey) routineCardIds.push(cardId)
  }
  if (routineCardIds.length > 0) reasons.push('routineTwice')

  // ② 최근 7일 vs 직전 14일
  const recentFrom = moveDateKey(todayKey, -(RECENT_DAYS - 1))
  const baselineTo = moveDateKey(recentFrom, -1)
  const baselineFrom = moveDateKey(baselineTo, -(BASELINE_DAYS - 1))
  const firstDate = days.map((day) => day.dateKey).sort()[0]
  const hasBaseline = firstDate !== undefined && firstDate <= baselineFrom
  const recentRate = hasBaseline ? averageRunRate(days, recentFrom, todayKey) : null
  const baselineRate = hasBaseline ? averageRunRate(days, baselineFrom, baselineTo) : null
  if (
    recentRate !== null &&
    baselineRate !== null &&
    baselineRate > 0 &&
    recentRate < baselineRate * RATE_DROP_RATIO
  ) {
    reasons.push('rateDrop')
  }

  // ③ 절대 카드 미실행
  const absoluteMiss = days.some(
    (day) => day.priority === 'absolute' && isMissResult(day.result) && day.dateKey >= sinceKey,
  )
  if (absoluteMiss) reasons.push('absoluteMiss')

  const recentMisses = days.filter((day) => day.dateKey >= recentFrom && isMissResult(day.result))
  return {
    hasSignal: reasons.length > 0,
    reasons,
    routineCardIds,
    recentRate,
    baselineRate,
    mainCause: findMainCause(recentMisses),
  }
}
