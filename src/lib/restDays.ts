import {
  getCardDayMark,
  getMarkCauses,
  loadCardMarks,
  type CardDayMarkRecord,
  type CardFailCause,
} from '@/lib/cardMarks'
import { moveDateKey } from '@/lib/date'
import { loadData, saveData } from '@/lib/storage'

/**
 * 휴식 처리 (최종 기획서 「4.5 상담」 휴식 처리, #407)
 *
 * - 미리 "오늘 쉴게" 는 없습니다. 불가항력(번아웃 · 아픔)으로 못 한 날을 **사후에** '휴식' 으로 처리합니다.
 * - **한 달 4회**까지. 휴식한 날의 카드는 실패 집계와 의지력 계산에서 빠지고, 달력에 다른 색으로 보입니다.
 * - 3일 연속이거나 한 달 한도를 넘으려 하면 회복 모드와 기분 저하 점검으로 넘깁니다.
 * 같은 규칙이 BE(Project-BE#225)에도 있습니다.
 */

export type RestReason = 'burnout' | 'sick' | 'etc'

export const REST_REASONS: { key: RestReason; label: string }[] = [
  { key: 'burnout', label: '너무 지쳤어요 (번아웃)' },
  { key: 'sick', label: '아팠어요' },
  { key: 'etc', label: '그 밖의 어쩔 수 없는 일' },
]

export interface RestDay {
  /** 쉰 날짜 ('YYYY-MM-DD') */
  date: string
  reason: RestReason
  /** 처리한 시각 */
  at: number
}

/** 한 달에 휴식으로 처리할 수 있는 날 수 */
export const MONTHLY_REST_LIMIT = 4
/** 며칠 연속 쉬면 회복 모드 · 기분 저하 점검으로 넘길지 */
export const REST_STREAK_FOR_RECOVERY = 3
/** 며칠 전까지 거슬러 휴식으로 처리할 수 있는지 (오늘 포함) */
export const REST_BACK_DAYS = 7

/** 그 달(dateKey 의 달)에 더 쉴 수 있는 날 수 */
export function getRestLeft(restDays: RestDay[], dateKey: string): number {
  const month = dateKey.slice(0, 7)
  return Math.max(
    0,
    MONTHLY_REST_LIMIT - restDays.filter((day) => day.date.slice(0, 7) === month).length,
  )
}

/**
 * 그 날짜를 휴식으로 처리할 수 있는지 — 오늘부터 7일 전까지, 아직 쉰 날이 아니고, 그 달 한도가 남았을 때
 *
 *   오늘 10/17, 10/16 처리 · 10월에 1번 쉼 -> true
 *   10/09 (8일 전)                        -> false
 *   10/18 (앞으로)                         -> false  (미리 쉬기는 없음)
 */
export function canMarkRest(restDays: RestDay[], dateKey: string, todayKey: string): boolean {
  if (dateKey > todayKey || dateKey < moveDateKey(todayKey, -(REST_BACK_DAYS - 1))) return false
  if (restDays.some((day) => day.date === dateKey)) return false
  return getRestLeft(restDays, dateKey) > 0
}

/**
 * 그 날짜까지 연속으로 쉰 날 수 (그 날짜 포함)
 *
 *   쉰 날 10/15 · 10/16 · 10/17, 기준 10/17 -> 3     쉰 날 10/15 · 10/17 -> 1
 */
export function getRestStreak(restDays: RestDay[], dateKey: string): number {
  const dates = new Set(restDays.map((day) => day.date))
  let streak = 0
  while (dates.has(moveDateKey(dateKey, -streak))) streak++
  return streak
}

/** 휴식을 처리한 뒤 회복 모드 · 기분 저하 점검으로 넘길지 (3일 연속이거나 이번 달 한도를 다 씀) */
export function needsRecoveryCheck(restDays: RestDay[], dateKey: string): boolean {
  return (
    getRestStreak(restDays, dateKey) >= REST_STREAK_FOR_RECOVERY ||
    getRestLeft(restDays, dateKey) === 0
  )
}

/** 카드 하루치에 남은 표시 — 휴식한 날이면 rest, 아니면 미루기 · 실패 표시 (달력 · 판정이 같이 씁니다) */
export interface CardDayMarkInfo {
  mark: 'rest' | 'postponed' | 'failed'
  /** 실패의 대표 원인 (처음 고른 것) */
  reason?: CardFailCause
  /** 실패에 고른 원인 모두 (여러 개 고르기, 2026-10-18) */
  reasons?: CardFailCause[]
}

/**
 * 그 카드 · 그 날짜의 표시를 하나로 돌려줍니다. 휴식한 날이 먼저입니다. (분석 탭 달력의 getMark 로 넘기면 됩니다)
 *
 *   10/17 을 쉰 날로 처리함                    -> { mark: 'rest' }
 *   10/17 에 그 카드를 '폰·SNS' 로 실패 기록함  -> { mark: 'failed', reason: 'phone', reasons: ['phone'] }
 *   아무 표시 없음                             -> undefined
 */
export function getCardDayMarkInfo(
  cardId: string,
  dateKey: string,
  restDays: RestDay[] = loadRestDays(),
  marks: CardDayMarkRecord[] = loadCardMarks(),
): CardDayMarkInfo | undefined {
  if (restDays.some((day) => day.date === dateKey)) return { mark: 'rest' }
  const mark = getCardDayMark(marks, cardId, dateKey)
  if (!mark) return undefined
  if (mark.mark !== 'failed') return { mark: 'postponed' }
  return { mark: 'failed', reason: mark.cause, reasons: getMarkCauses(mark) }
}

// ── 저장 ── (실제 키는 'study-rest-days')
export const REST_DAYS_KEY = 'rest-days'

export function loadRestDays(): RestDay[] {
  const saved = loadData<unknown>(REST_DAYS_KEY, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(
    (item): item is RestDay =>
      typeof item === 'object' && item !== null && typeof (item as RestDay).date === 'string',
  )
}

/** 그 날짜를 쉰 날로 지금 시각에 저장하고, 새 목록을 돌려줍니다 */
export function addRestDay(date: string, reason: RestReason): RestDay[] {
  const next = [...loadRestDays(), { date, reason, at: Date.now() }]
  saveData(REST_DAYS_KEY, next)
  return next
}
