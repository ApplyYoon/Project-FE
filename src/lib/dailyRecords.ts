import { toDayKey } from '@/lib/date'
import { getDaySummary } from '@/lib/daySummary'
import { loadData } from '@/lib/storage'
import { getStudyMs } from '@/lib/studyTime'
import type { StudySession } from '@/types'

/**
 * 공부 기록(세션)을 날짜별로 묶는 함수들입니다. React 없이 돌아가는 순수 함수라서 `lib/` 에 둡니다.
 * "기록" 화면의 날짜별 목록에서 씁니다.
 *
 * ■ 시간 계산 규칙 (하루 요약 getDaySummary 와 같은 규칙입니다. 같은 날이 화면마다 다르게 보이면 안 되기 때문입니다)
 *   - 기록 길이(밀리초)를 먼저 모두 더하고, 마지막에 한 번만 분으로 반올림합니다.
 *     기록마다 반올림하지 않습니다. (30초짜리 10개 = 5분. 하나씩 반올림하면 10분이 됩니다)
 *   - 기록 하나의 길이는 순공시간(끝 − 시작 − 일시정지한 시간)입니다. getStudyMs 가 계산합니다.
 *   - 끝이 시작보다 빠른 잘못된 기록은 0분으로 칩니다.
 *   - 날짜는 공부를 "시작한" 날로 정합니다.
 *   - 그래서 과목별 시간을 더한 값이 하루 합계와 1~2분 다를 수 있습니다. (각각 한 번씩 반올림하기 때문입니다)
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

/**
 * 공부 기록 하나의 시간(분). 목록의 한 줄에 "50분" 처럼 보여줄 때만 씁니다.
 * 합계를 낼 때는 이 값을 더하지 말고 sumMinutes 를 쓰세요. (기록마다 반올림하면 합계가 어긋납니다)
 */
export function sessionMinutes(session: StudySession): number {
  return Math.round(getStudyMs(session) / 60000)
}

/** 기록들의 시간을 밀리초로 모두 더한 뒤, 마지막에 한 번만 분으로 반올림합니다. 이상한 기록(끝이 시작보다 빠름)은 0 으로 칩니다. */
function sumMinutes(sessions: StudySession[]): number {
  const totalMs = sessions.reduce((sum, session) => sum + getStudyMs(session), 0)
  return Math.round(totalMs / 60000)
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
 * 타이머가 저장해 둔 기록을 전부(공부 + 놀기) 불러옵니다. 저장된 게 없으면 빈 목록입니다.
 * 모양이 틀린 기록은 걸러냅니다.
 * 계획별 실제 시간(`32 / 50분`)처럼 노는 기록도 필요한 곳에서만 씁니다.
 */
export function loadAllSessions(): StudySession[] {
  const saved = loadData<unknown>('sessions', [])
  return Array.isArray(saved) ? saved.filter(isStudySession) : []
}

/**
 * 타이머가 저장해 둔 공부 기록을 불러옵니다. 저장된 게 없으면 빈 목록입니다. (예시 기록으로 채우지 않습니다)
 * 노는 기록(kind 가 'play')은 공부가 아니라서 뺍니다. 순공 · 달성률 · 인사이트 계산에는 이 함수를 씁니다. (#238)
 *
 *   const sessions = loadStudySessions()
 */
export function loadStudySessions(): StudySession[] {
  return loadAllSessions().filter((session) => session.kind !== 'play')
}

/**
 * 공부 기록을 날짜별로 묶어서, 최근 날짜가 맨 앞에 오도록 돌려줍니다.
 * 날짜는 공부를 "시작한" 날짜로 정합니다. (밤 11시에 시작해서 다음 날 넘어가도 시작한 날 기록입니다)
 * 하루는 새벽 4시에 바뀝니다. 새벽 2시에 시작한 공부는 전날 기록입니다. (lib/date.ts 의 toDayKey)
 *
 *   const days = groupSessionsByDate(sessions)   // days[0] 이 가장 최근 날짜
 */
export function groupSessionsByDate(sessions: StudySession[]): DailyRecord[] {
  // 날짜 → (과목 → 그 과목의 기록들)
  const byDate = new Map<string, Map<string, StudySession[]>>()

  for (const session of sessions) {
    const date = toDayKey(session.startedAt)
    const bySubject = byDate.get(date) ?? new Map<string, StudySession[]>()
    bySubject.set(session.subjectId, [...(bySubject.get(session.subjectId) ?? []), session])
    byDate.set(date, bySubject)
  }

  const days: DailyRecord[] = []

  for (const [date, bySubject] of byDate) {
    const subjects: SubjectRecord[] = []

    for (const [subjectId, subjectSessions] of bySubject) {
      const sorted = [...subjectSessions].sort((a, b) => a.startedAt - b.startedAt)
      subjects.push({ subjectId, minutes: sumMinutes(sorted), sessions: sorted })
    }

    // 많이 공부한 과목이 앞에. 시간이 같으면 먼저 시작한 과목이 앞에.
    subjects.sort(
      (a, b) => b.minutes - a.minutes || a.sessions[0].startedAt - b.sessions[0].startedAt,
    )

    // 하루 합계는 하루 요약 함수(getDaySummary)가 계산합니다. 통화 요약·리포트와 같은 값이 나오도록
    // 같은 함수를 그대로 씁니다. (계획은 필요 없어서 빈 목록을 넘깁니다)
    const daySessions = subjects.flatMap((subject) => subject.sessions)
    const { studyMinutes } = getDaySummary(date, [], daySessions)

    days.push({ date, totalMinutes: studyMinutes, subjects })
  }

  // 'YYYY-MM-DD' 는 글자로 비교해도 날짜 순서와 같습니다. 큰 쪽(최근)이 앞에 오게 정렬합니다.
  return days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
