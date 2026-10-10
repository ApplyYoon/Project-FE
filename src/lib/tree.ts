import type { CareLevel } from '@/lib/careLevel'

/**
 * 홈 화면 "내 나무" 를 계산하는 함수입니다. (기획서 v2 5장, #68)
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * ■ 규칙
 *   - 줄기(단계): 누적 순공시간 10시간마다 한 단계씩 자랍니다.
 *       씨앗(0시간~) → 새싹(10시간~) → 작은 나무(20시간~) → 큰 나무(30시간~)
 *   - 잎: 회고(#82) 수 + 인사이트(#73) 수
 *   - 열매: 나 사용설명서(#87) 항목 수 (효과가 확인된 나만의 방법)
 *   - 시듦: 관리 강도가 3 이상인데 오늘 아직 공부를 안 했으면 시듭니다.
 *           오늘 1분이라도 공부하면 바로 살아납니다. 나무는 절대 사라지지 않습니다.
 */

/** 나무 단계 이름. 배열 순서가 곧 단계입니다. (0번 = 씨앗) */
export const TREE_STAGE_NAMES = ['씨앗', '새싹', '작은 나무', '큰 나무'] as const

// 한 단계 자라는 데 필요한 순공시간(분). 규칙을 바꾸고 싶으면 이 숫자만 고치면 됩니다.
export const MINUTES_PER_STAGE = 10 * 60

// 이 관리 강도부터 나무가 시듭니다. (3 = 심리적 채찍)
const WILT_CARE_LEVEL = 3

// 마지막 단계 번호 (큰 나무 = 3)
const LAST_STAGE = TREE_STAGE_NAMES.length - 1

export interface TreeInput {
  /** 지금까지 공부한 순공시간 합계 (분) */
  totalStudyMinutes: number
  /** 오늘 공부한 순공시간 (분). 시든 나무를 살릴 때 씁니다. */
  todayStudyMinutes: number
  /** 오늘의 관리 강도 (0 회복 ~ 4 강제적 채찍) */
  careLevel: CareLevel
  /** 쓴 회고 수 (#82) */
  reflectionCount: number
  /** 받은 인사이트 수 (#73) */
  insightCount: number
  /** 나 사용설명서 항목 수 (#87) */
  manualItemCount: number
}

export interface TreeState {
  /** 단계 번호. 0 씨앗 ~ 3 큰 나무 */
  stage: number
  /** 단계 이름. 예) '작은 나무' */
  stageName: string
  /** 잎 개수 */
  leafCount: number
  /** 열매 개수 */
  fruitCount: number
  /** 시들었으면 true */
  isWilted: boolean
  /** 큰 나무까지 다 자랐으면 true (더 이상 다음 단계가 없음) */
  isFullGrown: boolean
  /** 다음 단계까지 남은 순공시간 (분). 다 자랐으면 0 */
  minutesToNextStage: number
  /** 지금 단계 안에서 얼마나 자랐는지 (0~100). 진행 막대에 씁니다. 다 자랐으면 100 */
  progressPercent: number
}

/** 음수·NaN 같은 이상한 값을 0 으로 바꿉니다. (깨진 기록 때문에 나무가 이상해지지 않게) */
function toSafeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * 공부 기록으로 나무 상태를 계산합니다.
 *
 *   예) 누적 0분                     → 씨앗,     다음 단계까지 600분
 *   예) 누적 1,500분(25시간)          → 작은 나무, 다음 단계까지 300분, 진행 50%
 *   예) 누적 2,000분(33시간)          → 큰 나무,  다 자람
 *   예) 관리 강도 3, 오늘 0분         → 시듦
 *   예) 관리 강도 3, 오늘 25분        → 안 시듦 (다시 공부해서 살아남)
 */
export function getTreeState(input: TreeInput): TreeState {
  const totalMinutes = toSafeCount(input.totalStudyMinutes)
  const todayMinutes = toSafeCount(input.todayStudyMinutes)

  // 10시간마다 한 단계. 큰 나무보다 더 커지지는 않습니다.
  const stage = Math.min(LAST_STAGE, Math.floor(totalMinutes / MINUTES_PER_STAGE))
  const isFullGrown = stage === LAST_STAGE

  // 지금 단계에서 이미 자란 양 (분)
  const minutesInStage = totalMinutes - stage * MINUTES_PER_STAGE

  return {
    stage,
    stageName: TREE_STAGE_NAMES[stage],
    leafCount: toSafeCount(input.reflectionCount) + toSafeCount(input.insightCount),
    fruitCount: toSafeCount(input.manualItemCount),
    isWilted: input.careLevel >= WILT_CARE_LEVEL && todayMinutes === 0,
    isFullGrown,
    minutesToNextStage: isFullGrown ? 0 : MINUTES_PER_STAGE - minutesInStage,
    progressPercent: isFullGrown ? 100 : (minutesInStage / MINUTES_PER_STAGE) * 100,
  }
}
