import { loadData, saveData } from '@/lib/storage'
import type { Routine, StudyPlan } from '@/types'

/**
 * 루틴(요일마다 반복되는 계획의 틀)을 그날의 계획으로 바꾸는 함수들입니다. (#236)
 *
 * 루틴은 "틀" 이고, 날마다의 계획은 따로 만들어집니다.
 * 그날 계획을 고치거나 지워도 루틴은 바뀌지 않고, 루틴을 지워도 이미 만들어진 계획은 남습니다.
 */

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙입니다)
export const ROUTINES_KEY = 'routines'
// 날짜마다 "이미 계획으로 넣은 루틴의 id" 를 적어 두는 곳입니다. 예: { '2026-10-10': ['routine-1', 'routine-2'] }
// 이걸 적어 둬야 한 날짜에 한 번만 채우고, 그날 지운 루틴 계획이 다시 생기지 않습니다.
export const ROUTINE_FILLED_KEY = 'routine-filled'

type FilledByDate = Record<string, string[]>

// 요일 숫자(0 = 일요일 … 6 = 토요일)를 이름으로 바꿀 때 씁니다.
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
/** 요일 버튼을 보여주는 순서 (월요일부터). 값은 Date 의 getDay() 와 같은 숫자입니다. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** 요일 숫자 하나를 이름으로 바꿉니다. 1 -> '월' */
export function getWeekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? ''
}

/** 'YYYY-MM-DD' 날짜가 무슨 요일인지 숫자로 돌려줍니다. (0 = 일요일 … 6 = 토요일) */
export function getWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

/**
 * 루틴의 요일 목록을 읽기 쉬운 글자로 바꿉니다.
 *
 *   formatWeekdays([1, 3, 5])              -> '월 · 수 · 금'
 *   formatWeekdays([0, 1, 2, 3, 4, 5, 6])  -> '매일'
 *   formatWeekdays([1, 2, 3, 4, 5])        -> '평일'
 *   formatWeekdays([6, 0])                 -> '주말'
 */
export function formatWeekdays(weekdays: number[]): string {
  const has = (day: number) => weekdays.includes(day)
  const count = WEEKDAY_ORDER.filter(has).length
  if (count === 7) return '매일'
  if (count === 5 && !has(0) && !has(6)) return '평일'
  if (count === 2 && has(0) && has(6)) return '주말'
  // 월요일부터 순서대로 보여줍니다.
  return WEEKDAY_ORDER.filter(has).map(getWeekdayName).join(' · ')
}

/**
 * 그 날짜에 새로 넣어야 할 루틴 계획을 만듭니다. React 도 저장소도 쓰지 않는 순수 함수입니다.
 *
 * ■ 규칙
 * 1. 그 날짜의 요일이 루틴의 요일 목록에 있어야 합니다.
 * 2. 이미 그 날짜에 넣은 적이 있는 루틴(filledRoutineIds)은 다시 만들지 않습니다.
 *    그래서 한 날짜에 한 번만 생기고, 그날 지운 루틴 계획이 되살아나지 않습니다.
 * 3. 지난 날짜(dateKey < todayKey)에는 아무것도 만들지 않습니다.
 *
 * ■ 예시 (2026-10-12 는 월요일, todayKey = '2026-10-10')
 *   루틴 A(월·수·금 수학 60분), 루틴 B(화·목 영어 30분)
 *   getRoutinePlansToAdd([A, B], [], '2026-10-12', '2026-10-10', 1000)
 *     -> [ { id: 'plan-1000-0', date: '2026-10-12', 수학 60분, done: false, routineId: A.id } ]
 *   getRoutinePlansToAdd([A, B], [A.id], '2026-10-12', ...)   -> []  (A 는 이미 넣었음)
 *   getRoutinePlansToAdd([A, B], [], '2026-10-05', '2026-10-10', 1000)  -> []  (지난 날짜)
 */
export function getRoutinePlansToAdd(
  routines: Routine[],
  filledRoutineIds: string[],
  dateKey: string,
  todayKey: string,
  now: number,
): StudyPlan[] {
  // 'YYYY-MM-DD' 는 글자로 비교해도 날짜 순서와 같습니다.
  if (dateKey < todayKey) return []

  const weekday = getWeekday(dateKey)
  return routines
    .filter((routine) => routine.weekdays.includes(weekday))
    .filter((routine) => !filledRoutineIds.includes(routine.id))
    .map((routine, index) => ({
      id: `plan-${now}-${index}`,
      date: dateKey,
      subjectId: routine.subjectId,
      content: routine.content,
      targetMinutes: routine.targetMinutes,
      done: false,
      kind: routine.kind,
      routineId: routine.id,
      // 시작 시각이 있는 루틴만 그 값을 넘깁니다.
      ...(routine.startTime ? { startTime: routine.startTime } : {}),
    }))
}

/** 저장된 루틴 목록을 불러옵니다. 없으면 빈 목록입니다. */
export function loadRoutines(): Routine[] {
  const saved = loadData<unknown>(ROUTINES_KEY, [])
  return Array.isArray(saved) ? (saved as Routine[]) : []
}

/** 그 날짜에 "이미 넣었다" 고 루틴 id 들을 적어 둡니다. */
export function markRoutinesFilled(dateKey: string, routineIds: string[]): void {
  if (routineIds.length === 0) return
  const filled = loadData<FilledByDate>(ROUTINE_FILLED_KEY, {})
  const already = filled[dateKey] ?? []
  saveData(ROUTINE_FILLED_KEY, { ...filled, [dateKey]: [...already, ...routineIds] })
}

/**
 * 그 날짜에 새로 넣을 루틴 계획을 만들고, "넣었다" 는 표시까지 저장한 뒤 돌려줍니다.
 * 돌려받은 계획은 **꼭 계획 목록에 넣어야** 합니다. (표시만 남고 계획이 없으면 그 루틴은 그날 다시 생기지 않습니다)
 *
 * 저장소를 읽고 쓰기 때문에 같은 날짜로 두 번 불러도 두 번째는 빈 목록입니다.
 */
export function takeRoutinePlans(
  dateKey: string,
  todayKey: string,
  routines: Routine[],
): StudyPlan[] {
  const filled = loadData<FilledByDate>(ROUTINE_FILLED_KEY, {})
  const newPlans = getRoutinePlansToAdd(
    routines,
    filled[dateKey] ?? [],
    dateKey,
    todayKey,
    Date.now(),
  )
  markRoutinesFilled(
    dateKey,
    newPlans.map((plan) => plan.routineId ?? ''),
  )
  return newPlans
}
