import { loadData } from '@/lib/storage'
import type { InitialPlan, Routine, Subject } from '@/types'

/**
 * "처음 계획" 을 세울 때 쓰는 함수들입니다. (#240)
 *
 * 처음 계획 = 온보딩 마지막에 하는 약속입니다. (하루에 몇 시간, 일주일에 며칠)
 * 처음의 의지가 가장 클 때 적어 두었다가, 나중에 "처음의 나는 하루 3시간을 약속했는데 지금은 1시간 40분" 처럼
 * 숫자로 비교해서 보여주려고 따로 저장합니다. 루틴을 바꿔도 이 값은 바뀌지 않습니다.
 */

// 처음 계획을 넣어 두는 저장소 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-initial-plan' 이 됩니다)
// 기록이 아니라 내가 한 약속이라 "모든 기록 지우기" 로 지우지 않습니다. (lib/myData.ts)
export const INITIAL_PLAN_KEY = 'initial-plan'

// 처음 계획이 만든 루틴의 id 는 이 글자로 시작합니다.
// "처음 계획 다시 세우기" 를 할 때 이 루틴만 새 초안으로 바꾸고, 내가 직접 만든 루틴은 그대로 두려고 구분합니다.
export const INITIAL_ROUTINE_PREFIX = 'routine-initial-'

/** 하루 목표로 고를 수 있는 시간 (시간 단위) */
export const DAILY_HOUR_OPTIONS = [1, 2, 3, 4, 5]
/** 일주일에 며칠 할지 고를 수 있는 값 */
export const DAYS_PER_WEEK_OPTIONS = [3, 5, 6, 7]

/**
 * "일주일에 며칠" 을 실제 요일로 바꿉니다. (0 = 일요일 … 6 = 토요일)
 *
 *   3 -> [1, 3, 5]            월 · 수 · 금
 *   5 -> [1, 2, 3, 4, 5]      평일
 *   6 -> [1, 2, 3, 4, 5, 6]   월 ~ 토
 *   7 -> [0, 1, 2, 3, 4, 5, 6] 매일
 *   그 밖의 숫자는 평일로 봅니다.
 */
export function getWeekdaysFor(daysPerWeek: number): number[] {
  if (daysPerWeek === 3) return [1, 3, 5]
  if (daysPerWeek === 6) return [1, 2, 3, 4, 5, 6]
  if (daysPerWeek === 7) return [0, 1, 2, 3, 4, 5, 6]
  return [1, 2, 3, 4, 5]
}

/**
 * 하루 목표 시간(분)을 과목 수만큼 나눕니다. 10분 단위로 나누고, 남는 시간은 앞 과목부터 10분씩 더 줍니다.
 *
 * ■ 규칙
 * 1. 한 과목은 최소 10분입니다. (과목이 아주 많으면 합계가 하루 목표보다 커질 수 있습니다)
 * 2. 10분이 안 되는 나머지는 버립니다.
 *
 * ■ 예시
 *   splitMinutes(180, 3) -> [60, 60, 60]
 *   splitMinutes(180, 4) -> [50, 50, 40, 40]   (45분씩이 아니라 10분 단위로)
 *   splitMinutes(120, 3) -> [40, 40, 40]
 *   splitMinutes(60, 1)  -> [60]
 *   splitMinutes(180, 0) -> []
 */
export function splitMinutes(dailyMinutes: number, count: number): number[] {
  if (count <= 0) return []

  // 10분짜리 조각이 몇 개인지 세고, 과목마다 똑같이 나눠 준 뒤 남는 조각을 앞에서부터 하나씩 더 줍니다.
  const totalUnits = Math.floor(dailyMinutes / 10)
  const baseUnits = Math.max(1, Math.floor(totalUnits / count))
  const extraUnits = Math.max(0, totalUnits - baseUnits * count)

  const result: number[] = []
  for (let index = 0; index < count; index++) {
    result.push((baseUnits + (index < extraUnits ? 1 : 0)) * 10)
  }
  return result
}

/**
 * 고른 과목과 시간으로 첫 주 루틴 초안을 만듭니다. 과목마다 루틴 하나입니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * - subjects: 고른 과목들 (보여줄 순서대로)
 * - dailyMinutes: 하루 목표 시간 (분)
 * - daysPerWeek: 일주일에 며칠 (3 · 5 · 6 · 7)
 * - now: id 를 만드는 데 쓰는 지금 시각(Date.now())
 *
 * ■ 예시
 *   createRoutineDraft([국어, 수학, 영어], 180, 5, 1000)
 *   -> [ { id: 'routine-initial-1000-0', weekdays: [1,2,3,4,5], kind: 'study', 국어, '국어 공부', 60분 },
 *        { id: 'routine-initial-1000-1', … 수학, '수학 공부', 60분 },
 *        { id: 'routine-initial-1000-2', … 영어, '영어 공부', 60분 } ]
 *   createRoutineDraft([], 180, 5, 1000) -> []
 */
export function createRoutineDraft(
  subjects: Subject[],
  dailyMinutes: number,
  daysPerWeek: number,
  now: number,
): Routine[] {
  const weekdays = getWeekdaysFor(daysPerWeek)
  const minutesList = splitMinutes(dailyMinutes, subjects.length)

  return subjects.map((subject, index) => ({
    id: `${INITIAL_ROUTINE_PREFIX}${now}-${index}`,
    weekdays,
    kind: 'study',
    subjectId: subject.id,
    content: `${subject.name} 공부`,
    targetMinutes: minutesList[index],
  }))
}

/**
 * 저장해 둔 처음 계획을 불러옵니다. 아직 안 세웠거나 값이 깨져 있으면 null 입니다.
 * (저장소에서 꺼낸 값은 모양이 틀릴 수 있어서 하나씩 확인합니다)
 */
export function loadInitialPlan(): InitialPlan | null {
  const saved = loadData<unknown>(INITIAL_PLAN_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null

  const plan = saved as Record<string, unknown>
  if (
    typeof plan.createdDate !== 'string' ||
    typeof plan.dailyMinutes !== 'number' ||
    typeof plan.daysPerWeek !== 'number'
  ) {
    return null
  }
  return {
    createdDate: plan.createdDate,
    dailyMinutes: plan.dailyMinutes,
    daysPerWeek: plan.daysPerWeek,
  }
}
