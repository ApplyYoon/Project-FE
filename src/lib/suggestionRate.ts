/**
 * 실험(개선안) 기간 동안 개선안을 얼마나 지켰는지 이행률(%)과 판정을 계산합니다. (기획서 v2 4장 "이행 판정")
 * 이 판정이 분기 함수(#91)로 들어가 당근·채찍·목표 조정이 정해집니다.
 *
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 */

// 판정 기준 숫자입니다. 기준을 바꾸고 싶으면 여기 두 줄만 고치세요.
/** 이 이행률(%) 이상이면 "잘 시행" */
const GOOD_RATE = 70
/** 이 이행률(%) 이상이고 GOOD_RATE 보다 작으면 "부분 시행". 이보다 작으면 "못 시행" */
const PARTIAL_RATE = 40

/** 판정: good 잘 시행 / partial 부분 시행 / poor 못 시행 */
export type SuggestionGrade = 'good' | 'partial' | 'poor'

export interface SuggestionRate {
  /** 이행률. 0~100 사이의 정수(반올림) */
  rate: number
  grade: SuggestionGrade
}

/**
 * 이행률과 판정을 계산합니다.
 *
 * @param checks 날마다 개선안을 지켰는지 적은 기록입니다. true 면 그날은 지킨 날입니다.
 *               (체크인에서 "개선안을 지켰어요?" 에 답한 날만 들어옵니다. 안 적은 날은 기록에 없습니다)
 * @param days   실험 기간의 전체 일수입니다. (예: 14) 이행률의 "전체"가 되는 숫자입니다.
 *
 * 이행률 = 지킨 날 ÷ 실험 기간 전체 일수 × 100 (반올림)
 * 기록 안 한 날은 지키지 못한 날로 셉니다. 기록이 days 보다 많아도 100% 를 넘지 않습니다.
 *
 * 판정은 화면에 보이는 이행률(반올림한 값)로 정합니다. "70%" 라고 보이는데 "부분 시행"이면 이상하기 때문입니다.
 *   70 이상 → good(잘 시행) / 40 이상 70 미만 → partial(부분 시행) / 40 미만 → poor(못 시행)
 *
 * 예)
 *   14일 중 11일 지킴            → { rate: 79, grade: 'good' }     (11 ÷ 14 = 78.6%)
 *   14일 중 10일 지킴            → { rate: 71, grade: 'good' }
 *   14일 중 7일 지킴             → { rate: 50, grade: 'partial' }
 *   10일 중 7일 지킴  (경계)     → { rate: 70, grade: 'good' }     70 은 "잘 시행"에 포함
 *   10일 중 4일 지킴  (경계)     → { rate: 40, grade: 'partial' }  40 은 "부분 시행"에 포함
 *   10일 중 3일 지킴             → { rate: 30, grade: 'poor' }
 *   14일 중 하루도 못 지킴       → { rate: 0, grade: 'poor' }      (기록은 있으니 0%. 아래 null 과 다릅니다)
 *   14일인데 기록이 하나도 없음  → null                            ("0%" 가 아니라 "아직 모름")
 *   days 가 0 이하               → null                            (나눌 수 없음)
 */
export function getSuggestionRate(checks: boolean[], days: number): SuggestionRate | null {
  // 기록이 없으면 "못 지켰다"가 아니라 "아직 모른다"입니다. 0 이 아니라 null 을 돌려줍니다.
  if (checks.length === 0) return null
  // 전체 일수가 없거나 0 이하이면 이행률을 계산할 수 없습니다.
  if (!Number.isFinite(days) || days <= 0) return null

  const keptDays = checks.filter((isKept) => isKept).length
  // 지킨 날이 전체 일수보다 많을 수는 없으므로 100% 를 넘지 않게 합니다.
  const rate = Math.min(100, Math.round((keptDays / days) * 100))

  return { rate, grade: getGrade(rate) }
}

/** 이행률(%)을 판정으로 바꿉니다. */
function getGrade(rate: number): SuggestionGrade {
  if (rate >= GOOD_RATE) return 'good'
  if (rate >= PARTIAL_RATE) return 'partial'
  return 'poor'
}
