/** 딴짓(자리 비움) 안내에 쓰는, React 와 상관없는 작은 함수들입니다. */

/** 밀리초를 '12분', '45초', '1시간 5분' 처럼 읽기 쉬운 글자로 바꿉니다. */
export function formatAwayDuration(ms: number): string {
  // 0초라고 쓰면 어색해서 최소 1초로 보여줍니다.
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}초`

  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** 시각(밀리초)을 '14:02' 처럼 시:분으로 바꿉니다. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    // h23: 0~23시로 보여줍니다. (hour12: false 는 브라우저에 따라 자정을 '24:05' 로 보여줘서 쓰지 않습니다)
    hourCycle: 'h23',
  })
}

/** 시각(밀리초)을 'YYYY-MM-DD' 로 바꿉니다. (toISOString 은 한국 시간이 아니라서 직접 만듭니다) */
export function toDateString(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
