/**
 * 날짜까지 남은 날 · D-day 글자를 만드는 순수 함수와, 예전 시험 기록을 읽는 함수입니다.
 * React 를 쓰지 않아서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 시험 기록 화면(/exams · 시험 결과, #80)은 시연 범위 밖이라 2026-10-18 에 지웠습니다.
 * 시험 날짜는 이제 학교 학사일정(lib/schoolEvents.ts)에서 받습니다.
 * D-day 함수는 목표 · 학교 일정 · 홈이 같이 써서 남겨 둡니다.
 */
import { toDayKey } from '@/lib/date'
import { loadData } from '@/lib/storage'
import type { Exam, ExamType } from '@/types'

// 예전 시험 목록이 들어 있는 저장소 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-exams' 가 됩니다)
// "모든 기록 지우기" 가 이 키도 지웁니다. 이름을 바꾸면 src/lib/myData.ts 도 같이 바꾸세요.
const EXAMS_STORAGE_KEY = 'exams'

/** 예전 시험 기록의 종류 값들 (모양 확인용) */
const EXAM_TYPES: ExamType[] = ['mock', 'school', 'quiz', 'etc']

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

/**
 * D-day 글자를 만듭니다.
 *   12 -> 'D-12'   /   0 -> 'D-day'   /   -3 -> 'D+3' (지난 시험)
 */
export function formatDday(daysUntil: number): string {
  if (daysUntil === 0) return 'D-day'
  return daysUntil > 0 ? `D-${daysUntil}` : `D+${-daysUntil}`
}

/**
 * 저장소에서 꺼낸 값이 시험 한 개의 모양이 맞는지 확인합니다.
 * 저장된 글자는 믿을 수 없어서(손으로 고쳤거나 깨졌을 수 있어서) 불러올 때 하나씩 걸러 냅니다.
 */
function isExam(value: unknown): value is Exam {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    EXAM_TYPES.some((type) => type === item.type) &&
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
 * 이 기기에 남은 예전 시험 기록을 불러옵니다. 모양이 깨진 항목은 버립니다.
 * 새로 적는 화면은 없고, 숲(남긴 회고 수)과 안전 브레이크(예전 회고 글)가 읽기만 합니다.
 */
export function loadExams(): Exam[] {
  const saved = loadData<unknown>(EXAMS_STORAGE_KEY, [])
  return Array.isArray(saved) ? saved.filter(isExam) : []
}
