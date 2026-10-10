import type { StudyPlan } from '@/types'

/**
 * 계획 화면의 "플래너 보기" 에서 쓰는 순수 함수들입니다. (#237)
 * 하루 계획을 시작 시각 순서로 줄 세우고, 블록의 높이 · 빈 시간 · 겹침 · "지금" 선의 자리를 계산합니다.
 * React 를 쓰지 않아서 같은 입력이면 항상 같은 결과가 나옵니다.
 */

/** 1분을 몇 px 로 그릴지. 60분 계획이면 120px 입니다 */
export const PX_PER_MINUTE = 2
/** 블록의 최소 높이(px). 아주 짧은 계획도 손가락으로 누를 수 있어야 해서 40px 아래로는 줄이지 않습니다 */
export const MIN_BLOCK_PX = 40

/**
 * 'HH:MM' 을 "자정부터 몇 분째인지" 로 바꿉니다. 시각 모양이 아니면 null 입니다.
 *   toMinutes('19:10') -> 1150   /   toMinutes('') -> null   /   toMinutes(undefined) -> null
 */
export function toMinutes(time: string | undefined): number | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null
  const [hour, minute] = time.split(':').map(Number)
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/** 플래너에 그리는 블록 하나 (= 시작 시각이 있는 계획 하나) */
export interface TimelineBlock {
  plan: StudyPlan
  /** 시작 시각 (자정부터 몇 분째) */
  startMinutes: number
  /** 끝나는 시각 = 시작 + 목표 시간 (자정부터 몇 분째) */
  endMinutes: number
  /** 블록의 높이(px). 목표 시간에 비례하고, 최소 40px 입니다 */
  heightPx: number
  /** 앞의 계획들이 끝난 뒤 이 계획이 시작하기까지 비는 시간(분). 맨 앞이거나 붙어 있으면 0 */
  gapBeforeMinutes: number
  /** 다른 계획과 시간이 겹치면 true */
  isOverlapping: boolean
}

export interface Timeline {
  /** 시작 시각이 있는 계획들. 시작이 빠른 순서입니다 */
  blocks: TimelineBlock[]
  /** 시작 시각을 안 정한 계획들 ("시간 미정"). 원래 순서 그대로입니다 */
  unscheduledPlans: StudyPlan[]
}

/**
 * 하루치 계획을 플래너에 그릴 모양으로 바꿉니다.
 *
 * ■ 규칙
 * 1. 시작 시각이 있는 계획만 블록이 됩니다. 없는 계획은 unscheduledPlans 에 모읍니다.
 * 2. 블록은 시작이 빠른 순서로 놓습니다. 시작이 같으면 원래 순서를 지킵니다.
 * 3. 높이 = 목표 시간(분) × 2px. 단, 40px 보다 작아지지 않습니다.
 * 4. 한 계획이 끝나기 전에 다른 계획이 시작하면 둘 다 "겹침" 입니다. (끝과 시작이 딱 붙은 것은 겹침이 아닙니다)
 *
 * ■ 예시
 *   [국어 19:00 50분, 수학 18:00 60분, 영어(시각 없음) 30분, 게임 20:00 60분]
 *   -> blocks: 수학 18:00~19:00 (120px, 빈 시간 0)
 *              국어 19:00~19:50 (100px, 빈 시간 0)
 *              게임 20:00~21:00 (120px, 빈 시간 10)
 *      unscheduledPlans: [영어]
 *   [수학 18:00 60분, 국어 18:30 50분] -> 둘 다 isOverlapping: true
 */
export function getTimeline(plans: StudyPlan[]): Timeline {
  const blocks: TimelineBlock[] = []
  const unscheduledPlans: StudyPlan[] = []

  for (const plan of plans) {
    const startMinutes = toMinutes(plan.startTime)
    if (startMinutes === null) {
      unscheduledPlans.push(plan)
      continue
    }
    // 목표 시간이 이상한 값(음수 등)이어도 블록이 뒤집히지 않게 0 으로 봅니다.
    const targetMinutes = Math.max(0, plan.targetMinutes)
    blocks.push({
      plan,
      startMinutes,
      endMinutes: startMinutes + targetMinutes,
      heightPx: Math.max(MIN_BLOCK_PX, targetMinutes * PX_PER_MINUTE),
      gapBeforeMinutes: 0,
      isOverlapping: false,
    })
  }

  // 시작이 빠른 순서로 줄 세웁니다. (sort 는 값이 같으면 원래 순서를 지킵니다)
  blocks.sort((a, b) => a.startMinutes - b.startMinutes)

  // 앞에서부터 보면서 빈 시간과 겹침을 채웁니다.
  // latestEnd: 지금까지 본 블록들 중 가장 늦게 끝나는 시각
  let latestEnd = 0
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (index > 0) block.gapBeforeMinutes = Math.max(0, block.startMinutes - latestEnd)
    latestEnd = Math.max(latestEnd, block.endMinutes)

    // 뒤에 오는 블록 중 이 블록이 끝나기 전에 시작하는 것이 있으면 둘 다 겹침입니다.
    for (let later = index + 1; later < blocks.length; later++) {
      if (blocks[later].startMinutes < block.endMinutes) {
        block.isOverlapping = true
        blocks[later].isOverlapping = true
      }
    }
  }

  return { blocks, unscheduledPlans }
}

/** "지금" 선을 그릴 자리 */
export interface NowLine {
  /** 선을 그릴 블록이 blocks 에서 몇 번째인지 (0 부터) */
  blockIndex: number
  /** 그 블록의 위에서부터 몇 % 자리인지 (0 = 맨 위, 100 = 맨 아래) */
  percent: number
}

/**
 * "지금" 선을 어느 블록의 어디에 그릴지 정합니다. 블록이 하나도 없으면 null 입니다.
 *
 * ■ 규칙
 * 1. 지금이 어떤 블록의 시작 ~ 끝 사이면, 그 블록 안에 흐른 만큼의 자리에 그립니다. (겹치면 먼저 시작한 블록)
 * 2. 아니면 다음에 시작할 블록의 맨 위(0%)에 그립니다. (빈 시간이거나, 첫 계획 전일 때)
 * 3. 모든 블록이 지났으면 마지막 블록의 맨 아래(100%)에 그립니다.
 *
 * ■ 예시 (블록: 18:00~19:00, 19:00~19:50, 20:00~21:00)
 *   19:16 (1156분) -> { blockIndex: 1, percent: 32 }
 *   19:55 (1195분) -> { blockIndex: 2, percent: 0 }     빈 시간
 *   17:00 (1020분) -> { blockIndex: 0, percent: 0 }     첫 계획 전
 *   22:00 (1320분) -> { blockIndex: 2, percent: 100 }   다 지남
 */
export function getNowLine(blocks: TimelineBlock[], nowMinutes: number): NowLine | null {
  if (blocks.length === 0) return null

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    const length = block.endMinutes - block.startMinutes
    if (length > 0 && nowMinutes >= block.startMinutes && nowMinutes < block.endMinutes) {
      const percent = Math.floor(((nowMinutes - block.startMinutes) * 100) / length)
      return { blockIndex: index, percent }
    }
  }

  const nextIndex = blocks.findIndex((block) => block.startMinutes > nowMinutes)
  if (nextIndex !== -1) return { blockIndex: nextIndex, percent: 0 }

  return { blockIndex: blocks.length - 1, percent: 100 }
}

/**
 * 계획을 "지금 할 순서" 로 줄 세웁니다. 홈의 "지금 할 일" 이 이 순서의 맨 앞입니다.
 * (끝낸 계획을 빼는 것은 부르는 쪽에서 합니다)
 *
 * ■ 규칙
 * 1. 시작 시각이 이미 된 계획(시작 ≤ 지금)이 가장 먼저. 여럿이면 시작이 빠른 순.
 * 2. 그다음은 시작 시각을 안 정한 계획. 원래 순서 그대로.
 * 3. 마지막은 아직 시작 시각이 안 된 계획. 시작이 빠른 순.
 *
 * ■ 예시 (지금 19:16)
 *   [탐구 21:00, 영어(시각 없음), 국어 19:00] -> [국어 19:00, 영어, 탐구 21:00]
 *   지금이 14:00 이면                         -> [영어, 국어 19:00, 탐구 21:00]
 */
export function sortPlansForNow(plans: StudyPlan[], nowMinutes: number): StudyPlan[] {
  const { blocks, unscheduledPlans } = getTimeline(plans)
  const startedPlans = blocks
    .filter((block) => block.startMinutes <= nowMinutes)
    .map((block) => block.plan)
  const laterPlans = blocks
    .filter((block) => block.startMinutes > nowMinutes)
    .map((block) => block.plan)

  return [...startedPlans, ...unscheduledPlans, ...laterPlans]
}
