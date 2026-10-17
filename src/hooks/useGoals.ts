import { canAddGoal, changeGoalTarget, getActiveGoals, loadGoals, saveGoals } from '@/lib/goals'
import type { Goal } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 목표(최종 기획서 「4.7」)를 들고 있고, 바뀔 때마다 localStorage('study-goals')에 저장합니다. (#391)
 *
 *   const { goals, activeGoals, addGoal, changeTarget, updateGoal } = useGoals()
 *   addGoal(goal)      // 진행 중 목표가 이미 3개면 false 를 돌려주고 저장하지 않습니다
 *   updateGoal(goal)   // 같은 id 의 목표를 통째로 바꿉니다 (진척 적기 · 목표 점검, lib/goalProgress.ts)
 */
export function useGoals() {
  // 처음 한 번만 저장소에서 불러옵니다.
  const [goals, setGoals] = useState<Goal[]>(loadGoals)

  // 목표가 바뀔 때마다 저장합니다.
  useEffect(() => {
    saveGoals(goals)
  }, [goals])

  /** 새 목표를 붙입니다. 진행 중 목표가 3개면 붙이지 않고 false 를 돌려줍니다. */
  function addGoal(goal: Goal): boolean {
    if (!canAddGoal(goals)) return false
    setGoals((prev) => [...prev, goal])
    return true
  }

  /** 목표값을 고칩니다. 고치기 전 값은 그 목표의 history 에 남습니다. (lib/goals.ts 의 changeGoalTarget) */
  function changeTarget(
    goalId: string,
    changes: Parameters<typeof changeGoalTarget>[1],
    reason: string,
  ) {
    const now = Date.now()
    setGoals((prev) =>
      prev.map((goal) =>
        goal.id === goalId ? changeGoalTarget(goal, changes, reason, now) : goal,
      ),
    )
  }

  /** 같은 id 의 목표를 통째로 바꿉니다. 진척 적기 · 목표 점검(유지 · 수정 · 포기)에서 씁니다. (#403) */
  function updateGoal(next: Goal) {
    setGoals((prev) => prev.map((goal) => (goal.id === next.id ? next : goal)))
  }

  return { goals, activeGoals: getActiveGoals(goals), addGoal, changeTarget, updateGoal }
}
