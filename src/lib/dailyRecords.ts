import type { StudySession } from '@/types'

/**
 * 공부 기록(세션)을 날짜별로 묶는 함수들입니다. React 없이 돌아가는 순수 함수라서 `lib/` 에 둡니다.
 * "기록" 화면의 날짜별 목록에서 씁니다.
 */

/** 한 과목의 하루 기록 */
export interface SubjectRecord {
  subjectId: string
  /** 그 과목을 그날 공부한 시간 합계 (분) */
  minutes: number
  /** 그 과목의 그날 공부 기록들. 시작 시각이 빠른 것부터 */
  sessions: StudySession[]
}

/** 하루치 기록 */
export interface DailyRecord {
  /** 날짜 'YYYY-MM-DD' */
  date: string
  /** 그날 공부한 시간 합계 (분) */
  totalMinutes: number
  /** 과목별 기록. 공부를 많이 한 과목이 앞에 옵니다. */
  subjects: SubjectRecord[]
}

/** Date 를 'YYYY-MM-DD' 로 만듭니다. (toISOString 은 한국 시간이 아니라서 쓰지 않습니다) */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 시각(밀리초)을 '19:40' 모양으로 바꿉니다. */
export function formatClock(time: number): string {
  const date = new Date(time)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** 분 단위 숫자를 '2시간 14분', '40분' 처럼 바꿉니다. 1분이 안 되면 '1분 미만' 입니다. */
export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '1분 미만'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** 공부 기록 하나의 시간(분). 반올림해서 정수로 쓰고, 끝이 시작보다 빠른 이상한 기록은 0분으로 봅니다. */
export function sessionMinutes(session: StudySession): number {
  return Math.max(0, Math.round((session.endedAt - session.startedAt) / 60000))
}

/**
 * 저장소에서 꺼낸 값이 공부 기록 모양이 맞는지 확인합니다.
 * (깨진 기록 하나 때문에 화면 전체가 멈추거나 NaN 이 보이면 안 되기 때문입니다)
 */
export function isStudySession(value: unknown): value is StudySession {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.subjectId === 'string' &&
    typeof item.startedAt === 'number' &&
    Number.isFinite(item.startedAt) &&
    typeof item.endedAt === 'number' &&
    Number.isFinite(item.endedAt)
  )
}

/**
 * 공부 기록을 날짜별로 묶어서, 최근 날짜가 맨 앞에 오도록 돌려줍니다.
 * 날짜는 공부를 "시작한" 날짜로 정합니다. (밤 11시에 시작해서 다음 날 넘어가도 시작한 날 기록입니다)
 *
 *   const days = groupSessionsByDate(sessions)   // days[0] 이 가장 최근 날짜
 */
export function groupSessionsByDate(sessions: StudySession[]): DailyRecord[] {
  // 날짜 → (과목 → 그 과목의 기록들)
  const byDate = new Map<string, Map<string, StudySession[]>>()

  for (const session of sessions) {
    const date = toDateKey(new Date(session.startedAt))
    const bySubject = byDate.get(date) ?? new Map<string, StudySession[]>()
    bySubject.set(session.subjectId, [...(bySubject.get(session.subjectId) ?? []), session])
    byDate.set(date, bySubject)
  }

  const days: DailyRecord[] = []

  for (const [date, bySubject] of byDate) {
    const subjects: SubjectRecord[] = []

    for (const [subjectId, subjectSessions] of bySubject) {
      const sorted = [...subjectSessions].sort((a, b) => a.startedAt - b.startedAt)
      // 기록마다 먼저 분으로 바꿔서 더합니다. 그래야 과목별 합계를 더한 값이 하루 합계와 항상 같습니다.
      const minutes = sorted.reduce((sum, session) => sum + sessionMinutes(session), 0)
      subjects.push({ subjectId, minutes, sessions: sorted })
    }

    // 많이 공부한 과목이 앞에. 시간이 같으면 먼저 시작한 과목이 앞에.
    subjects.sort(
      (a, b) => b.minutes - a.minutes || a.sessions[0].startedAt - b.sessions[0].startedAt,
    )

    days.push({
      date,
      totalMinutes: subjects.reduce((sum, subject) => sum + subject.minutes, 0),
      subjects,
    })
  }

  // 'YYYY-MM-DD' 는 글자로 비교해도 날짜 순서와 같습니다. 큰 쪽(최근)이 앞에 오게 정렬합니다.
  return days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
