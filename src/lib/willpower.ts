import { isMissResult } from '@/lib/cardResult'
import type { JudgedCardDay } from '@/lib/relapseSignal'
import type { CareLevel } from '@/types'

/**
 * 의지력 지수 (최종 기획서 「5.3 의지력 지수」, #384)
 *
 * 0 ~ 100 의 **내부 값**입니다. 어떤 화면에도 숫자로 보여 주지 않습니다.
 * "의지력 42점" 같은 점수는 낙인(6번 오류)이 되기 때문입니다. 관리 단계를 정하는 데만 씁니다.
 *
 *   의지력(데이터) = 50 × 평균 실행률 + 30 × 정시 시작 비율 + 20 × (1 − 미루기·실패 비율)   ← 최근 14일, 자습·인강 카드만
 *   의지력(검사)   = (7 − 시작 저항·주의 분산·실패 민감도의 평균) ÷ 6 × 100              ← 온보딩 심리검사(1~7점)
 *   의지력         = w × 데이터 + (1 − w) × 검사,  w = min(유효 카드일 수 ÷ 14, 1)
 *
 * 같은 계산이 BE(Project-BE#231)에도 있습니다.
 */

/** 데이터로 완전히 넘어가는 데 걸리는 유효 카드일 수 */
export const WILLPOWER_DATA_DAYS = 14

/** 검사 점수 중 의지력에 쓰는 세 척도 (1 ~ 7). lib/psychTest.ts 의 scores 에서 꺼내 넣습니다 */
export interface WillpowerTestScores {
  startResistance: number
  distraction: number
  failSensitivity: number
}

/**
 * 최근 14일 카드 기록으로 의지력(데이터)을 구합니다. 카드가 하나도 없으면 null 입니다.
 * 휴식(rest)한 날은 넣지 않고 들어와도 뺍니다. 고정 일정(학원)은 카드가 아니라 처음부터 없습니다.
 *
 * - 평균 실행률: 카드마다 runRate 의 평균 (미실행 0, 증빙 없는 자기 보고 0.5)
 * - 정시 시작 비율: 시작한 카드 중 예정 시각 10분 안에 시작한 비율. 시작한 카드가 없으면 0
 * - 미루기·실패 비율: 전체 카드 중 미루기·실패·미처리 비율
 *
 *   카드 4장: 실행(정시, 1) · 실행(정시, 1) · 지연(늦음, 1) · 실패(0)
 *   평균 실행률 0.75, 정시 2/3, 실패 1/4
 *   -> 50 × 0.75 + 30 × 0.667 + 20 × 0.75 = 72.5
 */
export function getDataWillpower(days: JudgedCardDay[]): number | null {
  const counted = days.filter((day) => day.result !== 'rest')
  if (counted.length === 0) return null

  const averageRunRate = counted.reduce((sum, day) => sum + day.runRate, 0) / counted.length
  const started = counted.filter((day) => day.startedOnTime !== undefined)
  const onTimeRatio =
    started.length === 0 ? 0 : started.filter((day) => day.startedOnTime).length / started.length
  const missRatio = counted.filter((day) => isMissResult(day.result)).length / counted.length

  return 50 * averageRunRate + 30 * onTimeRatio + 20 * (1 - missRatio)
}

/**
 * 온보딩 심리검사로 의지력(검사)을 구합니다. 세 척도가 높을수록(꾸물거림·흔들림·자책) 낮아집니다.
 *
 *   세 척도 평균 1 -> 100    평균 4 -> 50    평균 7 -> 0
 */
export function getTestWillpower(scores: WillpowerTestScores): number {
  const average = (scores.startResistance + scores.distraction + scores.failSensitivity) / 3
  return ((7 - average) / 6) * 100
}

/** 유효 카드일 수 = 카드가 1장 이상 있었던 날 수 (휴식일 빼고) */
export function countValidCardDays(days: JudgedCardDay[]): number {
  return new Set(days.filter((day) => day.result !== 'rest').map((day) => day.dateKey)).size
}

/**
 * 검사와 데이터를 섞어 의지력을 구합니다. 첫날은 검사 100%, 유효 카드일 14일째부터 데이터 100% 입니다.
 * - 검사를 안 했으면 데이터만, 데이터가 없으면 검사만 씁니다.
 * - 둘 다 없으면 50 (가운데 → 기준 단계 2 '넛지') 입니다.
 *
 *   검사 50, 데이터 80, 유효 카드일 7일 -> 0.5 × 80 + 0.5 × 50 = 65
 *   검사 50, 데이터 80, 유효 카드일 20일 -> 80
 *   검사 없음, 데이터 없음              -> 50
 */
export function getWillpower(
  days: JudgedCardDay[],
  scores: WillpowerTestScores | undefined,
): number {
  const data = getDataWillpower(days)
  const test = scores ? getTestWillpower(scores) : null
  if (data === null) return test ?? 50
  if (test === null) return data
  const weight = Math.min(countValidCardDays(days) / WILLPOWER_DATA_DAYS, 1)
  return weight * data + (1 - weight) * test
}

/** 관리 선호(검사의 C1·C2 척도) 수준 — lib/psychTest.ts 의 getScaleLevel 결과 */
export type CarePreferenceLevel = 'high' | 'mid' | 'low'

/** 기준 단계 경계: 이 값 이상이면 1단계(당근), 이 값 이상이면 2단계(넛지), 그 밑은 3단계(심리적 채찍) */
export const BASE_STAGE_CARROT_FROM = 70
export const BASE_STAGE_NUDGE_FROM = 40
/** 처음 이 일수 동안은 기준 단계 상한이 2 입니다 — 기록이 없을 때는 채찍을 쓰지 않습니다 */
export const FIRST_DAYS_CAP_DAYS = 7
export const FIRST_DAYS_CAP_STAGE: CareLevel = 2

/**
 * 기준 단계를 정합니다 (1 ~ 3).
 * - 의지력 70 이상 → 1, 40 ~ 69 → 2, 40 미만 → 3
 * - 관리 선호가 높으면 +1, 낮으면 −1 (1 ~ 3 안에서)
 * - 시작한 지 7일 안(dayIndex 0 ~ 6)이면 상한 2
 *
 *   getBaseStage(75, 'mid', 20) -> 1     getBaseStage(55, 'high', 20) -> 3
 *   getBaseStage(30, 'low', 20) -> 2     getBaseStage(30, 'mid', 3)   -> 2 (첫 7일)
 */
export function getBaseStage(
  willpower: number,
  carePreference: CarePreferenceLevel | undefined,
  dayIndex: number,
): CareLevel {
  let stage = willpower >= BASE_STAGE_CARROT_FROM ? 1 : willpower >= BASE_STAGE_NUDGE_FROM ? 2 : 3
  if (carePreference === 'high') stage += 1
  if (carePreference === 'low') stage -= 1
  stage = Math.min(3, Math.max(1, stage))
  if (dayIndex < FIRST_DAYS_CAP_DAYS) stage = Math.min(stage, FIRST_DAYS_CAP_STAGE)
  return stage as CareLevel
}
