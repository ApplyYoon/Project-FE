/**
 * 오늘의 관리 강도(AI 가 얼마나 세게 말하는지)를 정하는 함수입니다. (기획서 v2 5장)
 *
 *   0 회복 · 1 당근 · 2 넛지 · 3 심리적 채찍 · 4 강제적 채찍(집중 모드, #69)
 *
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 아래 타입들은 #78(공통 타입), #91(분기 함수)이 아직 없어서 임시로 여기서 정의합니다.
 * 그 이슈들이 끝나면 그쪽 타입을 가져다 쓰도록 바꾸세요.
 */
export type CareLevel = 0 | 1 | 2 | 3 | 4

/**
 * 어제 결과를 보고 정한 대응(#91 의 분기 결과)입니다. (#91 이 정해지면 맞춰서 바꿉니다)
 * - success: 어제 계획을 해냈어요 (당근)
 * - fail: 어제 계획을 못 채웠어요 (채찍)
 * - adjust: 목표를 조정하기로 했어요 → 강도는 그대로 둡니다
 */
export type CareBranch = 'success' | 'fail' | 'adjust'

export interface CareLevelInput {
  /** 어제의 관리 강도 */
  yesterdayLevel: CareLevel
  /** 어제 결과에 따른 분기 결과 (#91) */
  branch: CareBranch
  /** 사용자가 정한 최대 한도 (#59). 이 단계를 넘는 강도는 절대 쓰지 않습니다. */
  maxLevel: CareLevel
  /** 안전 브레이크가 켜졌는지 (#95). 위기 표현·기분 저하 등을 감지하면 true */
  isSafetyBrakeOn: boolean
}

// 성공했을 때 한 번에 내려가는 칸 수입니다. 규칙을 바꾸고 싶으면 이 숫자만 고치면 됩니다.
const STEPS_DOWN_ON_SUCCESS = 2

// 가장 낮은 단계 / 가장 높은 단계
const MIN_LEVEL: CareLevel = 0
const MAX_LEVEL: CareLevel = 4

/** 숫자를 0~4 사이로 맞춰서 CareLevel 로 돌려줍니다. */
function toCareLevel(value: number): CareLevel {
  const clamped = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, value))
  return clamped as CareLevel
}

/**
 * 오늘의 관리 강도를 정합니다. 위에서부터 차례로 따집니다.
 *
 * 1) 안전 브레이크가 켜졌다 → 무조건 0 (회복). 아래 규칙은 보지 않습니다.
 *    예) 어제 3, fail, 한도 4, 브레이크 켜짐  → 0
 *
 * 2) 분기 결과에 따라 어제 단계를 바꿉니다.
 *    - fail(못 채움): 한 단계만 올라갑니다. 하루에 두 단계 이상은 못 올라갑니다.
 *        예) 어제 2, fail → 3     /  어제 2, fail → 4 는 불가능
 *        예) 어제 4, fail → 4 (이미 맨 위)
 *    - success(해냄): 바로 내려갑니다. 규칙은 "두 칸 내림, 최소 0".
 *        예) 어제 3, success → 1  /  어제 1, success → 0  /  어제 0, success → 0
 *    - adjust(목표 조정): 그대로 둡니다.
 *        예) 어제 2, adjust → 2
 *
 * 3) 사용자가 정한 최대 한도를 넘으면 한도로 낮춥니다. (한도는 어떤 경우에도 우선)
 *        예) 어제 2, fail, 한도 2 → 3 이 되지만 한도 때문에 2
 *        예) 어제 4, adjust, 한도 1 → 1 (한도를 낮춘 날은 바로 한도로 내려갑니다)
 */
export function getCareLevel(input: CareLevelInput): CareLevel {
  const { yesterdayLevel, branch, maxLevel, isSafetyBrakeOn } = input

  // 1) 안전 브레이크
  if (isSafetyBrakeOn) return 0

  // 2) 어제 단계에서 오늘 단계 계산
  let todayLevel: number = yesterdayLevel
  if (branch === 'fail') {
    todayLevel = yesterdayLevel + 1
  } else if (branch === 'success') {
    todayLevel = yesterdayLevel - STEPS_DOWN_ON_SUCCESS
  }

  // 3) 최대 한도를 넘지 않게 자릅니다.
  return toCareLevel(Math.min(todayLevel, maxLevel))
}
