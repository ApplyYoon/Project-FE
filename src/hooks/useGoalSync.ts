import { useIsServerData } from '@/hooks/useIsServerData'
import { GOALS_CHANGED_EVENT, type GoalsChangedDetail } from '@/lib/goals'
import { serverGoalsQuery } from '@/lib/goalsApi'
import { applyServerGoals, markGoalChanges, pushPendingGoals } from '@/lib/goalSync'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * 이 기기의 목표를 서버와 맞춥니다. (#516, 규칙은 lib/goalSync.ts)
 * 모든 화면에 늘 있는 Layout 에서 한 번만 부릅니다. 테스트 로그인이면 아무것도 하지 않습니다.
 *
 *   1) 이 기기에서 목표를 저장하면 바뀐 것을 보낼 목록에 적고 바로 서버로 보냅니다.
 *   2) 앱을 열 때 서버의 목표를 받아 다른 기기에서 바뀐 것을 반영하고, 못 보낸 것을 다시 보냅니다.
 */
export function useGoalSync(): void {
  const isServerData = useIsServerData()

  useEffect(() => {
    if (!isServerData) return
    function handleGoalsChanged(event: Event) {
      const { prev, next, source } = (event as CustomEvent<GoalsChangedDetail>).detail
      // 서버에서 받은 것으로 맞춘 저장은 다시 보내지 않습니다.
      if (source !== 'local') return
      markGoalChanges(prev, next)
      // 목표는 한 번에 한 칸씩 고치는 일이 드물어서 기다리지 않고 바로 보냅니다.
      void pushPendingGoals()
    }
    window.addEventListener(GOALS_CHANGED_EVENT, handleGoalsChanged)
    // 로그아웃하거나 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(GOALS_CHANGED_EVENT, handleGoalsChanged)
  }, [isServerData])

  // 서버의 목표는 TanStack Query 로 받습니다. (docs/DATA-FETCHING.md) 받으면 이 기기의 목표와 맞춥니다.
  const { data: serverGoals } = useQuery({ ...serverGoalsQuery(), enabled: isServerData })
  useEffect(() => {
    if (!serverGoals) return
    applyServerGoals(serverGoals)
    void pushPendingGoals()
  }, [serverGoals])
}
