/**
 * 시험 화면(#80)에서 쓰는 순수 함수들을 모아 둔 파일입니다.
 * React 를 쓰지 않아서 같은 입력이면 항상 같은 결과가 나옵니다.
 */
import { toDateKey } from '@/lib/date'
import type { Exam, ExamType } from '@/types'

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
 */
export function getDaysUntil(examDate: string, today: Date = new Date()): number {
  const [year, month, day] = examDate.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = toDateKey(today).split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  const examTime = new Date(year, month - 1, day).getTime()
  const todayTime = new Date(todayYear, todayMonth - 1, todayDay).getTime()
  return Math.round((examTime - todayTime) / msPerDay)
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
