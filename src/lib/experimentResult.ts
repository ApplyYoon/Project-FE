/**
 * 개선안 실험의 "진행 상황" 과 "끝난 뒤 결과" 를 계산합니다. (#93, 기획서 v2 4장)
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 *   진행 중: "14일 중 5일째", 지금까지 이행률, 결과가 나오는 날
 *   끝난 뒤: 실험 전 2주와 실험 중의 첫 시작 시각·하루 순공·이행률 비교, 효과 판정(#92)
 *
 * 효과 판정과 이행 판정은 careInputs.ts 의 함수를 그대로 씁니다. (같은 기준으로 판단하려고)
 */
import { BASELINE_DAYS, getEffectResult, listDates, type DatedSuggestion } from '@/lib/careInputs'
import { moveDateKey, toDateKey } from '@/lib/date'
import { getDaySummary } from '@/lib/daySummary'
import type { ExperimentResult } from '@/lib/experimentJudge'
import { getSuggestionRate, type SuggestionRate } from '@/lib/suggestionRate'
import type { ManualItem, StudyPlan, StudySession, Suggestion, SuggestionCheck } from '@/types'

/**
 * 도전 중(status 'active')인 개선안을 "아직 진행 중" 과 "기간이 끝난" 것으로 나눕니다.
 * 시작일·기간이 없는 개선안은 어느 쪽에도 넣지 않습니다.
 *
 *   10/1 시작, 14일 → 10/14 까지가 실험 기간. 10/14 는 진행 중, 10/15 부터 "끝난" 것입니다.
 */
export function splitActiveExperiments(
  suggestions: Suggestion[],
  today: Date = new Date(),
): { ongoing: DatedSuggestion[]; finished: DatedSuggestion[] } {
  const todayKey = toDateKey(today)
  const ongoing: DatedSuggestion[] = []
  const finished: DatedSuggestion[] = []

  for (const suggestion of suggestions) {
    if (suggestion.status !== 'active') continue
    if (suggestion.startDate === undefined || suggestion.days === undefined) continue

    const dated: DatedSuggestion = {
      ...suggestion,
      startDate: suggestion.startDate,
      days: suggestion.days,
    }
    // 'YYYY-MM-DD' 는 글자로 비교해도 날짜 순서와 같습니다.
    if (todayKey >= moveDateKey(dated.startDate, dated.days)) finished.push(dated)
    else ongoing.push(dated)
  }

  return { ongoing, finished }
}

/** 한 기간(실험 전 2주 또는 실험 중)의 평균 지표 */
export interface PeriodStats {
  /** 기록이 있는 날 수 (공부 기록이 있거나 그날 계획이 있는 날) */
  recordedDays: number
  /** 기록이 있는 날의 하루 평균 순공시간 (분). 기록이 없으면 null */
  averageStudyMinutes: number | null
  /** 공부를 시작한 날들의 평균 첫 시작 시각 (그날 0시부터 몇 분). 시작한 날이 없으면 null */
  averageFirstStartMinutes: number | null
}

/** 날짜들의 평균 지표를 계산합니다. 기록이 없는 날은 평균을 깎지 않게 뺍니다. */
export function getPeriodStats(
  dates: string[],
  plans: StudyPlan[],
  sessions: StudySession[],
): PeriodStats {
  const studyMinutes: number[] = []
  const firstStartMinutes: number[] = []

  for (const date of dates) {
    const summary = getDaySummary(date, plans, sessions)
    const hasRecord = summary.studyMinutes > 0 || plans.some((plan) => plan.date === date)
    if (!hasRecord) continue

    studyMinutes.push(summary.studyMinutes)
    if (summary.firstStartAt !== null) {
      const first = new Date(summary.firstStartAt)
      firstStartMinutes.push(first.getHours() * 60 + first.getMinutes())
    }
  }

  const average = (values: number[]) =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

  return {
    recordedDays: studyMinutes.length,
    averageStudyMinutes: average(studyMinutes),
    averageFirstStartMinutes: average(firstStartMinutes),
  }
}

/** 그날 0시부터의 분을 '19:25' 처럼 보여줍니다. (소수는 반올림, 24시간을 넘지 않게 맞춥니다) */
export function formatClockMinutes(minutesOfDay: number): string {
  const total = Math.round(minutesOfDay) % (24 * 60)
  const hours = String(Math.floor(total / 60)).padStart(2, '0')
  const minutes = String(total % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** 끝난 실험의 결과 요약 */
export interface ExperimentSummary {
  /** 효과 판정 (#92) */
  result: ExperimentResult
  /** 실험 직전 2주 */
  baseline: PeriodStats
  /** 실험 중 */
  experiment: PeriodStats
  /** 이행률(%)과 판정. 실험 중 이행 기록이 하나도 없으면 null (이행률은 지킨 날 ÷ 실험 전체 일수) */
  fulfillment: SuggestionRate | null
}

/** 끝난 실험의 결과를 한꺼번에 계산합니다. */
export function summarizeExperiment(
  suggestion: DatedSuggestion,
  plans: StudyPlan[],
  sessions: StudySession[],
  suggestionChecks: SuggestionCheck[],
): ExperimentSummary {
  const baselineDates = listDates(moveDateKey(suggestion.startDate, -BASELINE_DAYS), BASELINE_DAYS)
  const experimentDates = listDates(suggestion.startDate, suggestion.days)

  const periodDates = new Set(experimentDates)
  const kept = suggestionChecks
    .filter((check) => check.suggestionId === suggestion.id && periodDates.has(check.date))
    .map((check) => check.kept)
  const rate = getSuggestionRate(kept, suggestion.days)

  return {
    result: getEffectResult(suggestion, plans, sessions),
    baseline: getPeriodStats(baselineDates, plans, sessions),
    experiment: getPeriodStats(experimentDates, plans, sessions),
    fulfillment: rate,
  }
}

/** 진행 중인 실험의 진행 상황 */
export interface ExperimentProgress {
  /** 실험 기간 전체 일수 */
  totalDays: number
  /** 오늘이 며칠째인지 (1부터. 아직 시작 전이면 0, 끝났으면 totalDays 로 맞춥니다) */
  dayIndex: number
  /** 결과가 나오는 날 ('YYYY-MM-DD'). 실험 마지막 날의 다음 날입니다. */
  resultDate: string
  /** 지금까지 "어제 지켰어?" 에 지켰다고 답한 날 수 */
  keptDays: number
  /** 이행률을 셀 수 있는 지난 날 수 (시작일부터 어제까지). 첫날이면 0 */
  elapsedDays: number
  /** 지금까지의 이행률(%). 아직 셀 날이 없으면 null */
  rate: number | null
}

/**
 * 진행 중인 실험이 지금 어디까지 왔는지 계산합니다.
 *
 *   10/1 시작, 14일, 오늘 10/5  → dayIndex 5, resultDate 10/15, elapsedDays 4
 *   그 사이 지켰다고 답한 날이 4일 → rate 100 (4 ÷ 4)
 *
 * 이행률은 "지난 날 중 지킨 날"로 셉니다. 마지막 결과 이행률(전체 일수 기준)과 달리, 진행 중에는
 * 아직 안 온 날을 못 지킨 날로 세면 초반에 늘 낮게 나와서 잘못 혼내게 되기 때문입니다.
 */
export function getExperimentProgress(
  suggestion: DatedSuggestion,
  suggestionChecks: SuggestionCheck[],
  today: Date = new Date(),
): ExperimentProgress {
  const todayKey = toDateKey(today)
  const resultDate = moveDateKey(suggestion.startDate, suggestion.days)

  // 시작일부터 오늘까지 며칠이 지났는지 날짜끼리 셉니다. (오늘이 시작일이면 1일째)
  const [startYear, startMonth, startDay] = suggestion.startDate.split('-').map(Number)
  const [year, month, day] = todayKey.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  const passed =
    Math.round(
      (new Date(year, month - 1, day).getTime() -
        new Date(startYear, startMonth - 1, startDay).getTime()) /
        msPerDay,
    ) + 1
  const dayIndex = Math.min(suggestion.days, Math.max(0, passed))

  // 어제까지의 날들 중 지킨 날을 셉니다.
  const elapsedDays = Math.min(suggestion.days, Math.max(0, passed - 1))
  const countedDates = new Set(listDates(suggestion.startDate, elapsedDays))
  const keptDays = suggestionChecks.filter(
    (check) => check.suggestionId === suggestion.id && check.kept && countedDates.has(check.date),
  ).length

  return {
    totalDays: suggestion.days,
    dayIndex,
    resultDate,
    keptDays,
    elapsedDays,
    rate: elapsedDays === 0 ? null : Math.round((keptDays / elapsedDays) * 100),
  }
}

/**
 * 효과가 확인된 실험을 "나 사용설명서" 항목으로 바꿉니다. (#87)
 *
 *   제목: '만약 공부를 시작하면 → 폰은 다른 방에 둔다'
 *   근거: '14일 실험: 하루 순공 +35분' (기록이 모자라 숫자를 못 비교하면 '14일 실험으로 효과 확인')
 *
 * id 는 개선안 id 로 만들어서, 같은 개선안을 두 번 올려도 한 항목만 남게 합니다.
 */
export function buildManualItem(
  suggestion: DatedSuggestion,
  summary: ExperimentSummary,
  today: Date = new Date(),
): ManualItem {
  const baselineMinutes = summary.baseline.averageStudyMinutes
  const experimentMinutes = summary.experiment.averageStudyMinutes

  let evidence = `${suggestion.days}일 실험으로 효과 확인`
  if (baselineMinutes !== null && experimentMinutes !== null) {
    const diff = Math.round(experimentMinutes - baselineMinutes)
    const sign = diff > 0 ? '+' : diff < 0 ? '-' : ''
    evidence = `${suggestion.days}일 실험: 하루 순공 ${sign}${Math.abs(diff)}분`
  }

  return {
    id: `manual-${suggestion.id}`,
    category: 'effectiveMethod',
    title: `만약 ${suggestion.ifText} → ${suggestion.thenText}`,
    confirmedDate: toDateKey(today),
    evidence,
  }
}
