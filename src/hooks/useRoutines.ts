import { ROUTINES_KEY, loadRoutines } from '@/lib/routines'
import { saveData } from '@/lib/storage'
import type { Routine } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 루틴(요일마다 반복되는 계획의 틀)을 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 *
 *   const { routines, addRoutine, deleteRoutine } = useRoutines()
 *
 * 루틴을 그날의 계획으로 넣는 일은 usePlans 가 합니다. (lib/routines.ts)
 */
export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>(loadRoutines)

  useEffect(() => {
    saveData(ROUTINES_KEY, routines)
  }, [routines])

  /** 새 루틴을 목록 맨 뒤에 붙입니다. */
  function addRoutine(routine: Routine) {
    setRoutines((prev) => [...prev, routine])
  }

  /** 루틴을 지웁니다. 이미 만들어진 날의 계획은 그대로 남습니다. */
  function deleteRoutine(routineId: string) {
    setRoutines((prev) => prev.filter((routine) => routine.id !== routineId))
  }

  return { routines, addRoutine, deleteRoutine }
}
