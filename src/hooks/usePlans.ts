import { getTodayKey } from '@/lib/date'
import { loadRoutines, takeRoutinePlans } from '@/lib/routines'
import { loadRecord, saveData } from '@/lib/storage'
import type { Routine, StudyPlan } from '@/types'
import { useEffect, useState } from 'react'

/** 날짜('YYYY-MM-DD')마다 그날의 계획 목록을 따로 모아 둔 모양입니다. */
type PlansByDate = Record<string, StudyPlan[]>

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-plans' 가 됩니다)
const STORAGE_KEY = 'plans'

/**
 * 저장된 계획을 불러옵니다. 그리고 오늘 요일의 루틴 중 아직 안 넣은 것이 있으면 오늘 계획에 넣습니다. (#236)
 * 앱을 어느 화면으로 열든(홈·타이머·계획) 오늘의 루틴 계획이 보이도록, 계획을 처음 읽는 이곳에서 채웁니다.
 */
function loadPlansWithTodayRoutines(): PlansByDate {
  // loadRecord: 저장된 값이 깨져 있으면(객체가 아니면) 빈 객체로 시작합니다.
  const saved: PlansByDate = loadRecord<StudyPlan[]>(STORAGE_KEY)
  const todayKey = getTodayKey()
  const newPlans = takeRoutinePlans(todayKey, todayKey, loadRoutines())
  if (newPlans.length === 0) return saved

  const next = { ...saved, [todayKey]: [...(saved[todayKey] ?? []), ...newPlans] }
  // "넣었다" 는 표시는 takeRoutinePlans 가 이미 저장했습니다. 계획도 지금 바로 저장해서 둘이 어긋나지 않게 합니다.
  saveData(STORAGE_KEY, next)
  return next
}

/**
 * 공부 계획을 날짜별로 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 * 새로고침해도 계획이 남아 있고, 처음 들어온 사람은 빈 목록으로 시작합니다.
 *
 *   const { allPlans, getPlans, addPlan, toggleDone, changeStartTime, completePlan, deletePlan } = usePlans()
 *   const todayPlans = getPlans('2026-09-28')
 */
export function usePlans() {
  // 처음 한 번만 저장소에서 불러옵니다. 저장된 게 없으면 빈 객체({})라서 목록이 비어 있습니다.
  // 불러오면서 오늘 요일의 루틴도 오늘 계획에 넣습니다. (하루에 한 번만 들어갑니다)
  const [plansByDate, setPlansByDate] = useState<PlansByDate>(loadPlansWithTodayRoutines)

  // 계획이 바뀔 때마다 저장합니다.
  useEffect(() => {
    saveData(STORAGE_KEY, plansByDate)
  }, [plansByDate])

  /** 그 날짜의 계획 목록을 돌려줍니다. 계획이 없는 날은 빈 배열입니다. */
  function getPlans(date: string): StudyPlan[] {
    return plansByDate[date] ?? []
  }

  /** 모든 날짜의 계획을 한 배열로 합쳐서 돌려줍니다. (홈·검사 화면처럼 여러 날을 볼 때 씁니다) */
  const allPlans: StudyPlan[] = Object.values(plansByDate).flat()

  /** 새 계획을 plan.date 날짜의 목록 맨 뒤에 붙입니다. */
  function addPlan(plan: StudyPlan) {
    setPlansByDate((prev) => ({ ...prev, [plan.date]: [...(prev[plan.date] ?? []), plan] }))
  }

  /** 계획 여러 개를 한 번에 붙입니다. 각 계획은 자기 날짜(plan.date)의 목록 맨 뒤에 들어갑니다. (다른 날 계획 가져오기에 씁니다) */
  function addPlans(plans: StudyPlan[]) {
    setPlansByDate((prev) => {
      const next: PlansByDate = { ...prev }
      for (const plan of plans) {
        next[plan.date] = [...(next[plan.date] ?? []), plan]
      }
      return next
    })
  }

  /**
   * 그 날짜에 아직 안 넣은 루틴이 있으면 계획으로 넣습니다. 오늘과 앞으로의 날짜만 채웁니다.
   * 계획 화면에서 다른 날짜로 옮겨 갈 때 씁니다. (오늘 것은 처음 불러올 때 이미 채웁니다)
   */
  function fillRoutines(date: string, routines: Routine[]) {
    const newPlans = takeRoutinePlans(date, getTodayKey(), routines)
    if (newPlans.length > 0) addPlans(newPlans)
  }

  /** 그 계획의 done 만 뒤집습니다. (나머지는 그대로) */
  function toggleDone(planId: string) {
    setPlansByDate((prev) => {
      const next: PlansByDate = {}
      for (const [date, plans] of Object.entries(prev)) {
        next[date] = plans.map((plan) =>
          plan.id === planId ? { ...plan, done: !plan.done } : plan,
        )
      }
      return next
    })
  }

  /** 그 계획을 "다 했음" 으로 바꿉니다. 이미 다 한 계획이면 그대로입니다. (타이머로 목표 시간을 채웠을 때 씁니다) */
  function completePlan(planId: string) {
    setPlansByDate((prev) => {
      const next: PlansByDate = {}
      for (const [date, plans] of Object.entries(prev)) {
        next[date] = plans.map((plan) => (plan.id === planId ? { ...plan, done: true } : plan))
      }
      return next
    })
  }

  /** 그 계획의 시작 시각을 바꿉니다. 빈 글자('')를 주면 시작 시각을 지워서 "시간 미정" 이 됩니다. (#237) */
  function changeStartTime(planId: string, startTime: string) {
    setPlansByDate((prev) => {
      const next: PlansByDate = {}
      for (const [date, plans] of Object.entries(prev)) {
        next[date] = plans.map((plan) =>
          // undefined 로 두면 저장할 때 startTime 칸이 빠집니다.
          plan.id === planId
            ? { ...plan, startTime: startTime === '' ? undefined : startTime }
            : plan,
        )
      }
      return next
    })
  }

  /** 그 계획을 지웁니다. 그날 계획이 하나도 안 남으면 날짜 칸도 같이 지웁니다. */
  function deletePlan(planId: string) {
    setPlansByDate((prev) => {
      const next: PlansByDate = {}
      for (const [date, plans] of Object.entries(prev)) {
        const remaining = plans.filter((plan) => plan.id !== planId)
        if (remaining.length > 0) next[date] = remaining
      }
      return next
    })
  }

  /** 그 날짜의 계획 목록을 통째로 바꿉니다. (목표 시간 조정 수락처럼 한꺼번에 고칠 때 씁니다) */
  function replaceDayPlans(date: string, plans: StudyPlan[]) {
    setPlansByDate((prev) => ({ ...prev, [date]: plans }))
  }

  return {
    allPlans,
    getPlans,
    addPlan,
    addPlans,
    fillRoutines,
    toggleDone,
    changeStartTime,
    completePlan,
    deletePlan,
    replaceDayPlans,
  }
}
