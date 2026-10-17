/**
 * "이번 주 목표" 한 줄을 제안하고, 달성했는지 판정하는 규칙입니다. (#247)
 *
 * 큰 목표(시험)를 이번 주에 닿을 수 있는 숫자 하나로 쪼갭니다. 한 주에 목표는 하나입니다.
 * 달성했는지는 팩트 숫자(lib/facts.ts)로 자동으로 정해집니다. "지켰어?" 를 묻지 않습니다.
 *
 * 계산하는 함수(getWeeklyGoalCandidates · getWeeklyGoalProgress)는 React·저장소 없이 돌아가고,
 * 맨 아래의 load · save 함수만 저장소를 씁니다.
 */
import type { Facts } from '@/lib/facts'
import { loadData, saveData } from '@/lib/storage'

/** 지난주에 "목표가 있는 타이머" 가 이만큼은 있어야 제안합니다. 이보다 적으면 숫자를 믿기 어렵습니다. */
export const MIN_SAMPLES_TO_SUGGEST = 5
/** 완주율이 이 값(%) 미만이면 완주율 목표를 제안합니다. */
export const COMPLETION_RATE_LIMIT = 60
/** 평균 시작 지연이 이 값(분)을 넘으면 시작 지연 목표를 제안합니다. */
export const START_DELAY_LIMIT_MINUTES = 15
/** 계획 대비 실제가 이 값(%) 미만이면 계획 채우기 목표를 제안합니다. */
export const PLAN_RATE_LIMIT = 80
/** 비율 목표는 지난주보다 이만큼(%p) 높게 잡습니다. */
export const RATE_STEP = 10
/** 시작 지연 목표는 지난주보다 이만큼(분) 짧게 잡습니다. */
export const START_DELAY_STEP_MINUTES = 5

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-weekly-goals' 가 됩니다)
const STORAGE_KEY = 'weekly-goals'

/**
 * 목표의 종류
 *   completion  완주율 ○% 넘기기
 *   startDelay  시작 지연 ○분 안으로
 *   planRate    계획의 ○% 채우기
 *   keep        지난주만큼 (완주율을 지난주 이상으로)
 */
export type WeeklyGoalKind = 'completion' | 'startDelay' | 'planRate' | 'keep'

/** 제안하는 목표 하나 */
export interface WeeklyGoalCandidate {
  kind: WeeklyGoalKind
  /** 목표 숫자. startDelay 는 분, 나머지는 % */
  target: number
  /** 제안할 때 본 지난주 숫자. startDelay 는 분, 나머지는 % */
  baseline: number
}

/** 어느 주에 고른 목표. mondayKey 는 그 주의 월요일('YYYY-MM-DD')입니다. */
export type WeeklyGoal = WeeklyGoalCandidate & { type: 'goal'; mondayKey: string }

/** 그 주에 내가 고른 것. 목표를 골랐거나(goal), 쉬기로 했습니다(rest). */
export type WeeklyGoalChoice = WeeklyGoal | { type: 'rest'; mondayKey: string }

/** 목표의 지금 상태 */
export interface WeeklyGoalProgress {
  /** 지금 숫자. 아직 계산할 수 없으면 null (기록이 없음) */
  current: number | null
  /** achieved: 달성 / missed: 미달 / unknown: 기록이 없어서 알 수 없음 */
  status: 'achieved' | 'missed' | 'unknown'
  /** 진행 막대 길이 (0 ~ 100) */
  percent: number
}

/**
 * 지난주 팩트를 보고 이번 주 목표 후보를 만듭니다. 맨 앞이 가장 먼저 제안할 목표이고,
 * "다른 걸로" 를 누르면 다음 후보로 넘어갑니다. 제안할 수 없으면 빈 배열입니다.
 *
 * ■ 규칙 (위에서부터 맞는 것을 순서대로 후보에 넣습니다)
 *  0. 지난주에 목표가 있는 타이머가 5번 미만이면 제안하지 않습니다. (빈 배열)
 *  1. 완주율이 60% 미만            → 완주율 (지난주 + 10)% 넘기기
 *  2. 평균 시작 지연이 15분 넘음    → 시작 지연 (지난주 − 5)분 안으로
 *  3. 계획 대비 실제가 80% 미만     → 계획의 (지난주 + 10)% 채우기
 *  4. 마지막 후보는 항상 "지난주만큼" (완주율을 지난주 이상으로) 입니다. 1 ~ 3 이 하나도 안 맞으면 이것만 남습니다.
 *  비율 목표는 100% 를, 시작 지연 목표는 0분을 넘어가지 않습니다.
 *
 * ■ 예시 (입력 → 결과)
 *
 *   예1) 규칙 1: 완주율 55%(20번), 지연 10분, 계획 대비 90%
 *        -> [ 완주율 65% 넘기기, 지난주만큼(55%) ]
 *
 *   예2) 규칙 2: 완주율 70%(10번), 지연 23분, 계획 대비 90%
 *        -> [ 시작 지연 18분 안으로, 지난주만큼(70%) ]
 *
 *   예3) 규칙 3: 완주율 70%(10번), 지연 5분, 계획 대비 64%
 *        -> [ 계획의 74% 채우기, 지난주만큼(70%) ]
 *
 *   예4) 규칙 4: 완주율 80%(10번), 지연 5분, 계획 대비 95%
 *        -> [ 지난주만큼(80%) ]
 *
 *   예5) 여러 개가 맞음: 완주율 40%(10번), 지연 30분, 계획 대비 50%
 *        -> [ 완주율 50% 넘기기, 시작 지연 25분 안으로, 계획의 60% 채우기, 지난주만큼(40%) ]
 *
 *   예6) 기록 부족: 목표가 있는 타이머가 4번뿐
 *        -> []
 *
 *   예7) 시작 시각을 정한 계획이 없어서 지연을 모름(null), 계획도 없음(null): 완주율 70%(10번)
 *        -> [ 지난주만큼(70%) ]   (모르는 숫자로는 목표를 만들지 않습니다)
 */
export function getWeeklyGoalCandidates(lastWeek: Facts): WeeklyGoalCandidate[] {
  const completion = lastWeek.completionRate
  // 규칙 0. 완주율이 null 인 경우도 표본이 0 이라 여기서 걸러집니다.
  if (completion.value === null || completion.sampleCount < MIN_SAMPLES_TO_SUGGEST) return []

  const candidates: WeeklyGoalCandidate[] = []

  if (completion.value < COMPLETION_RATE_LIMIT) {
    candidates.push({
      kind: 'completion',
      target: Math.min(completion.value + RATE_STEP, 100),
      baseline: completion.value,
    })
  }

  const delay = lastWeek.startDelayMinutes.value
  if (delay !== null && delay > START_DELAY_LIMIT_MINUTES) {
    candidates.push({
      kind: 'startDelay',
      target: Math.max(delay - START_DELAY_STEP_MINUTES, 0),
      baseline: delay,
    })
  }

  const planRate = lastWeek.planRate.value
  if (planRate !== null && planRate < PLAN_RATE_LIMIT) {
    candidates.push({
      kind: 'planRate',
      target: Math.min(planRate + RATE_STEP, 100),
      baseline: planRate,
    })
  }

  candidates.push({ kind: 'keep', target: completion.value, baseline: completion.value })
  return candidates
}

/**
 * 목표를 한 줄로 보여줄 글자입니다.
 *
 *   getWeeklyGoalTitle({ kind: 'completion', target: 65, … }) -> '완주율 65% 넘기기'
 *   getWeeklyGoalTitle({ kind: 'startDelay', target: 18, … }) -> '시작 지연 18분 안으로'
 *   getWeeklyGoalTitle({ kind: 'planRate', target: 74, … })   -> '계획의 74% 채우기'
 *   getWeeklyGoalTitle({ kind: 'keep', target: 80, … })       -> '이번 주도 지난주만큼 (완주율 80%)'
 */
export function getWeeklyGoalTitle(goal: WeeklyGoalCandidate): string {
  if (goal.kind === 'completion') return `완주율 ${goal.target}% 넘기기`
  if (goal.kind === 'startDelay') return `시작 지연 ${goal.target}분 안으로`
  if (goal.kind === 'planRate') return `계획의 ${goal.target}% 채우기`
  return `이번 주도 지난주만큼 (완주율 ${goal.target}%)`
}

/**
 * 왜 이 목표를 제안하는지 한 줄로 알려 줍니다. 지난주 숫자를 그대로 보여줍니다.
 *
 *   getWeeklyGoalReason({ kind: 'completion', target: 65, baseline: 55 })
 *   -> '지난주 완주율은 55% 였어. 10%p 만 올려 보자.'
 */
export function getWeeklyGoalReason(goal: WeeklyGoalCandidate): string {
  if (goal.kind === 'completion') {
    return `지난주 완주율은 ${goal.baseline}% 였어. ${goal.target - goal.baseline}%p 만 올려 보자.`
  }
  if (goal.kind === 'startDelay') {
    return `지난주엔 평균 ${goal.baseline}분 늦게 시작했어. ${goal.baseline - goal.target}분만 당겨 보자.`
  }
  if (goal.kind === 'planRate') {
    return `지난주엔 계획의 ${goal.baseline}% 를 했어. ${goal.target - goal.baseline}%p 만 더 채워 보자.`
  }
  return '지난주 숫자가 괜찮았어. 이번 주도 그만큼만 하면 돼.'
}

/**
 * 그 주의 팩트로 목표의 지금 상태를 판정합니다. 주가 끝난 뒤에 부르면 그 주의 최종 결과입니다.
 *
 * ■ 규칙
 *  - completion · keep : 완주율이 목표 이상이면 달성
 *  - planRate          : 계획 대비 실제가 목표 이상이면 달성
 *  - startDelay        : 평균 시작 지연이 목표 이하이면 달성 (작을수록 좋은 숫자)
 *  - 그 숫자를 계산할 수 없으면(null) 달성도 미달도 아닌 "알 수 없음" 입니다.
 *  - 막대 길이: 비율 목표는 (지금 ÷ 목표), 시작 지연은 (목표 ÷ 지금). 달성했으면 100 입니다.
 *
 * ■ 예시
 *   목표 "완주율 65% 넘기기", 지금 완주율 60%   -> { current: 60, status: 'missed', percent: 92 }
 *   목표 "완주율 65% 넘기기", 지금 완주율 70%   -> { current: 70, status: 'achieved', percent: 100 }
 *   목표 "시작 지연 18분 안으로", 지금 24분     -> { current: 24, status: 'missed', percent: 75 }
 *   목표 "시작 지연 18분 안으로", 지금 10분     -> { current: 10, status: 'achieved', percent: 100 }
 *   목표 "계획의 74% 채우기", 계획이 없음(null)  -> { current: null, status: 'unknown', percent: 0 }
 */
export function getWeeklyGoalProgress(goal: WeeklyGoalCandidate, facts: Facts): WeeklyGoalProgress {
  let current: number | null
  if (goal.kind === 'startDelay') current = facts.startDelayMinutes.value
  else if (goal.kind === 'planRate') current = facts.planRate.value
  else current = facts.completionRate.value

  if (current === null) return { current: null, status: 'unknown', percent: 0 }

  // 시작 지연만 "작을수록 좋은" 숫자입니다.
  const isAchieved = goal.kind === 'startDelay' ? current <= goal.target : current >= goal.target
  if (isAchieved) return { current, status: 'achieved', percent: 100 }

  const ratio = goal.kind === 'startDelay' ? goal.target / current : current / goal.target
  return { current, status: 'missed', percent: Math.floor(ratio * 100) }
}

/* ---------- 저장 ---------- */

const GOAL_KINDS: WeeklyGoalKind[] = ['completion', 'startDelay', 'planRate', 'keep']

/** 저장소에서 꺼낸 값이 우리가 저장한 모양이 맞는지 확인합니다. (깨진 값이 섞여도 앱이 멈추지 않게) */
function isWeeklyGoalChoice(value: unknown): value is WeeklyGoalChoice {
  if (typeof value !== 'object' || value === null) return false
  const choice = value as Record<string, unknown>
  if (typeof choice.mondayKey !== 'string') return false
  if (choice.type === 'rest') return true
  return (
    choice.type === 'goal' &&
    GOAL_KINDS.includes(choice.kind as WeeklyGoalKind) &&
    typeof choice.target === 'number' &&
    Number.isFinite(choice.target) &&
    typeof choice.baseline === 'number' &&
    Number.isFinite(choice.baseline)
  )
}

/** 지금까지 주마다 고른 것을 모두 불러옵니다. 최근 주가 앞에 오게 줄 세웁니다. */
export function loadWeeklyGoalChoices(): WeeklyGoalChoice[] {
  const saved = loadData<unknown>(STORAGE_KEY, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(isWeeklyGoalChoice).sort((a, b) => (a.mondayKey < b.mondayKey ? 1 : -1))
}

/**
 * beforeMondayKey 보다 앞선 주들에 골랐던 목표를 돌려줍니다. 최근 주가 앞입니다. (쉬기로 한 주는 빠집니다)
 * 주간 리포트의 "지난 목표" 에 씁니다. 이번 주 월요일을 넣으면 이미 끝난 주의 목표만 나옵니다.
 */
export function loadPastWeeklyGoals(beforeMondayKey: string): WeeklyGoal[] {
  const goals: WeeklyGoal[] = []
  for (const choice of loadWeeklyGoalChoices()) {
    if (choice.type === 'goal' && choice.mondayKey < beforeMondayKey) goals.push(choice)
  }
  return goals
}

/** 그 주에 고른 것을 저장합니다. 한 주에 하나라서, 같은 주에 이미 고른 것이 있으면 바꿉니다. */
export function saveWeeklyGoalChoice(choice: WeeklyGoalChoice): void {
  const others = loadWeeklyGoalChoices().filter((item) => item.mondayKey !== choice.mondayKey)
  saveData(STORAGE_KEY, [choice, ...others])
}
