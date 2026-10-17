import type { CardFailCause } from '@/lib/cardMarks'
import { moveDateKey } from '@/lib/date'
import type { JudgedCardDay } from '@/lib/relapseSignal'
import { loadData, saveData } from '@/lib/storage'

/**
 * 자기 실험 (최종 기획서 「4.6 분석」 자기 실험, #412)
 *
 * 가설 → 전략 3개(쉬움 · 보통 · 강함) 중 1개 → 관련 카드에 '실험 규칙' 으로 붙임(새 카드가 아님, 14일)
 * → 시작 전에 **그만둘 기준**을 정함(기본: 기준선보다 실행률이 10%p 넘게 오르지 않으면 효과 없음)
 * → 판정일에는 미리 정한 기준만 확인 → 효과가 있으면 나 사용설명서와 나무 열매.
 * '지켰어?' 를 묻지 않고, 붙인 카드의 기록으로 판정합니다. 같은 규칙이 BE(Project-BE#52~#54)에도 있습니다.
 */

/** 실험 기간 (일) */
export const EXPERIMENT_DAYS = 14
/** 기본 그만둘 기준 — 기준선보다 실행률이 이만큼(%p) 넘게 올라야 효과 있음 */
export const DEFAULT_MIN_GAIN_PP = 10
/** 판정에 필요한 카드 하루치 수 (기준선 · 실험 각각). 모자라면 '알 수 없음' */
export const MIN_SAMPLES = 5

export type ExperimentStatus = 'running' | 'effective' | 'noEffect' | 'unclear'

export interface Experiment {
  id: string
  /** 가설 한 줄 (예: '폰·SNS 때문에 놓치는 날이 많다') */
  hypothesis: string
  /** 가설의 원인 */
  cause?: CardFailCause
  /** 고른 전략 (strategyCatalog.ts 의 id) */
  strategyId: string
  /** 실험 규칙을 붙인 카드 */
  cardIds: string[]
  /** 시작한 날 ('YYYY-MM-DD') — 이날부터 14일 */
  startDate: string
  /** 그만둘 기준 (%p) — 시작 전에 정하고 바꾸지 않습니다 (매몰 비용 대응) */
  minGainPp: number
  status: ExperimentStatus
  /** 판정 때 계산한 실행률 (0 ~ 1) */
  baselineRate?: number
  experimentRate?: number
}

/** 실험이 끝나는 날 (마지막 날) */
export function getExperimentEndDate(experiment: Pick<Experiment, 'startDate'>): string {
  return moveDateKey(experiment.startDate, EXPERIMENT_DAYS - 1)
}

/** 며칠째인지 (시작한 날 = 1) */
export function getExperimentDay(
  experiment: Pick<Experiment, 'startDate'>,
  todayKey: string,
): number {
  let day = 1
  while (moveDateKey(experiment.startDate, day - 1) < todayKey && day <= EXPERIMENT_DAYS) day++
  return day
}

function averageRate(days: JudgedCardDay[]): number | null {
  const counted = days.filter((day) => day.result !== 'rest')
  if (counted.length < MIN_SAMPLES) return null
  return counted.reduce((sum, day) => sum + day.runRate, 0) / counted.length
}

/**
 * 실험을 판정합니다. 붙인 카드만, 기준선(시작 전 14일) vs 실험 기간(14일)의 평균 실행률을 비교합니다.
 * - 둘 중 하나라도 카드 하루치가 5개보다 적으면 unclear
 * - (실험 − 기준선) 이 그만둘 기준(%p)보다 크면 effective, 아니면 noEffect
 *
 *   기준선 0.50, 실험 0.70, 기준 10%p  -> effective (+20%p)
 *   기준선 0.50, 실험 0.58, 기준 10%p  -> noEffect  (+8%p)
 *   실험 기간 카드 3개뿐               -> unclear
 */
export function judgeExperiment(
  experiment: Pick<Experiment, 'cardIds' | 'startDate' | 'minGainPp'>,
  allDays: JudgedCardDay[],
): {
  status: Exclude<ExperimentStatus, 'running'>
  baselineRate: number | null
  experimentRate: number | null
} {
  const cardIds = new Set(experiment.cardIds)
  const days = allDays.filter((day) => cardIds.has(day.cardId))
  const baselineFrom = moveDateKey(experiment.startDate, -EXPERIMENT_DAYS)
  const baselineTo = moveDateKey(experiment.startDate, -1)
  const end = getExperimentEndDate(experiment)
  const baselineRate = averageRate(
    days.filter((day) => day.dateKey >= baselineFrom && day.dateKey <= baselineTo),
  )
  const experimentRate = averageRate(
    days.filter((day) => day.dateKey >= experiment.startDate && day.dateKey <= end),
  )
  if (baselineRate === null || experimentRate === null)
    return { status: 'unclear', baselineRate, experimentRate }
  const gainPp = (experimentRate - baselineRate) * 100
  return {
    status: gainPp > experiment.minGainPp ? 'effective' : 'noEffect',
    baselineRate,
    experimentRate,
  }
}

/** 판정할 날이 됐는지 (실험 마지막 날 다음 날부터) */
export function isJudgeDay(experiment: Pick<Experiment, 'startDate'>, todayKey: string): boolean {
  return todayKey > getExperimentEndDate(experiment)
}

/** 그 카드에 지금 붙어 있는 실험 규칙 (진행 중인 실험) */
export function getRunningExperimentFor(
  experiments: Experiment[],
  cardId: string,
): Experiment | undefined {
  return experiments.find((item) => item.status === 'running' && item.cardIds.includes(cardId))
}

// ── 저장 ── (실제 키는 'study-experiments')
const EXPERIMENTS_KEY = 'experiments'

export function loadExperiments(): Experiment[] {
  const saved = loadData<unknown>(EXPERIMENTS_KEY, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(
    (item): item is Experiment =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Experiment).id === 'string' &&
      Array.isArray((item as Experiment).cardIds),
  )
}

export function saveExperiments(experiments: Experiment[]): void {
  saveData(EXPERIMENTS_KEY, experiments)
}

/** 새 실험을 지금 시각 id 로 만듭니다 */
export function createExperimentNow(
  input: Omit<Experiment, 'id' | 'status' | 'minGainPp'> & { minGainPp?: number },
): Experiment {
  return {
    ...input,
    id: `experiment-${Date.now()}`,
    status: 'running',
    minGainPp: input.minGainPp ?? DEFAULT_MIN_GAIN_PP,
  }
}
