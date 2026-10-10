/**
 * "이번 주 팩트" 카드(#245)에 필요한 주 단위 계산입니다. React 없이 돌아가서 `lib/` 에 둡니다.
 * 숫자 자체는 lib/facts.ts 의 getFacts 가 계산하고, 여기서는 "어느 주를", "무엇과 비교할지" 만 정합니다.
 */
import { moveDateKey, toDateKey } from '@/lib/date'
import { getFacts, type FactValue, type Facts } from '@/lib/facts'
import type { StudyPlan, StudySession } from '@/types'

/**
 * 완주율을 숫자로 보여주려면 있어야 하는 "목표가 있는 타이머" 의 최소 개수입니다.
 * 이보다 적으면 한두 번의 결과로 숫자가 크게 흔들려서, 숫자 대신 "○번 더 쌓이면 보여줄게요" 를 보여줍니다.
 */
export const MIN_COMPLETION_SAMPLES = 5

/** 어느 주의 팩트와, 비교할 그 전 주의 팩트입니다. */
export interface WeeklyFacts {
  /** 보여줄 주의 팩트 */
  thisWeek: Facts
  /** 그 전 주(7일 전 월요일 ~ 일요일)의 팩트 */
  lastWeek: Facts
  /** 보여줄 주의 하루 평균 순공시간 (분) */
  dailyAverageMinutes: number
}

/**
 * 그 날짜가 들어 있는 주의 월요일을 돌려줍니다. 한 주는 월요일에 시작합니다. (주간 리포트와 같은 규칙)
 *
 *   getMondayKey(new Date(2026, 9, 10))  -> '2026-10-05'   (10월 10일 토요일 → 그 주 월요일)
 *   getMondayKey(new Date(2026, 9, 11))  -> '2026-10-05'   (일요일은 그 주의 마지막 날)
 *   getMondayKey(new Date(2026, 9, 12))  -> '2026-10-12'   (월요일은 자기 자신)
 */
export function getMondayKey(date: Date): string {
  // getDay(): 일요일 0, 월요일 1 … 토요일 6. 월요일에서 며칠 지났는지 계산합니다. (일요일은 6일 지난 것으로 봅니다)
  const daysFromMonday = (date.getDay() + 6) % 7
  return moveDateKey(toDateKey(date), -daysFromMonday)
}

/**
 * 한 주(월요일 ~ 일요일)의 팩트와 그 전 주의 팩트를 계산합니다.
 *
 * mondayKey 는 보여줄 주의 월요일, todayKey 는 오늘 날짜입니다. (둘 다 'YYYY-MM-DD')
 *
 * ■ 정해 둔 규칙
 *  1. 이번 주(오늘이 들어 있는 주)는 월요일부터 "오늘까지" 만 계산합니다.
 *     아직 오지 않은 날의 계획까지 넣으면 "계획 대비 실제" 가 주초마다 낮게 보이기 때문입니다.
 *  2. 지난 주들은 월요일부터 일요일까지 7일을 모두 계산합니다. 비교하는 "그 전 주" 도 항상 7일입니다.
 *  3. 하루 평균 = 그 주의 순공 합 ÷ 계산한 날 수. 이번 주 수요일이면 3일로 나누고, 지난 주면 7일로 나눕니다.
 *     마지막에 한 번만 반올림합니다.
 *
 * ■ 예시 — 오늘이 2026-10-07(수), 이번 주 월 60분 · 화 0분 · 수 90분 공부
 *   getWeeklyFacts(plans, sessions, '2026-10-05', '2026-10-07')
 *   -> thisWeek 는 10/05 ~ 10/07, lastWeek 는 09/28 ~ 10/04 를 계산
 *   -> dailyAverageMinutes 50   ((60 + 0 + 90) ÷ 3일)
 */
export function getWeeklyFacts(
  plans: StudyPlan[],
  sessions: StudySession[],
  mondayKey: string,
  todayKey: string,
): WeeklyFacts {
  const sundayKey = moveDateKey(mondayKey, 6)
  // 이번 주면 오늘까지만, 지난 주면 일요일까지 봅니다. (규칙 1, 2)
  const endKey = todayKey < sundayKey ? todayKey : sundayKey

  // 월요일부터 끝 날짜까지 며칠인지 셉니다. (1 ~ 7)
  let dayCount = 1
  while (dayCount < 7 && moveDateKey(mondayKey, dayCount) <= endKey) dayCount += 1

  const thisWeek = getFacts(plans, sessions, mondayKey, endKey)
  const lastWeek = getFacts(plans, sessions, moveDateKey(mondayKey, -7), moveDateKey(mondayKey, -1))

  return {
    thisWeek,
    lastWeek,
    dailyAverageMinutes: Math.round(thisWeek.studyMinutes / dayCount),
  }
}

/**
 * 두 주의 숫자 차이(이번 − 그 전)를 구합니다. 화면의 ▲▼ 에 씁니다.
 * 둘 중 하나라도 계산할 수 없는 값(null)이면 비교할 수 없어서 null 이고, 차이가 없을 때도 표시하지 않으려고 null 입니다.
 *
 *   getFactDelta({ value: 64, … }, { value: 56, … })   -> 8
 *   getFactDelta({ value: 18, … }, { value: 23, … })   -> -5
 *   getFactDelta({ value: 64, … }, { value: 64, … })   -> null   (변화 없음)
 *   getFactDelta({ value: 64, … }, { value: null, … }) -> null   (지난주 값을 모름)
 */
export function getFactDelta(current: FactValue, previous: FactValue): number | null {
  if (current.value === null || previous.value === null) return null
  const delta = current.value - previous.value
  return delta === 0 ? null : delta
}
