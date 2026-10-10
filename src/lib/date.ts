/** 날짜 계산에 쓰는 순수 함수를 모아둡니다. (계획 화면·체크인 화면 등 여러 곳에서 씁니다) */

/** Date 를 'YYYY-MM-DD' 모양 문자열로 만듭니다. (toISOString() 은 영국 시간 기준이라 쓰지 않습니다) */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' 날짜에서 days 일 만큼 이동한 날짜를 돌려줍니다. (-1 = 어제, 1 = 내일) */
export function moveDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  // new Date(년, 월, 일) 은 일이 범위를 넘어가면 달·해를 알아서 넘겨줍니다. (월은 0부터 시작)
  return toDateKey(new Date(year, month - 1, day + days))
}
