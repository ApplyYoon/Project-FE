/**
 * 홈의 "숲" 을 계산하는 함수입니다. (기획서 「4.7 목표와 숲」, #404) 예전의 나무 한 그루를 대신합니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * ■ 규칙
 *   - 가운데 전체 나무 1그루: 모든 공부 실행 시간(일시정지 뺌)으로 자랍니다. 늘 가장 큽니다.
 *   - 둘레에 목표 나무: 그 목표에 연결된 카드의 실행 시간으로 자랍니다. 목표가 끝나도 숲에 남습니다.
 *   - 자라는 속도: 실행 시간 10시간마다 한 단계. 씨앗 → 새싹 → 작은 나무 → 큰 나무
 *   - 산출물 증빙(링크·요약)이 있는 세션은 실행 시간의 20% 를 더 쳐 줍니다. (성장 보너스, 출발값)
 *   - 잎: 회고 수 + 인사이트에 반응한 수 / 열매: 효과가 검증된 방법 수 (전체 = 나 사용설명서, 목표 = 그 목표 기간)
 *   - 시듦: **재발 신호(lib/relapseSignal.ts)가 있을 때만.** 목표 나무는 그 목표 카드의 신호로 봅니다.
 *     죽지 않고, 다시 실행해서 신호가 사라지면 회복합니다. **회복 모드(관리 0단계)에서는 시들지 않습니다.**
 *     끝난 목표의 나무는 더 할 카드가 없어서 시들지 않습니다.
 *
 * 옛 나무는 "관리 3단계 이상 + 오늘 공부 안 함" 이면 시들었습니다. 기획서는 한 번의 실수가 아니라 패턴에만 반응합니다.
 */
import type { Card, StudySession } from '@/types'

/** 나무 단계 이름. 0 씨앗 ~ 3 큰 나무 */
export const FOREST_STAGE_NAMES = ['씨앗', '새싹', '작은 나무', '큰 나무'] as const

/** 한 단계 자라는 데 드는 실행 시간 (분) = 10시간 */
export const MINUTES_PER_STAGE = 10 * 60

/** 산출물 증빙이 있는 세션에 더 쳐 주는 비율 (0.2 = 20%, 출발값) */
export const PROOF_BONUS_RATE = 0.2

const LAST_STAGE = FOREST_STAGE_NAMES.length - 1
const MS_PER_MINUTE = 60 * 1000

/** 숲에 들어가는 목표 하나 (lib/goals.ts 의 목표에서 이 칸만 씁니다) */
export interface ForestGoal {
  id: string
  title: string
  /** D-day 가 지나 결과를 기록했거나 그만둔 목표면 true. 숲에는 남고 시들지 않습니다 */
  isFinished: boolean
}

export interface ForestInput {
  /** 카드들. 어느 목표의 카드인지 보려고 씁니다 */
  cards: Pick<Card, 'id' | 'goalId'>[]
  /** 공부 기록들 (노는 기록이 섞여 있어도 됩니다. 여기서 뺍니다) */
  sessions: Pick<
    StudySession,
    'cardId' | 'startedAt' | 'endedAt' | 'pausedMs' | 'kind' | 'endReport'
  >[]
  /** 목표들. 화면에는 이 순서로 놓입니다 (진행 중인 것 먼저) */
  goals: ForestGoal[]
  /** 전체 기준 재발 신호가 있는지 (getRelapseSignal(…).hasSignal) */
  hasRelapse: boolean
  /** 목표 id → 그 목표 카드만으로 본 재발 신호. 없는 목표는 신호 없음 */
  goalRelapse: Record<string, boolean>
  /** 회복 모드(관리 0단계)인지. 회복 모드에서는 시들지 않습니다 */
  isRecoveryMode: boolean
  /** 회고 수 + 인사이트에 반응한 수 (전체 나무의 잎) */
  leafCount: number
  /** 나 사용설명서 항목 수 (전체 나무의 열매) */
  fruitCount: number
  /** 목표 id → 그 목표 기간에 검증된 방법 수 (목표 나무의 열매). 없으면 0 */
  goalFruitCount?: Record<string, number>
}

/** 나무 한 그루 */
export interface ForestTree {
  /** 목표 나무면 목표 id, 전체 나무면 null */
  goalId: string | null
  /** 나무 이름 (전체 나무는 '나', 목표 나무는 목표 제목) */
  title: string
  /** 자란 실행 시간 (분, 증빙 보너스 포함) */
  growthMinutes: number
  /** 단계 번호. 0 씨앗 ~ 3 큰 나무 */
  stage: number
  stageName: string
  /** 큰 나무까지 다 자랐으면 true */
  isFullGrown: boolean
  /** 다음 단계까지 남은 분. 다 자랐으면 0 */
  minutesToNextStage: number
  /** 지금 단계 안에서 얼마나 자랐는지 (0 ~ 100) */
  progressPercent: number
  isWilted: boolean
  /** 끝난 목표의 나무면 true */
  isFinished: boolean
  leafCount: number
  fruitCount: number
}

export interface ForestState {
  /** 가운데 전체 나무 */
  main: ForestTree
  /** 둘레의 목표 나무들. 진행 중인 목표 먼저, 끝난 목표는 뒤 (각각 입력 순서) */
  goals: ForestTree[]
}

/** 음수·NaN 같은 이상한 값을 0 으로 바꿉니다. (깨진 기록 때문에 숲이 이상해지지 않게) */
function toSafeCount(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** 세션 하나가 숲에서 자라게 하는 분. 일시정지는 빼고, 증빙이 있으면 20% 를 더합니다. */
function growthOf(session: ForestInput['sessions'][number]): number {
  const ms = session.endedAt - session.startedAt - (session.pausedMs ?? 0)
  if (!Number.isFinite(ms) || ms <= 0) return 0
  // 산출물 증빙은 종료 팝업(#398)에서 받아 endReport.proof 에 있습니다.
  const proof = session.endReport?.proof
  const hasProof = Boolean(proof?.link?.trim() || proof?.summary?.trim())
  return (ms / MS_PER_MINUTE) * (hasProof ? 1 + PROOF_BONUS_RATE : 1)
}

/** 자란 분으로 단계 · 진행률을 계산해 나무 한 그루를 만듭니다. */
function makeTree(
  base: Pick<
    ForestTree,
    'goalId' | 'title' | 'isWilted' | 'isFinished' | 'leafCount' | 'fruitCount'
  >,
  growthMinutes: number,
): ForestTree {
  const minutes = Math.floor(growthMinutes)
  const stage = Math.min(Math.floor(minutes / MINUTES_PER_STAGE), LAST_STAGE)
  const isFullGrown = stage === LAST_STAGE
  const inStage = minutes - stage * MINUTES_PER_STAGE
  return {
    ...base,
    growthMinutes: minutes,
    stage,
    stageName: FOREST_STAGE_NAMES[stage],
    isFullGrown,
    minutesToNextStage: isFullGrown ? 0 : MINUTES_PER_STAGE - inStage,
    progressPercent: isFullGrown ? 100 : Math.round((inStage / MINUTES_PER_STAGE) * 100),
  }
}

/**
 * 카드 · 공부 기록 · 목표 · 재발 신호로 숲을 계산합니다.
 *
 *   예) 기록 없음, 목표 없음                          → 전체 나무만 (씨앗, 다음 단계까지 600분)
 *   예) 전체 1,500분, 목표 A 카드 700분               → 전체 '작은 나무' · 목표 A '새싹'
 *   예) 목표 A 카드 세션 60분 + 증빙 있음              → 목표 A 72분 자람 (60 × 1.2)
 *   예) 재발 신호 있음                                → 전체 나무 시듦
 *   예) 재발 신호 있음 + 회복 모드                    → 안 시듦
 *   예) 목표 A 의 카드만 재발 신호                    → 목표 A 나무만 시듦, 전체 나무는 그대로
 *   예) 끝난 목표 B (재발 신호가 있어도)               → 숲에 남고 안 시듦, 진행 중인 목표 뒤에 놓임
 *   예) 카드에 안 붙은 옛 공부 기록 120분              → 전체 나무에만 들어감
 */
export function getForestState(input: ForestInput): ForestState {
  const goalIdByCardId = new Map<string, string>()
  for (const card of input.cards) {
    if (card.goalId) goalIdByCardId.set(card.id, card.goalId)
  }

  // 노는 기록은 빼고, 전체 나무와 목표마다 자란 분을 더합니다.
  // 카드에 안 붙은 옛 공부 기록(카드가 생기기 전 계획으로 한 공부)도 전체 나무에는 넣습니다. 그동안 키운 나무가 줄어들지 않게.
  let mainMinutes = 0
  const goalMinutes = new Map<string, number>()
  for (const session of input.sessions) {
    if (session.kind === 'play') continue
    const minutes = growthOf(session)
    mainMinutes += minutes
    const goalId = session.cardId ? goalIdByCardId.get(session.cardId) : undefined
    if (goalId) goalMinutes.set(goalId, (goalMinutes.get(goalId) ?? 0) + minutes)
  }

  const main = makeTree(
    {
      goalId: null,
      title: '나',
      isWilted: input.hasRelapse && !input.isRecoveryMode,
      isFinished: false,
      leafCount: toSafeCount(input.leafCount),
      fruitCount: toSafeCount(input.fruitCount),
    },
    mainMinutes,
  )

  const toGoalTree = (goal: ForestGoal) =>
    makeTree(
      {
        goalId: goal.id,
        title: goal.title,
        isWilted: !goal.isFinished && input.goalRelapse[goal.id] === true && !input.isRecoveryMode,
        isFinished: goal.isFinished,
        // 목표 나무의 잎은 아직 목표별로 세지 않습니다. (회고 · 인사이트 반응이 목표에 붙어 있지 않아서)
        leafCount: 0,
        fruitCount: toSafeCount(input.goalFruitCount?.[goal.id]),
      },
      goalMinutes.get(goal.id) ?? 0,
    )
  const goals = [
    ...input.goals.filter((goal) => !goal.isFinished).map(toGoalTree),
    ...input.goals.filter((goal) => goal.isFinished).map(toGoalTree),
  ]

  return { main, goals }
}
