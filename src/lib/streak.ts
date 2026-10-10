import type { StudySession } from '@/types'

/** Date 를 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString 은 한국 시간이 아니라서 쓰지 않습니다) */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 오늘까지 며칠 연속으로 공부했는지 셉니다.
 *
 * - 오늘 공부했으면 오늘부터 하루씩 거꾸로 셉니다.
 * - 오늘 아직 안 했으면 어제부터 셉니다. (오늘은 아직 기회가 남아 있으니까 끊긴 게 아닙니다)
 * - 하루라도 빠진 날을 만나면 거기서 멈춥니다. 그래서 어제도 안 했으면 0 입니다.
 *
 * today 는 "오늘이 언제인지" 입니다. 평소엔 비워 두면 되고, 확인할 때 날짜를 바꿔 넣을 수 있습니다.
 *
 *   기록 0개                       -> 0
 *   오늘만 공부                    -> 1
 *   어제까지 3일 연속, 오늘은 아직 -> 3
 */
export function getStudyStreak(sessions: StudySession[], today: Date = new Date()): number {
  // 공부한 날짜만 모아 둡니다. 하루에 여러 번 공부해도 한 번으로 칩니다.
  const studiedDays = new Set<string>()
  for (const session of sessions) {
    studiedDays.add(toDateKey(new Date(session.startedAt)))
  }

  // 바깥에서 받은 today 를 바꾸지 않도록 복사해서 씁니다.
  const day = new Date(today)

  // 오늘 아직 안 했으면 어제부터 셉니다.
  if (!studiedDays.has(toDateKey(day))) {
    day.setDate(day.getDate() - 1)
  }

  let streak = 0
  while (studiedDays.has(toDateKey(day))) {
    streak += 1
    day.setDate(day.getDate() - 1)
  }
  return streak
}

/** 오늘 공부 기록이 하나라도 있는지 알려줍니다. */
export function hasStudiedToday(sessions: StudySession[], today: Date = new Date()): boolean {
  const todayKey = toDateKey(today)
  return sessions.some((session) => toDateKey(new Date(session.startedAt)) === todayKey)
}
