/**
 * 시험 화면(#80)에서 쓰는 순수 함수들을 모아 둔 파일입니다.
 * React 를 쓰지 않아서 같은 입력이면 항상 같은 결과가 나옵니다.
 */
import { moveDateKey, toDayKey } from '@/lib/date'
import { loadData } from '@/lib/storage'
import { getStudyMs } from '@/lib/studyTime'
import type { Exam, ExamSubjectScore, ExamType, StudySession } from '@/types'

/** 시험 후 회고 ②③ 한 줄 글의 최대 글자 수 (#81) */
export const REFLECTION_MAX_LENGTH = 100

/** "시험 전 며칠 동안 공부한 시간" 을 볼 때 거슬러 올라가는 일수 (시험 전 2주) */
export const STUDY_LOOKBACK_DAYS = 14

// 시험 목록을 넣어 두는 저장소 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-exams' 가 됩니다)
// "모든 기록 지우기" 가 이 키도 지웁니다. 이름을 바꾸면 src/lib/myData.ts 도 같이 바꾸세요.
export const EXAMS_STORAGE_KEY = 'exams'

/** 시험 종류 버튼에 보여줄 이름. 새 종류가 생기면 여기에 한 줄만 더하면 됩니다. */
export const examTypeOptions: { value: ExamType; label: string }[] = [
  { value: 'mock', label: '모의고사' },
  { value: 'school', label: '내신' },
  { value: 'quiz', label: '쪽지시험' },
  { value: 'etc', label: '기타' },
]

/** 시험 종류의 한국어 이름을 돌려줍니다. */
export function getExamTypeLabel(type: ExamType): string {
  return examTypeOptions.find((option) => option.value === type)?.label ?? '기타'
}

/**
 * 오늘부터 시험 날짜까지 며칠 남았는지 셉니다. (오늘이면 0, 내일이면 1, 어제면 -1)
 * 시각이 아니라 날짜끼리 비교해서, 밤 11시에 봐도 "내일 시험"은 1 입니다.
 * 오늘은 하루의 기준(새벽 4시)으로 정합니다. 새벽 2시에는 아직 어제라서 "오늘 시험"도 1 입니다.
 */
export function getDaysUntil(examDate: string, today: Date = new Date()): number {
  const [year, month, day] = examDate.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = toDayKey(today).split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  const examTime = new Date(year, month - 1, day).getTime()
  const todayTime = new Date(todayYear, todayMonth - 1, todayDay).getTime()
  return Math.round((examTime - todayTime) / msPerDay)
}

/** 'YYYY-MM-DD' 를 '10월 17일 (금)' 처럼 보여줍니다. */
export function formatExamDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' })
  return `${month}월 ${day}일 (${weekday})`
}

/**
 * D-day 글자를 만듭니다.
 *   12 -> 'D-12'   /   0 -> 'D-day'   /   -3 -> 'D+3' (지난 시험)
 */
export function formatDday(daysUntil: number): string {
  if (daysUntil === 0) return 'D-day'
  return daysUntil > 0 ? `D-${daysUntil}` : `D+${-daysUntil}`
}

/**
 * 시험을 "다가오는 시험"과 "지난 시험"으로 나눕니다.
 *  - 다가오는 시험: 오늘 포함, 가까운 날짜가 앞에 옵니다.
 *  - 지난 시험: 어제 이전, 최근 날짜가 앞에 옵니다.
 */
export function splitExams(
  exams: Exam[],
  today: Date = new Date(),
): { upcoming: Exam[]; past: Exam[] } {
  const upcoming = exams
    .filter((exam) => getDaysUntil(exam.date, today) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const past = exams
    .filter((exam) => getDaysUntil(exam.date, today) < 0)
    .sort((a, b) => b.date.localeCompare(a.date))
  return { upcoming, past }
}

/**
 * 점수 입력 글자를 숫자로 바꿉니다. 0~100 사이의 정수만 받고, 아니면 null 입니다.
 *   '85' -> 85   /   '' -> null   /   '101' -> null   /   '8.5' -> null
 * 빈 칸은 "이 과목은 안 적음" 이라서 null 입니다. 호출하는 쪽에서 빈 칸인지 틀린 값인지 구분하세요.
 */
export function parseScore(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 0 || value > 100) return null
  return value
}

/**
 * 저장소에서 꺼낸 값이 시험 한 개의 모양이 맞는지 확인합니다.
 * 저장된 글자는 믿을 수 없어서(손으로 고쳤거나 깨졌을 수 있어서) 불러올 때 하나씩 걸러 냅니다.
 */
export function isExam(value: unknown): value is Exam {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    examTypeOptions.some((option) => option.value === item.type) &&
    Array.isArray(item.subjectScores) &&
    item.subjectScores.every(
      (score) =>
        typeof score === 'object' &&
        score !== null &&
        typeof (score as Record<string, unknown>).subjectId === 'string' &&
        typeof (score as Record<string, unknown>).expectedScore === 'number',
    )
  )
}

/**
 * 저장소에서 시험 목록을 불러옵니다. 모양이 깨진 항목은 버립니다.
 * 화면(useExams)과, 시험 날짜를 읽기만 하는 곳(안전 브레이크 등)이 같이 씁니다.
 */
export function loadExams(): Exam[] {
  const saved = loadData<unknown>(EXAMS_STORAGE_KEY, [])
  return Array.isArray(saved) ? saved.filter(isExam) : []
}

/**
 * 한 과목의 "실제 - 예상" 점수 차이를 돌려줍니다. 실제 점수가 아직 없으면 null 입니다.
 *   예상 85, 실제 80 -> -5   /   예상 80, 실제 83 -> 3
 */
export function getScoreDiff(score: ExamSubjectScore): number | null {
  if (score.actualScore === undefined) return null
  return score.actualScore - score.expectedScore
}

/**
 * 실제 점수가 있는 과목들의 평균 차이를 정수로 돌려줍니다. 하나도 없으면 null 입니다.
 * 소수는 0 에서 먼 쪽으로 반올림합니다. (양수·음수를 똑같이 다루려는 규칙)
 *   차이 -5, -8, -2, -8 -> 평균 -5.75 -> -6
 */
export function getAverageDiff(scores: ExamSubjectScore[]): number | null {
  const diffs = scores.flatMap((score) => {
    const diff = getScoreDiff(score)
    return diff === null ? [] : [diff]
  })
  if (diffs.length === 0) return null

  const average = diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length
  return Math.sign(average) * Math.round(Math.abs(average))
}

/** 실제 점수나 회고가 하나라도 저장돼 있으면 true (결과를 입력한 시험) */
export function hasExamResult(exam: Exam): boolean {
  return (
    exam.reflection !== undefined ||
    exam.subjectScores.some((score) => score.actualScore !== undefined)
  )
}

/** 점수 차이를 부호와 함께 보여줍니다.  3 -> '+3'   /   -5 -> '-5'   /   0 -> '0' */
export function formatDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff)
}

/**
 * 평균 차이로 요약 문장을 만듭니다. 결과 화면은 반말, 시험 목록은 존댓말(isPolite)로 씁니다.
 *   -6 -> '예상보다 평균 6점 낮았어'   /   -6, 존댓말 -> '예상보다 평균 6점 낮았어요'   /   0 -> '예상과 같았어'
 */
export function getResultHeadline(averageDiff: number, isPolite = false): string {
  const ending = isPolite ? '어요' : '어'
  if (averageDiff === 0) return `예상과 같았${ending}`
  const amount = Math.abs(averageDiff)
  return averageDiff > 0
    ? `예상보다 평균 ${amount}점 높았${ending}`
    : `예상보다 평균 ${amount}점 낮았${ending}`
}

/**
 * 예상과 실제의 차이가 큰 과목을 큰 순서대로 count 개 돌려줍니다. (차이가 0 인 과목은 뺍니다)
 * 크기만 보고(부호 무시), 크기가 같으면 원래 순서를 지킵니다.
 */
export function getLargestGapScores(scores: ExamSubjectScore[], count = 2): ExamSubjectScore[] {
  return scores
    .filter((score) => {
      const diff = getScoreDiff(score)
      return diff !== null && diff !== 0
    })
    .sort((a, b) => Math.abs(getScoreDiff(b) ?? 0) - Math.abs(getScoreDiff(a) ?? 0))
    .slice(0, count)
}

/**
 * 시험 전 2주(시험 14일 전 ~ 하루 전) 동안 그 과목을 공부한 시간(분)입니다.
 * 세션은 "시작한 날" 기준으로 세고, 시간은 모두 더한 뒤 마지막에 한 번만 반올림합니다.
 * 시험 당일의 공부는 "시험 전" 이 아니라서 뺍니다.
 */
export function getStudyMinutesBeforeExam(
  sessions: StudySession[],
  examDate: string,
  subjectId: string,
): number {
  const fromDate = moveDateKey(examDate, -STUDY_LOOKBACK_DAYS)
  const toDate = moveDateKey(examDate, -1)

  const totalMs = sessions
    .filter((session) => {
      if (session.subjectId !== subjectId) return false
      const startedDate = toDayKey(session.startedAt)
      return startedDate >= fromDate && startedDate <= toDate
    })
    .reduce((sum, session) => sum + getStudyMs(session), 0)

  return Math.round(totalMs / 60000)
}
