/**
 * 목표 조정 제안(#67)에 필요한 재료를 공부 기록(계획 + 타이머 기록)에서 계산하는 함수들입니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 지금 계산할 수 있는 재료는 "연속 미달 일수" 와 "최근 평균 공부 시간" 뿐입니다.
 * 개선안 이행(fulfillment)·효과(effect)·기분·미달 원인은 저장하는 곳이 아직 없어서
 * getTodayCareAction 이 null 을 받으면 "아직 판단할 수 없음" 으로 보고 대응을 정하지 않습니다.
 */
import { decideCareAction, type CareAction, type MissCause } from '@/lib/careDecision'
import { toDateKey } from '@/lib/dailyRecords'
import { getDaySummary } from '@/lib/daySummary'
import type { ExperimentResult } from '@/lib/experimentJudge'
import type { SuggestionGrade } from '@/lib/suggestionRate'
import type { StudyPlan, StudySession } from '@/types'

// 최근 평균을 낼 때 거슬러 올라가 볼 일수입니다. (오늘은 빼고 어제부터 셉니다)
const RECENT_AVERAGE_DAYS = 7

// 연속 미달을 셀 때 최대로 거슬러 올라갈 일수입니다. (무한히 돌지 않게 하는 안전장치)
const MAX_MISS_LOOKBACK_DAYS = 30

/** 기준 날짜에서 n 일 전의 날짜('YYYY-MM-DD')를 돌려줍니다. */
function daysAgoKey(today: Date, n: number): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n)
  return toDateKey(date)
}

/**
 * 어제부터 최근 7일 중, 실제로 공부한 날들의 하루 평균 공부 시간(분)입니다.
 * 공부 기록이 하나도 없으면 null 입니다. (평균을 낼 근거가 없으니 낮추자는 제안도 하지 않습니다)
 *
 *   예) 어제 60분, 그저께 0분(안 함), 3일 전 100분 → (60 + 100) ÷ 2 = 80
 *
 * 공부 안 한 날을 평균에 넣으면 "쉬는 날이 많아서" 목표가 너무 낮아지므로 뺍니다.
 */
export function getRecentAverageMinutes(
  plans: StudyPlan[],
  sessions: StudySession[],
  today: Date = new Date(),
): number | null {
  let totalMinutes = 0
  let studiedDays = 0

  for (let n = 1; n <= RECENT_AVERAGE_DAYS; n += 1) {
    const { studyMinutes } = getDaySummary(daysAgoKey(today, n), plans, sessions)
    if (studyMinutes > 0) {
      totalMinutes += studyMinutes
      studiedDays += 1
    }
  }

  if (studiedDays === 0) return null
  return Math.round(totalMinutes / studiedDays)
}

/**
 * 어제부터 거슬러 올라가며, 계획을 못 채운 날이 연속으로 며칠인지 셉니다.
 *
 *   - 계획이 있었고 달성률이 100% 미만인 날 → 못 채운 날 (계속 셉니다)
 *   - 계획이 없던 날, 또는 100% 채운 날 → 여기서 멈춥니다
 *
 *   예) 어제 50%, 그저께 80%, 3일 전 100% → 2
 *   예) 어제 계획 없음 → 0
 */
export function countConsecutiveMissDays(
  plans: StudyPlan[],
  sessions: StudySession[],
  today: Date = new Date(),
): number {
  let missDays = 0

  for (let n = 1; n <= MAX_MISS_LOOKBACK_DAYS; n += 1) {
    const date = daysAgoKey(today, n)
    const hasPlan = plans.some((plan) => plan.date === date)
    if (!hasPlan) break

    const { achievementRate } = getDaySummary(date, plans, sessions)
    if (achievementRate >= 100) break

    missDays += 1
  }

  return missDays
}

export interface TodayCareInput {
  /** 개선안 이행 판정. 아직 저장하는 곳이 없으면 null */
  fulfillment: SuggestionGrade | null
  /** 개선안 효과 판정. 아직 저장하는 곳이 없으면 null */
  effect: ExperimentResult | null
  /** 주요 미달 원인. 모르면 null */
  mainMissCause: MissCause | null
  /** 최근 기분이 낮은지. 기분을 저장하는 곳이 아직 없으면 false */
  isMoodLow: boolean
  plans: StudyPlan[]
  sessions: StudySession[]
}

/**
 * 오늘의 대응(CareAction)을 정합니다. 이행·효과 판정을 모르면 null 을 돌려줍니다.
 * (decideCareAction 은 두 판정이 있어야 의미가 있어서, 없을 때는 부르지 않습니다)
 */
export function getTodayCareAction(input: TodayCareInput): CareAction | null {
  const { fulfillment, effect, mainMissCause, isMoodLow, plans, sessions } = input
  if (fulfillment === null || effect === null) return null

  return decideCareAction({
    fulfillment,
    effect,
    mainMissCause,
    consecutiveMissDays: countConsecutiveMissDays(plans, sessions),
    isMoodLow,
  }).action
}
