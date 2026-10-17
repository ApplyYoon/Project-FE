/**
 * 오늘의 관리 강도(AI 가 얼마나 세게 말하는지)를 정하는 함수입니다. (기획서 v2 5장)
 *
 *   0 회복 · 1 당근 · 2 넛지 · 3 심리적 채찍 · 4 강제적 채찍(집중 모드, #69)
 *
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 어제 결과에 따른 대응은 #91 의 decideCareAction 이 돌려주는 CareAction 을 그대로 받습니다.
 * (CareLevel 은 #78 이 끝나서 @/types 걸로 씁니다)
 */
import type { CareAction } from '@/lib/careDecision'
import type { CareLevel } from '@/types'

// 다른 곳에서 '@/lib/careLevel' 로 CareLevel 을 가져다 쓰고 있어서, 그대로 다시 내보냅니다.
export type { CareLevel }

export interface CareLevelInput {
  /** 어제의 관리 강도 */
  yesterdayLevel: CareLevel
  /** 어제 결과에 따라 정한 대응 (#91 decideCareAction 의 결과 action) */
  action: CareAction
  /** 사용자가 정한 최대 한도 (#59, getCareLimits().maxCareLevel). 이 단계를 넘는 강도는 절대 쓰지 않습니다. */
  maxLevel: CareLevel
  /**
   * 안전 브레이크가 켜졌는지 (#95). getSafetyBrakeResult 의 결과로 이렇게 만듭니다.
   *   isSafetyBrakeOn: brake.stopWhip || brake.recoveryMode
   */
  isSafetyBrakeOn: boolean
}

// 가장 낮은 단계 / 가장 높은 단계
const MIN_LEVEL: CareLevel = 0
const MAX_LEVEL: CareLevel = 4

// 규칙을 바꾸고 싶으면 아래 숫자만 고치면 됩니다. (양수는 올림, 음수는 내림)
// 어제 단계에서 하루에 올라가는 칸 수. 이슈 규칙 "하루에 한 단계까지만 올라간다" 때문에 1 입니다.
const STEPS_UP_ON_WHIP = 1
// 당근(잘 해냄)일 때 한 번에 내려가는 칸 수
const STEPS_DOWN_ON_CARROT = 2
// 목표를 낮춘 날(goal-down)에 내려가는 칸 수
const STEPS_DOWN_ON_GOAL_DOWN = 1

/** 대응별로 어제 단계에서 몇 칸 움직이는지. recovery-first 는 칸 수가 아니라 무조건 0 이라서 여기에 없습니다. */
const levelChangeByAction: Record<Exclude<CareAction, 'recovery-first'>, number> = {
  whip: STEPS_UP_ON_WHIP,
  'carrot-raise': -STEPS_DOWN_ON_CARROT,
  'carrot-change-strategy': -STEPS_DOWN_ON_CARROT,
  'carrot-keep': -STEPS_DOWN_ON_CARROT,
  'keep-easier': 0,
  'goal-down': -STEPS_DOWN_ON_GOAL_DOWN,
}

/** 숫자를 0~4 사이로 맞춰서 CareLevel 로 돌려줍니다. */
function toCareLevel(value: number): CareLevel {
  const clamped = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, value))
  return clamped as CareLevel
}

/**
 * 오늘의 관리 강도를 정합니다. 위에서부터 차례로 따집니다.
 *
 * ■ 규칙은 2026-10-11 에 확정했습니다. BE 도 같은 규칙입니다. (BE 저장소의 domain/care/CareLevel.java, 이슈 BE#62)
 *    한쪽을 고치면 다른 쪽도 같이 고쳐야 화면과 서버의 단계가 어긋나지 않습니다. BE 는 이 주석의 예시·정답표를 테스트로 옮겨 두었습니다.
 *    - 이슈에 정해진 규칙: ① 하루에 한 단계까지만 올라간다 ② 최대 한도를 절대 넘지 않는다 ③ 안전 브레이크가 켜지면 무조건 0
 *    - 확정한 규칙: 대응별 칸 수 (당근 두 칸 내림, 채찍 한 칸 올림, 목표 하향 한 칸 내림, 난이도만 낮추면 그대로)
 *    - 확정한 규칙: 처음 쓰는 날(어제 단계가 없음)은 1단계(당근)에서 시작한다. 이 함수를 부르지 않고 부르는 쪽이 정합니다.
 *      (지금은 lib/todayCare.ts 의 getTodayCareLevel 이 그렇게 합니다. BE 는 CareLevel.firstDay)
 *
 * 예시는 아래 모양으로 입력 4개를 모두 적었습니다.
 *    [어제 단계, 대응, 한도, 브레이크] → 오늘 단계
 *
 * 1) 안전 브레이크가 켜졌다 → 무조건 0 (회복). 아래 규칙은 보지 않습니다. (대응·한도보다 먼저)
 *    예) [어제 3, whip, 한도 4, 브레이크 켜짐] → 0
 *    예) [어제 4, keep-easier, 한도 4, 브레이크 켜짐] → 0
 *    예) [어제 0, whip, 한도 4, 브레이크 켜짐] → 0
 *
 * 2) 대응이 recovery-first(회복 우선, 채찍 금지)면 어제가 몇 단계였든 0 입니다.
 *    예) [어제 3, recovery-first, 한도 4, 브레이크 꺼짐] → 0
 *    예) [어제 4, recovery-first, 한도 4, 브레이크 꺼짐] → 0
 *
 * 3) 그 외 대응은 어제 단계에서 칸 수만큼 움직입니다.
 *    - whip(채찍): 한 단계만 올라갑니다. 하루에 두 단계 이상은 올라가지 않습니다.
 *        예) [어제 2, whip, 한도 4, 브레이크 꺼짐] → 3   (4 가 되지 않습니다)
 *        예) [어제 0, whip, 한도 4, 브레이크 꺼짐] → 1   (한도가 높아도 한 칸만)
 *        예) [어제 4, whip, 한도 4, 브레이크 꺼짐] → 4   (이미 맨 위)
 *    - carrot-raise · carrot-change-strategy · carrot-keep(당근): 바로 내려갑니다. 두 칸 내림, 최소 0.
 *        예) [어제 4, carrot-raise, 한도 4, 브레이크 꺼짐] → 2
 *        예) [어제 3, carrot-keep, 한도 4, 브레이크 꺼짐] → 1
 *        예) [어제 2, carrot-change-strategy, 한도 4, 브레이크 꺼짐] → 0   (정확히 0 에 닿습니다)
 *        예) [어제 1, carrot-raise, 한도 4, 브레이크 꺼짐] → 0   (한 칸만 남아도 0 에서 멈춥니다)
 *    - goal-down(목표 하향, 회복 모드): 한 칸 내려갑니다. 최소 0.
 *        예) [어제 4, goal-down, 한도 4, 브레이크 꺼짐] → 3
 *        예) [어제 1, goal-down, 한도 4, 브레이크 꺼짐] → 0
 *        예) [어제 0, goal-down, 한도 4, 브레이크 꺼짐] → 0
 *    - keep-easier(같은 전략, 난이도만 낮춤): 그대로 둡니다.
 *        예) [어제 2, keep-easier, 한도 4, 브레이크 꺼짐] → 2
 *        예) [어제 1, keep-easier, 한도 4, 브레이크 꺼짐] → 1   (한도가 높아도 저절로 올라가지 않습니다)
 *
 * 4) 사용자가 정한 최대 한도를 넘으면 한도로 낮춥니다. (한도는 어떤 경우에도 우선. 단 브레이크 다음)
 *        예) [어제 2, whip, 한도 2, 브레이크 꺼짐] → 2     (3 이 되지만 한도 때문에 2)
 *        예) [어제 4, keep-easier, 한도 1, 브레이크 꺼짐] → 1   (한도를 낮춘 날은 바로 한도로 내려갑니다)
 *        예) [어제 4, whip, 한도 2, 브레이크 꺼짐] → 2     (어제가 한도보다 높아도 한도가 이깁니다. 5 가 아님)
 *        예) [어제 4, carrot-raise, 한도 1, 브레이크 꺼짐] → 1  (4 − 2 = 2 지만 한도 1 로 잘립니다)
 *        예) [어제 0, whip, 한도 0, 브레이크 꺼짐] → 0     (한도 0 이면 항상 회복)
 *        예) [어제 3, carrot-keep, 한도 0, 브레이크 꺼짐] → 0
 *
 * ■ 정답표 (브레이크 꺼짐. 입력 350가지 = 어제 5 × 대응 7 × 한도 5 × 브레이크 2 전부)
 *    행 = 어제 단계, 열 = 최대 한도 0 1 2 3 4, 값 = 오늘 단계
 *    대응 7개 중 carrot 3개는 같은 결과라 표는 4개입니다. (recovery-first 는 표 아래)
 *
 *    whip(채찍)            carrot-* (당근 3종)   goal-down(목표 하향)   keep-easier(난이도만)
 *    어제 0: 0 1 1 1 1     어제 0: 0 0 0 0 0     어제 0: 0 0 0 0 0      어제 0: 0 0 0 0 0
 *    어제 1: 0 1 2 2 2     어제 1: 0 0 0 0 0     어제 1: 0 0 0 0 0      어제 1: 0 1 1 1 1
 *    어제 2: 0 1 2 3 3     어제 2: 0 0 0 0 0     어제 2: 0 1 1 1 1      어제 2: 0 1 2 2 2
 *    어제 3: 0 1 2 3 4     어제 3: 0 1 1 1 1     어제 3: 0 1 2 2 2      어제 3: 0 1 2 3 3
 *    어제 4: 0 1 2 3 4     어제 4: 0 1 2 2 2     어제 4: 0 1 2 3 3      어제 4: 0 1 2 3 4
 *
 *    recovery-first 는 위 표와 상관없이 어제·한도가 무엇이든 0 입니다.
 *    브레이크가 켜지면 위 표와 상관없이 입력 175가지(어제 5 × 대응 7 × 한도 5) 전부 0 입니다.
 *
 * ■ 아직 정해지지 않은 동작 (현재 코드가 우연히 내는 결과입니다)
 *    1. 입력이 범위 밖이거나 소수·NaN 일 때: 7 → 4, −2 → 0 으로 잘리고, 2.5 → 3.5, NaN → NaN 이 됩니다.
 *       입력 검사를 누가 하는지(이 함수 / 호출하는 쪽) 미정입니다. (BE 는 0~4 밖의 값이면 에러를 냅니다)
 *       어제 단계 없이(undefined) 부르면 NaN 이 나옵니다. 처음 쓰는 날은 위 규칙대로 이 함수를 부르지 않습니다.
 *    2. 알 수 없는 대응 값(타입에 없는 글자): 어제 단계를 그대로 둡니다. (keep-easier 처럼) 에러를 내지 않습니다.
 *    3. 하루에 한 번만 부른다는 약속이 없습니다. 이 함수는 "어제 단계"만 받으므로, 오늘 결과를 어제 단계 자리에
 *       저장해 같은 날 다시 부르면 하루에 두 단계가 올라갑니다. (함수가 막지 못함. 단계를 저장하는 쪽이 지켜야 합니다)
 */
export function getCareLevel(input: CareLevelInput): CareLevel {
  const { yesterdayLevel, action, maxLevel, isSafetyBrakeOn } = input

  // 1) 안전 브레이크
  if (isSafetyBrakeOn) return 0

  // 2) 회복 우선이면 어제 단계와 상관없이 0
  if (action === 'recovery-first') return 0

  // 3) 어제 단계에서 오늘 단계 계산. (타입에 없는 값이 들어오면 undefined 라서 0 칸 = 그대로 둡니다)
  const todayLevel: number = yesterdayLevel + (levelChangeByAction[action] ?? 0)

  // 4) 최대 한도를 넘지 않게 자릅니다.
  return toCareLevel(Math.min(todayLevel, maxLevel))
}
