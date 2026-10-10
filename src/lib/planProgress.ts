import { getStudyMs } from '@/lib/studyTime'
import type { StudyPlan, StudySession } from '@/types'

const MS_PER_MINUTE = 60 * 1000

/** 계획 하나가 얼마나 진행됐는지 */
export interface PlanProgress {
  /** 그 계획으로 실제 공부한 시간 (분). 1분이 안 되는 나머지는 버립니다 */
  actualMinutes: number
  /** 목표 대비 진행률 (0 ~ 100, 소수점은 버립니다) */
  percent: number
  /** 목표 시간을 채웠으면 true */
  isReached: boolean
  /** 목표까지 남은 시간 (분, 올림). 채웠으면 0 */
  remainingMinutes: number
}

/**
 * 계획 하나에 연결된 공부 기록(planId 가 그 계획인 기록)의 순공시간을 모두 더합니다. (밀리초)
 * 순공시간은 일시정지한 시간을 뺀 값입니다. (lib/studyTime.ts)
 */
export function getPlanStudyMs(planId: string, sessions: StudySession[]): number {
  let totalMs = 0
  for (const session of sessions) {
    if (session.planId === planId) totalMs += getStudyMs(session)
  }
  return totalMs
}

/**
 * 계획 하나의 "실제 / 목표" 를 계산합니다. 계획 줄의 `32 / 50분` 과 진행 막대, 자동 완료에 씁니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * ■ 규칙
 * 1. 그 계획에서 타이머를 시작한 기록(planId 가 같은 기록)만 셉니다. 과목이 같아도 planId 가 없으면 세지 않습니다.
 * 2. 목표를 채웠는지는 분이 아니라 밀리초로 비교합니다. (49분 59초는 50분 계획을 못 채운 것입니다)
 * 3. 목표 시간이 0 이하인 계획은 진행률을 계산할 수 없어서 0%, "못 채움" 입니다.
 *
 * ■ 예시 (50분 계획)
 *   기록 없음                 -> { actualMinutes: 0,  percent: 0,   isReached: false, remainingMinutes: 50 }
 *   32분 공부                 -> { actualMinutes: 32, percent: 64,  isReached: false, remainingMinutes: 18 }
 *   20분 + 30분 두 번 공부     -> { actualMinutes: 50, percent: 100, isReached: true,  remainingMinutes: 0 }
 *   49분 59초 공부            -> { actualMinutes: 49, percent: 99,  isReached: false, remainingMinutes: 1 }
 *   70분 공부 (목표를 넘김)    -> { actualMinutes: 70, percent: 100, isReached: true,  remainingMinutes: 0 }
 */
export function getPlanProgress(plan: StudyPlan, sessions: StudySession[]): PlanProgress {
  const actualMs = getPlanStudyMs(plan.id, sessions)
  const actualMinutes = Math.floor(actualMs / MS_PER_MINUTE)
  const targetMs = plan.targetMinutes * MS_PER_MINUTE

  if (!(targetMs > 0)) {
    return { actualMinutes, percent: 0, isReached: false, remainingMinutes: 0 }
  }

  const isReached = actualMs >= targetMs
  return {
    actualMinutes,
    percent: isReached ? 100 : Math.floor((actualMs * 100) / targetMs),
    isReached,
    remainingMinutes: isReached ? 0 : Math.ceil((targetMs - actualMs) / MS_PER_MINUTE),
  }
}

/** 하루치 계획이 얼마나 진행됐는지 (홈의 "오늘 계획" 카드에 씁니다) */
export interface DayProgress {
  /** 공부 계획의 수 */
  totalCount: number
  /** 그중 끝낸(체크한) 계획의 수 */
  doneCount: number
  /** 공부 계획들로 실제 공부한 시간의 합 (분). 계획 줄에 보이는 숫자를 그대로 더한 값입니다 */
  actualMinutes: number
  /** 공부 계획들의 목표 시간의 합 (분) */
  targetMinutes: number
  /** 목표 대비 진행률 (0 ~ 100, 소수점은 버립니다) */
  percent: number
}

/**
 * 하루치 계획(plans)을 모아서 "2 / 4 완료 · 1시간 42분 / 4시간" 에 쓸 숫자를 계산합니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * ■ 규칙
 * 1. 노는 계획(kind 가 'play')은 공부가 아니라서 개수와 시간 어디에도 넣지 않습니다.
 * 2. 실제 시간은 계획마다 getPlanProgress 로 구한 분을 더합니다. (계획 줄의 숫자를 더하면 이 값이 됩니다)
 * 3. 목표 시간의 합이 0 이면 진행률은 0% 입니다.
 *
 * ■ 예시
 *   수학 60분(60분 함, 끝냄) · 영어 30분(30분 함, 끝냄) · 국어 50분(12분 함) · 게임 60분(놀기) · 탐구 100분(안 함)
 *   -> { totalCount: 4, doneCount: 2, actualMinutes: 102, targetMinutes: 240, percent: 42 }
 *   계획이 없는 날
 *   -> { totalCount: 0, doneCount: 0, actualMinutes: 0, targetMinutes: 0, percent: 0 }
 */
export function getDayProgress(plans: StudyPlan[], sessions: StudySession[]): DayProgress {
  const studyPlans = plans.filter((plan) => plan.kind !== 'play')

  let doneCount = 0
  let actualMinutes = 0
  let targetMinutes = 0
  for (const plan of studyPlans) {
    if (plan.done) doneCount += 1
    actualMinutes += getPlanProgress(plan, sessions).actualMinutes
    targetMinutes += plan.targetMinutes
  }

  return {
    totalCount: studyPlans.length,
    doneCount,
    actualMinutes,
    targetMinutes,
    percent:
      targetMinutes > 0 ? Math.min(100, Math.floor((actualMinutes * 100) / targetMinutes)) : 0,
  }
}
