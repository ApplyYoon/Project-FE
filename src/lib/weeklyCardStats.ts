import {
  getCardResult,
  getChecklistRate,
  getRunRate,
  isStartedOnTime,
  type CardDay,
  type CardResult,
} from '@/lib/cardResult'
import { getCardsOnDate } from '@/lib/cards'
import { moveDateKey, toDayKey } from '@/lib/date'
import { getPlannedStartAt } from '@/lib/facts'
import { getSessionCardId } from '@/lib/sessionRecords'
import { getStudyMs } from '@/lib/studyTime'
import type { Card, StudySession } from '@/types'

/**
 * 주간 리포트의 숫자 (최종 기획서 「4.6 분석」, #409)
 *
 * 한 주(월 ~ 일)의 카드 하루치를 cardResult.ts(#381)로 판정한 뒤 모아서 평균을 냅니다.
 * 숫자 3개(실행률 · 정시 시작 비율 · 체크리스트 달성률)는 모두 #381 의 함수 값입니다.
 */

const MS_PER_MINUTE = 60 * 1000

/** 판정이 끝난 카드 하루치. 인강/자습을 나누려고 카드 전체를 들고 있습니다 */
export interface WeekCardDay extends CardDay {
  card: Card
  result: CardResult
}

/**
 * 한 주(mondayKey 부터 7일)의 카드 하루치를 모아 판정합니다.
 * - 그날 하는 카드마다, 그 카드 · 그날 시작한 공부 세션을 붙입니다. (노는 기록은 뺍니다)
 * - 아직 판정할 수 없는 카드(카드 시간 전 · 하는 중)와 휴식(rest)은 모든 집계에서 뺍니다. (「5.1」)
 * - 미루기 · 실패 · 휴식 표시(mark)는 아직 저장하는 곳이 없어서 넣지 않습니다. (#400 · #407 에서 붙입니다)
 *
 * cardIdByPlanId: 옛 계획으로 켠 타이머 기록을 카드에 잇는 표 (lib/sessionRecords.ts 의 buildCardIdByPlanId)
 *
 *   카드 A(월 19:00 · 60분), 월 19:05 ~ 20:00 세션, 지금 = 화요일
 *   getWeekCardDays([A], sessions, '2026-10-12', now) -> [{ card: A, dateKey: '2026-10-12', result: 'done', … }]
 */
export function getWeekCardDays(
  cards: Card[],
  sessions: StudySession[],
  mondayKey: string,
  now: number,
  cardIdByPlanId: Record<string, string> = {},
): WeekCardDay[] {
  const days: WeekCardDay[] = []
  for (let offset = 0; offset < 7; offset++) {
    const dateKey = moveDateKey(mondayKey, offset)
    for (const card of getCardsOnDate(cards, dateKey)) {
      const cardSessions = sessions.filter(
        (session) =>
          session.kind !== 'play' &&
          toDayKey(session.startedAt) === dateKey &&
          getSessionCardId(session, cardIdByPlanId) === card.id,
      )
      const day = { card, dateKey, sessions: cardSessions }
      const result = getCardResult(day, now)
      if (result === null || result === 'rest') continue
      days.push({ ...day, result })
    }
  }
  return days
}

/** 한 주의 숫자 묶음. 계산할 수 없는 값은 0 이 아니라 null 입니다 ("0%" 와 "모름" 은 다릅니다) */
export interface WeeklyNumbers {
  /** 판정이 끝난 카드 수 */
  cardCount: number
  /** 실행률 평균 (%) — 미실행 카드는 0, 증빙 없는 사후 입력은 50 */
  runRate: number | null
  /** 정시 시작 비율 (%) — 시작한 카드 중 예정 시각 10분 안에 시작한 비율 */
  onTimeRate: number | null
  /** 정시 시작을 셀 수 있는 카드 수 (시작 시각이 있고 타이머로 시작한 카드) · 그중 정시에 시작한 수 */
  startedCount: number
  onTimeCount: number
  /** 체크리스트 달성률 평균 (%) — 세션이 있는 카드만 (시작도 안 한 카드는 계획 축이 아니라 실행 축 문제) */
  checklistRate: number | null
  /** 체크리스트 달성률을 계산한 카드 수 */
  checklistCount: number
  /** 평균 시작 지연 (분) — 일찍 시작하면 0분. 정시 시작을 셀 수 있는 카드만 */
  startDelayMinutes: number | null
  /** 강의(인강) 비율 (%) = 인강 카드 순공 ÷ (인강 + 자습 카드 순공) */
  lectureRatio: number | null
  /** 타이머로 잰 시간 · 끝난 뒤 적은(사후 입력) 시간 (분) */
  measuredMinutes: number
  selfReportMinutes: number
}

/** 0 ~ 1 값들의 평균을 % 로 (반올림). 값이 없으면 null */
function averagePercent(values: number[]): number | null {
  if (values.length === 0) return null
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.round(average * 100)
}

/** 타이머로 시작한 첫 시각. 사후 입력뿐이면 null */
function getFirstMeasuredStart(day: WeekCardDay): number | null {
  const measured = day.sessions.filter((session) => session.mode !== 'selfReport')
  if (measured.length === 0) return null
  return Math.min(...measured.map((session) => session.startedAt))
}

/**
 * 한 주의 카드 하루치로 숫자를 계산합니다.
 * 시간은 밀리초로 모두 더한 뒤 마지막에 한 번만 분으로 반올림합니다. (lib/dailyRecords.ts 와 같은 규칙)
 *
 *   카드 4장: 실행(정시, 실행률 1, 체크 3/3) · 지연(20분 늦음, 1, 2/4) · 중도 종료(정시, 0.5, 1/2) · 미처리(0)
 *   -> runRate 63 ((1 + 1 + 0.5 + 0) ÷ 4), onTimeRate 67 (3장 중 2장), checklistRate 67 ((1 + 0.5 + 0.5) ÷ 3)
 *   -> startDelayMinutes 7 ((0 + 20 + 0) ÷ 3)
 */
export function getWeeklyNumbers(days: WeekCardDay[]): WeeklyNumbers {
  const runRates = days.map((day) => getRunRate(day))

  const onTimeResults = days
    .map((day) => isStartedOnTime(day))
    .filter((value): value is boolean => value !== null)
  const onTimeCount = onTimeResults.filter((value) => value).length

  const checklistRates = days
    .filter((day) => day.sessions.length > 0)
    .map((day) => getChecklistRate(day))

  const delays: number[] = []
  for (const day of days) {
    const scheduledAt = getPlannedStartAt({ date: day.dateKey, startTime: day.card.startTime })
    const firstStart = getFirstMeasuredStart(day)
    if (scheduledAt === null || firstStart === null) continue
    // 일찍 시작한 날이 늦은 날을 지우지 않게 0분으로 칩니다. (lib/facts.ts 의 시작 지연과 같은 규칙)
    delays.push(Math.max(0, firstStart - scheduledAt))
  }

  let lectureMs = 0
  let selfStudyMs = 0
  let measuredMs = 0
  let selfReportMs = 0
  for (const day of days) {
    for (const session of day.sessions) {
      const studyMs = getStudyMs(session)
      if (day.card.type === 'lecture') lectureMs += studyMs
      else selfStudyMs += studyMs
      if (session.mode === 'selfReport') selfReportMs += studyMs
      else measuredMs += studyMs
    }
  }
  const studyMs = lectureMs + selfStudyMs

  return {
    cardCount: days.length,
    runRate: averagePercent(runRates),
    onTimeRate:
      onTimeResults.length === 0 ? null : Math.round((onTimeCount / onTimeResults.length) * 100),
    startedCount: onTimeResults.length,
    onTimeCount,
    checklistRate: averagePercent(checklistRates),
    checklistCount: checklistRates.length,
    startDelayMinutes:
      delays.length === 0
        ? null
        : Math.round(delays.reduce((sum, ms) => sum + ms, 0) / delays.length / MS_PER_MINUTE),
    lectureRatio: studyMs === 0 ? null : Math.round((lectureMs / studyMs) * 100),
    measuredMinutes: Math.round(measuredMs / MS_PER_MINUTE),
    selfReportMinutes: Math.round(selfReportMs / MS_PER_MINUTE),
  }
}
