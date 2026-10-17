/** 날짜 계산에 쓰는 순수 함수를 모아둡니다. (계획 화면·체크인 화면 등 여러 곳에서 씁니다) */

/**
 * Date 를 'YYYY-MM-DD' 모양 문자열로 만듭니다. (toISOString() 은 영국 시간 기준이라 쓰지 않습니다)
 * 달력의 날짜(new Date(년, 월, 일))를 글자로 바꿀 때만 씁니다.
 * "지금" 이나 "기록을 시작한 시각" 을 날짜로 바꿀 때는 아래 toDayKey 를 쓰세요. (새벽 4시 기준)
 */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 하루가 시작되는 시각(시)입니다. 밤늦게 공부하는 학생이 많아서 새벽 4시에 날짜가 바뀝니다.
 * 00:00 ~ 03:59 에 한 일은 전날로 칩니다. (BE 의 DayRule, Project-BE docs/API.md 2-4 와 같은 규칙)
 */
export const DAY_START_HOUR = 4

/**
 * 하루의 기준(새벽 4시)만큼 시계를 되돌린 Date 를 돌려줍니다.
 * 이 Date 의 년·월·일·요일이 "그 순간이 속한 날" 입니다. (시·분은 4시간 전 값이라 쓰지 않습니다)
 * "오늘의 6일 전" 처럼 년·월·일을 꺼내 날짜를 계산할 때 씁니다.
 */
export function toDayDate(time: number | Date): Date {
  const ms = typeof time === 'number' ? time : time.getTime()
  return new Date(ms - DAY_START_HOUR * 60 * 60 * 1000)
}

/**
 * 어떤 순간이 "몇 월 며칠" 에 속하는지 'YYYY-MM-DD' 로 돌려줍니다. (하루의 기준 = 새벽 4시)
 * "오늘이 며칠인지", "이 기록이 며칠 것인지" 는 toDateKey 가 아니라 이 함수로 구합니다.
 * 한 곳이라도 자정 기준으로 세면 화면마다 숫자가 서로 안 맞습니다.
 *
 *   9월 28일 23:30 -> '2026-09-28'
 *   9월 29일 01:30 -> '2026-09-28' (전날)
 *   9월 29일 03:59 -> '2026-09-28' (전날)
 *   9월 29일 04:00 -> '2026-09-29'
 */
export function toDayKey(time: number | Date): string {
  return toDateKey(toDayDate(time))
}

/** 오늘 날짜를 'YYYY-MM-DD' 로 돌려줍니다. 새벽 4시 전이면 어제 날짜입니다. */
export function getTodayKey(): string {
  return toDayKey(Date.now())
}

/** 'YYYY-MM-DD' 날짜에서 days 일 만큼 이동한 날짜를 돌려줍니다. (-1 = 어제, 1 = 내일) */
export function moveDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  // new Date(년, 월, 일) 은 일이 범위를 넘어가면 달·해를 알아서 넘겨줍니다. (월은 0부터 시작)
  return toDateKey(new Date(year, month - 1, day + days))
}

/**
 * 글자가 'YYYY-MM-DD' 모양의 "진짜 있는 날짜" 인지 확인합니다.
 * 주소(?date=...)처럼 누구나 고칠 수 있는 곳에서 받은 날짜를 쓰기 전에 확인하는 데 씁니다.
 *
 *   isDateKey('2026-10-11') -> true
 *   isDateKey('2026-13-01') -> false  (13월은 없음)
 *   isDateKey('2026-02-30') -> false  (2월 30일은 없음)
 *   isDateKey('내일')       -> false
 */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  // 없는 날짜를 넣으면 Date 가 다음 달로 넘겨 버립니다. 다시 글자로 바꿨을 때 같아야 진짜 날짜입니다.
  return toDateKey(new Date(year, month - 1, day)) === value
}

/**
 * 글자가 'YYYY-MM' 모양의 달인지 확인합니다. (예: '2026-10')
 *
 *   isMonthKey('2026-10') -> true
 *   isMonthKey('2026-13') -> false
 *   isMonthKey('2026-1')  -> false  (두 자리로 적어야 합니다)
 */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}
