/**
 * 분기 함수(decideCareAction, #91)에 넣을 재료를 앱에 저장된 기록에서 계산합니다. (#205)
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 재료 5개와 어디서 구하는지
 *   - 이행 판정(fulfillment)   기간이 끝난 개선안의 이행 기록(#65)으로 getSuggestionRate 를 부릅니다
 *   - 효과 판정(effect)        그 개선안의 실험 기간과 직전 2주를 비교하는 judgeExperiment(#92) 입니다
 *   - 미달 원인(mainMissCause)  오늘·어제 체크인에 적은 미달 원인(#26)
 *   - 기분(isMoodLow)          오늘·어제 체크인의 기분(#24)
 *   - 연속 미달 일수           공부 기록과 계획 (countConsecutiveMissDays)
 *
 * 기획서 4장 "실험 기간 중에는 바꾸지 않는다" 에 따라, 이행·효과 판정은 **실험 기간이 끝난** 개선안만 씁니다.
 * 기간이 끝난 개선안이 없으면 판정할 재료가 없어서 결정을 하지 않습니다. (null)
 */
import { decideCareAction, type CareDecision, type MissCause } from '@/lib/careDecision'
import { moveDateKey, toDayKey } from '@/lib/date'
import { getDaySummary } from '@/lib/daySummary'
import { judgeExperiment, type DayMetric, type ExperimentResult } from '@/lib/experimentJudge'
import { countConsecutiveMissDays } from '@/lib/goalAdjustInput'
import { getSuggestionRate, type SuggestionGrade } from '@/lib/suggestionRate'
import type { CheckIn, StudyPlan, StudySession, Suggestion, SuggestionCheck } from '@/types'

/** 기분이 이 점수 이하이면 "기분이 낮다" 로 봅니다. (체크인 기분 1~5, 안전 브레이크의 기준과 같습니다) */
export const LOW_MOOD_MAX = 2

/** 실험 효과를 비교할 기준선: 실험 시작 직전 며칠 (기획서: 직전 2주) */
export const BASELINE_DAYS = 14

/** 실험 시작일이 있는 진행 중 개선안 한 개 (시작일·기간이 확정된 것) */
export interface DatedSuggestion extends Suggestion {
  startDate: string
  days: number
}

export interface CareInputsSource {
  suggestions: Suggestion[]
  suggestionChecks: SuggestionCheck[]
  /** 날짜별 체크인 (날짜 → 체크인) */
  checkIns: Record<string, CheckIn>
  plans: StudyPlan[]
  sessions: StudySession[]
  /** 지금 시각. 안 넘기면 현재입니다. */
  today?: Date
}

export interface CareDecisionInputs {
  /** 이행 판정. 판단할 개선안이 없거나 기록이 없으면 null */
  fulfillment: SuggestionGrade | null
  /** 효과 판정. 판단할 개선안이 없으면 null */
  effect: ExperimentResult | null
  /** 주요 미달 원인. 없으면 null */
  mainMissCause: MissCause | null
  /** 최근 기분이 낮은지 */
  isMoodLow: boolean
}

/**
 * 실험 기간이 끝난 개선안 중, 가장 최근에 끝난 것 하나를 고릅니다. 없으면 null 입니다.
 *
 * 끝났다는 것: 오늘이 (시작일 + 기간) 이후입니다.
 *   예) 10/1 시작, 14일 → 10/14 까지가 실험 기간이라서, 10/15 부터 "끝난" 개선안입니다.
 * 도전 중(status 'active')이고 시작일·기간이 있는 개선안만 봅니다.
 */
export function pickFinishedSuggestion(
  suggestions: Suggestion[],
  today: Date = new Date(),
): DatedSuggestion | null {
  const todayKey = toDayKey(today)

  const finished = suggestions.flatMap((suggestion) => {
    if (suggestion.status !== 'active') return []
    if (suggestion.startDate === undefined || suggestion.days === undefined) return []
    const dated: DatedSuggestion = {
      ...suggestion,
      startDate: suggestion.startDate,
      days: suggestion.days,
    }
    // 'YYYY-MM-DD' 는 글자로 비교해도 날짜 순서와 같습니다.
    return todayKey >= moveDateKey(dated.startDate, dated.days) ? [dated] : []
  })

  if (finished.length === 0) return null
  // 끝난 날(시작일 + 기간)이 가장 늦은 것이 가장 최근에 끝난 개선안입니다.
  return finished.sort((a, b) =>
    moveDateKey(b.startDate, b.days).localeCompare(moveDateKey(a.startDate, a.days)),
  )[0]
}

/** startDate 부터 count 일 동안의 날짜('YYYY-MM-DD') 목록을 만듭니다. (count 가 음수면 거꾸로가 아니라 비어 있음) */
export function listDates(startDate: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => moveDateKey(startDate, index))
}

/**
 * 그 개선안의 이행 판정을 돌려줍니다. 실험 기간 안에 적은 이행 기록이 하나도 없으면 null 입니다.
 * (이행률 = 지킨 날 ÷ 실험 기간 전체 일수. 기록을 안 한 날은 못 지킨 날로 셉니다. suggestionRate.ts 참고)
 */
export function getFulfillmentGrade(
  suggestion: DatedSuggestion,
  suggestionChecks: SuggestionCheck[],
): SuggestionGrade | null {
  const periodDates = new Set(listDates(suggestion.startDate, suggestion.days))
  const kept = suggestionChecks
    .filter((check) => check.suggestionId === suggestion.id && periodDates.has(check.date))
    .map((check) => check.kept)

  return getSuggestionRate(kept, suggestion.days)?.grade ?? null
}

/**
 * 날짜들 중 "기록이 있는 날"만 골라, 그날의 순공시간·달성률로 바꿉니다.
 * 기록이 있는 날 = 공부 기록이 있거나 그날 계획이 있는 날. (아무 기록도 없는 날은 평균을 깎지 않게 뺍니다)
 */
function toDayMetrics(dates: string[], plans: StudyPlan[], sessions: StudySession[]): DayMetric[] {
  return dates.flatMap((date) => {
    const summary = getDaySummary(date, plans, sessions)
    const hasRecord = summary.studyMinutes > 0 || plans.some((plan) => plan.date === date)
    return hasRecord
      ? // 계획 없이 공부만 한 날(달성률 null)은 지금까지처럼 0 으로 넣습니다.
        [{ studyMinutes: summary.studyMinutes, achievementRate: summary.achievementRate ?? 0 }]
      : []
  })
}

/** 그 개선안의 효과를 판정합니다. 실험 기간과 직전 2주(기준선)를 비교합니다. (judgeExperiment, #92) */
export function getEffectResult(
  suggestion: DatedSuggestion,
  plans: StudyPlan[],
  sessions: StudySession[],
): ExperimentResult {
  const baselineStart = moveDateKey(suggestion.startDate, -BASELINE_DAYS)
  const baseline = toDayMetrics(listDates(baselineStart, BASELINE_DAYS), plans, sessions)
  const experiment = toDayMetrics(listDates(suggestion.startDate, suggestion.days), plans, sessions)
  return judgeExperiment(baseline, experiment)
}

/**
 * 오늘·어제 체크인 중 가장 최근 것을 돌려줍니다. 둘 다 없으면 null 입니다.
 * (체크인은 하루 한 번이라, 오늘 아직 안 했으면 어제 것을 봅니다)
 */
function findLatestCheckIn(checkIns: Record<string, CheckIn>, today: Date): CheckIn | null {
  const todayKey = toDayKey(today)
  return checkIns[todayKey] ?? checkIns[moveDateKey(todayKey, -1)] ?? null
}

/** 오늘·어제 체크인에서 주요 미달 원인을 꺼냅니다. 가장 최근 체크인에 적혀 있을 때만 씁니다. */
export function getMainMissCause(
  checkIns: Record<string, CheckIn>,
  today: Date = new Date(),
): MissCause | null {
  return findLatestCheckIn(checkIns, today)?.missReason ?? null
}

/** 가장 최근 체크인(오늘·어제)의 기분이 낮으면 true 입니다. 체크인이 없으면 false 입니다. */
export function isMoodLow(checkIns: Record<string, CheckIn>, today: Date = new Date()): boolean {
  const latest = findLatestCheckIn(checkIns, today)
  return latest !== null && latest.mood <= LOW_MOOD_MAX
}

/** 분기 함수에 넣을 재료를 모두 계산합니다. 기간이 끝난 개선안이 없으면 이행·효과는 null 입니다. */
export function getCareDecisionInputs(source: CareInputsSource): CareDecisionInputs {
  const today = source.today ?? new Date()
  const finished = pickFinishedSuggestion(source.suggestions, today)

  return {
    fulfillment: finished === null ? null : getFulfillmentGrade(finished, source.suggestionChecks),
    effect: finished === null ? null : getEffectResult(finished, source.plans, source.sessions),
    mainMissCause: getMainMissCause(source.checkIns, today),
    isMoodLow: isMoodLow(source.checkIns, today),
  }
}

/**
 * 오늘의 대응(행동과 이유)을 정합니다. 이행 판정을 모르면 null 입니다.
 * (decideCareAction 은 이행·효과 판정이 있어야 의미가 있어서, 없을 때는 부르지 않습니다)
 *
 * 이유(reason)는 decideCareAction 이 정한 한국어 한 줄이라, 화면에 그대로 보여줄 수 있습니다.
 */
export function getTodayCareDecision(source: CareInputsSource): CareDecision | null {
  const inputs = getCareDecisionInputs(source)
  if (inputs.fulfillment === null || inputs.effect === null) return null

  return decideCareAction({
    fulfillment: inputs.fulfillment,
    effect: inputs.effect,
    mainMissCause: inputs.mainMissCause,
    consecutiveMissDays: countConsecutiveMissDays(
      source.plans,
      source.sessions,
      source.today ?? new Date(),
    ),
    isMoodLow: inputs.isMoodLow,
  })
}
