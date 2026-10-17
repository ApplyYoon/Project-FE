import {
  GOALS_CHANGED_EVENT,
  canAddGoal,
  changeGoalTarget,
  getActiveGoals,
  loadGoals,
  saveGoals,
} from '@/lib/goals'
import type { Goal } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 목표(최종 기획서 「4.7」)를 들고 있습니다. (#391)
 * 고칠 때는 저장소의 최신 목표를 고쳐서 바로 저장합니다(saveGoals). 저장하면 이벤트가 나가서,
 * 같은 목표를 들고 있는 다른 화면도 다시 읽고 서버로도 보냅니다. (hooks/useGoalSync.ts, #516)
 *
 *   const { goals, activeGoals, addGoal, changeTarget, updateGoal } = useGoals()
 *   addGoal(goal)      // 진행 중 목표가 이미 3개면 false 를 돌려주고 저장하지 않습니다
 *   updateGoal(goal)   // 같은 id 의 목표를 통째로 바꿉니다 (진척 적기 · 목표 점검, lib/goalProgress.ts)
 */
export function useGoals() {
  // 처음 한 번만 저장소에서 불러옵니다.
  const [goals, setGoals] = useState<Goal[]>(loadGoals)

  // 다른 화면이나 서버 맞추기에서 목표가 저장되면 다시 읽습니다.
  useEffect(() => {
    function handleGoalsChanged() {
      setGoals(loadGoals())
    }
    window.addEventListener(GOALS_CHANGED_EVENT, handleGoalsChanged)
    // 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(GOALS_CHANGED_EVENT, handleGoalsChanged)
  }, [])

  /** 저장소의 최신 목표 목록을 고쳐서 저장합니다. (이 훅의 화면은 이벤트로 다시 그려집니다) */
  function change(update: (current: Goal[]) => Goal[]) {
    saveGoals(update(loadGoals()))
  }

  /** 새 목표를 붙입니다. 진행 중 목표가 3개면 붙이지 않고 false 를 돌려줍니다. */
  function addGoal(goal: Goal): boolean {
    if (!canAddGoal(loadGoals())) return false
    change((current) => [...current, goal])
    return true
  }

  /** 목표값을 고칩니다. 고치기 전 값은 그 목표의 history 에 남습니다. (lib/goals.ts 의 changeGoalTarget) */
  function changeTarget(
    goalId: string,
    changes: Parameters<typeof changeGoalTarget>[1],
    reason: string,
  ) {
    const now = Date.now()
    change((current) =>
      current.map((goal) =>
        goal.id === goalId ? changeGoalTarget(goal, changes, reason, now) : goal,
      ),
    )
  }

  /** 같은 id 의 목표를 통째로 바꿉니다. 진척 적기 · 목표 점검(유지 · 수정 · 포기)에서 씁니다. (#403) */
  function updateGoal(next: Goal) {
    // 서버 번호는 저장소의 것을 지킵니다. (화면이 서버 번호가 붙기 전의 목표로 next 를 만들었을 수 있어서)
    change((current) =>
      current.map((goal) => (goal.id === next.id ? { ...next, serverId: goal.serverId } : goal)),
    )
  }

  return { goals, activeGoals: getActiveGoals(goals), addGoal, changeTarget, updateGoal }
}
