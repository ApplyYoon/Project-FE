/**
 * 개선안 실험에 효과가 있었는지 판정합니다. (기획서 v2 4장 "효과 판정")
 * 실험 기간과 그 직전 2주(기준선)의 평균 순공시간·달성률을 비교합니다.
 *
 *   effective(효과 있음) → 나 사용설명서에 올림
 *   noEffect(효과 없음)  → 전략을 바꿈
 *   unclear(애매)        → 1주 연장
 *
 * 기획서 3장 원칙: 상관은 인과가 아니라서, 기록이 충분히 쌓이기 전에는 단정하지 않습니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * ⚠️ 아래 기준 숫자는 이슈에 "팀에서 정하기"라고 되어 있어 제가 임시로 정한 값입니다. 팀 확인이 필요합니다.
 */

// 기준 숫자입니다. 기준을 바꾸고 싶으면 여기 세 줄만 고치세요.
/** 평균 순공시간이 기준선보다 이 비율(%) 이상 늘면 "올랐다", 이만큼 줄면 "내려갔다"로 봅니다. */
const STUDY_CHANGE_PERCENT = 10
/** 평균 달성률이 기준선보다 이 퍼센트포인트(%p) 이상 오르면 "올랐다", 이만큼 내리면 "내려갔다"로 봅니다. */
const ACHIEVEMENT_CHANGE_POINTS = 10
/** 두 기간 모두 기록이 있는 날이 이 일수 이상이어야 판정합니다. 하나라도 모자라면 unclear 입니다. (기획서 3장) */
const MIN_RECORDED_DAYS = 5

/** 효과 판정 결과 */
export type ExperimentResult = 'effective' | 'noEffect' | 'unclear'

/**
 * 하루 기록에서 비교에 쓰는 두 숫자입니다.
 * 하루 요약(getDaySummary 의 DaySummary)의 studyMinutes, achievementRate 와 같은 값입니다.
 */
export interface DayMetric {
  /** 그날 순공시간 (분) */
  studyMinutes: number
  /** 그날 계획 달성률 (0~100) */
  achievementRate: number
}

type Change = 'up' | 'flat' | 'down'

/** 숫자 배열의 평균입니다. (빈 배열은 이 함수를 부르기 전에 걸러냅니다) */
function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** 모든 값이 유한한 숫자인지 확인합니다. (NaN, Infinity 가 섞이면 평균이 엉터리가 됩니다) */
function isValid(days: DayMetric[]): boolean {
  return days.every(
    (day) => Number.isFinite(day.studyMinutes) && Number.isFinite(day.achievementRate),
  )
}

/** 평균 순공시간이 기준선보다 올랐는지/내려갔는지를 %로 비교합니다. */
function compareStudy(baselineAvg: number, experimentAvg: number): Change {
  // 기준선이 0분이면 %를 계산할 수 없습니다. 0분에서 조금이라도 늘었으면 "올랐다"로 봅니다.
  if (baselineAvg === 0) return experimentAvg > 0 ? 'up' : 'flat'

  const changePercent = ((experimentAvg - baselineAvg) / baselineAvg) * 100
  if (changePercent >= STUDY_CHANGE_PERCENT) return 'up'
  if (changePercent <= -STUDY_CHANGE_PERCENT) return 'down'
  return 'flat'
}

/** 평균 달성률이 기준선보다 올랐는지/내려갔는지를 퍼센트포인트(%p)로 비교합니다. */
function compareAchievement(baselineAvg: number, experimentAvg: number): Change {
  const changePoints = experimentAvg - baselineAvg
  if (changePoints >= ACHIEVEMENT_CHANGE_POINTS) return 'up'
  if (changePoints <= -ACHIEVEMENT_CHANGE_POINTS) return 'down'
  return 'flat'
}

/**
 * 개선안 실험의 효과를 판정합니다.
 *
 * @param baseline   실험 직전 2주(기준선) 중 **기록이 있는 날들**의 하루 지표
 * @param experiment 실험 기간 중 **기록이 있는 날들**의 하루 지표
 *
 * 순서대로 따지고, 먼저 맞는 줄에서 끝냅니다.
 *
 * 1) 두 기간 중 하나라도 기록이 5일 미만이거나 값이 이상하면 → unclear (아직 단정할 수 없음)
 *      예) 기준선 4일 + 실험 14일                → unclear   (기준선이 5일 미만)
 *      예) 기준선 14일 + 실험 3일                → unclear   (실험이 5일 미만)
 *
 * 2) 평균 순공시간과 평균 달성률을 각각 "올랐다 / 비슷하다 / 내려갔다"로 나눕니다.
 *      순공시간: 기준선보다 10% 이상 늘면 올랐다, 10% 이상 줄면 내려갔다
 *      달성률:   기준선보다 10%p 이상 오르면 올랐다, 10%p 이상 내리면 내려갔다
 *
 * 3) 두 결과를 합쳐서 판정합니다.
 *      하나라도 올랐고 내려간 건 없음      → effective  (효과 있음)
 *        예) 기준선 평균 순공 120분, 실험 평균 150분(+25%), 달성률 비슷   → effective
 *      올랐다와 내려갔다가 섞임           → unclear    (엇갈림. 1주 더 지켜봄)
 *        예) 순공은 +30% 인데 달성률은 -15%p                              → unclear
 *      모두 비슷하거나, 내려간 것만 있음   → noEffect   (효과 없음. 전략을 바꿈)
 *        예) 기준선 평균 순공 120분, 실험 평균 125분(+4%), 달성률 비슷     → noEffect
 *
 * 경계값: 정확히 +10% 는 "올랐다", +9.9% 는 "비슷하다" 입니다. (이상 / 미만)
 *
 * ── 경계 상황 예시 (BE Project-BE#54 가 이 표를 테스트로 그대로 옮깁니다) ──
 * 표기: "N일 순공 X분 / 달성 Y%" 는 N일 모두 같은 값일 때의 평균입니다.
 * 따로 적지 않은 쪽은 기준선·실험이 같은 값(달성률 70%)입니다.
 *
 * [기록 일수]
 *   기준선 5일 + 실험 5일, 순공 120분 → 150분   → effective  (정확히 5일부터 판정함)
 *   기준선 0일(빈 배열) + 실험 14일              → unclear    (기록이 없음)
 *   기준선 14일 + 실험 0일(빈 배열)              → unclear
 *
 * [순공시간 경계 — 달성률은 비슷]
 *   120분 → 132분 (정확히 +10%)                  → effective  (이상이면 올랐다)
 *   100분 → 109.9분 (+9.9%)                      → noEffect   (미만이면 비슷하다)
 *   120분 → 108분 (정확히 -10%)                  → noEffect   (내려가기만 하면 효과 없음)
 *   120분 → 90분 (-25%)                          → noEffect
 *
 * [달성률 경계 — 순공시간은 비슷]
 *   60% → 70% (정확히 +10%p)                     → effective
 *   60% → 69.9% (+9.9%p)                         → noEffect
 *   70% → 60% (정확히 -10%p)                     → noEffect
 *
 * [기준선 순공이 0분 — %를 계산할 수 없는 경우]
 *   기준선 0분 → 실험 90분                       → effective  (조금이라도 늘면 올랐다)
 *   기준선 0분 → 실험 0분                        → noEffect   (그대로면 비슷하다)
 *
 * [두 지표가 함께 움직일 때]
 *   순공 120→150분(+25%) + 달성률 60→75%(+15%p)  → effective  (둘 다 올랐다)
 *   순공 120→156분(+30%) + 달성률 60→70%(+10%p)  → effective
 *   순공 120→90분(-25%)  + 달성률 70→55%(-15%p)  → noEffect   (둘 다 내려갔다)
 *   순공 120→156분(+30%) + 달성률 70→60%(-10%p)  → unclear    (엇갈림)
 *   순공 120→90분(-25%)  + 달성률 60→75%(+15%p)  → unclear    (엇갈림, 반대 방향)
 *
 * [평균으로 비교한다는 점]
 *   기준선 100분 4일 + 200분 1일 (평균 120분), 실험 100분 5일 → noEffect
 *     (하루가 튀어도 평균으로 비교하므로, 실험 평균이 -16.7% 로 내려간 것으로 봅니다)
 *
 * [값이 이상한 경우]
 *   실험 14일 중 하루의 순공시간이 NaN            → unclear    (평균이 엉터리가 되므로 단정하지 않음)
 */
export function judgeExperiment(baseline: DayMetric[], experiment: DayMetric[]): ExperimentResult {
  // 1) 기록이 모자라면 단정하지 않습니다.
  if (baseline.length < MIN_RECORDED_DAYS || experiment.length < MIN_RECORDED_DAYS) {
    return 'unclear'
  }
  if (!isValid(baseline) || !isValid(experiment)) return 'unclear'

  // 2) 평균을 구해서 비교합니다.
  const study = compareStudy(
    average(baseline.map((day) => day.studyMinutes)),
    average(experiment.map((day) => day.studyMinutes)),
  )
  const achievement = compareAchievement(
    average(baseline.map((day) => day.achievementRate)),
    average(experiment.map((day) => day.achievementRate)),
  )

  // 3) 두 결과를 합칩니다.
  const changes = [study, achievement]
  const hasUp = changes.includes('up')
  const hasDown = changes.includes('down')

  if (hasUp && hasDown) return 'unclear'
  if (hasUp) return 'effective'
  return 'noEffect'
}
