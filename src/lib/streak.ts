import { toDayKey } from '@/lib/date'
import type { StudySession } from '@/types'

/**
 * 오늘까지 며칠 연속으로 공부했는지 셉니다.
 *
 * - 오늘 공부했으면 오늘부터 하루씩 거꾸로 셉니다.
 * - 오늘 아직 안 했으면 어제부터 셉니다. (오늘은 아직 기회가 남아 있으니까 끊긴 게 아닙니다)
 * - 하루라도 빠진 날을 만나면 거기서 멈춥니다. 그래서 어제도 안 했으면 0 입니다.
 *
 * - 노는 기록(kind 가 'play')만 있는 날은 공부한 날이 아닙니다. (#238)
 *
 * 날짜는 하루의 기준(새벽 4시)으로 셉니다. 새벽 2시에 한 공부는 전날 공부입니다. (lib/date.ts 의 toDayKey)
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
    if (session.kind === 'play') continue
    studiedDays.add(toDayKey(session.startedAt))
  }

  // 바깥에서 받은 today 를 바꾸지 않도록 복사해서 씁니다.
  const day = new Date(today)

  // 오늘 아직 안 했으면 어제부터 셉니다.
  if (!studiedDays.has(toDayKey(day))) {
    day.setDate(day.getDate() - 1)
  }

  let streak = 0
  while (studiedDays.has(toDayKey(day))) {
    streak += 1
    day.setDate(day.getDate() - 1)
  }
  return streak
}

/** 오늘 공부 기록이 하나라도 있는지 알려줍니다. (노는 기록은 세지 않습니다) */
export function hasStudiedToday(sessions: StudySession[], today: Date = new Date()): boolean {
  const todayKey = toDayKey(today)
  return sessions.some(
    (session) => session.kind !== 'play' && toDayKey(session.startedAt) === todayKey,
  )
}
