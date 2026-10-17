/**
 * 시험을 점수형 목표에 붙이고, 시험 3일 전에 예상 점수를 묻는 규칙입니다. (기획서 「4.7 목표와 숲」 시험 이벤트, #403)
 * React 를 쓰지 않는 순수 함수입니다.
 *
 *   시험 3일 전 ~ 시험 날: 목표에 붙은 시험인데 예상을 안 골랐으면 "이번 시험 몇 등급 나올 것 같아?" 를 1탭으로 묻습니다.
 *   시험이 끝나면: 실제 점수와 회고 3문항은 시험 결과 화면(ExamResultPage, #81)에서 받습니다.
 *   시험 직전 3일 · 직후 2일 채찍 상한 2 는 안전 브레이크(safetyBrake.ts)가 모든 시험에 이미 적용합니다.
 */
import { getDaysUntil } from '@/lib/exams'
import type { Exam, Goal } from '@/types'

/** 시험 며칠 전부터 예상을 묻는지 */
export const EXAM_PREDICTION_DAYS = 3

/** 등급으로 고르는 보기 (1등급 ~ 9등급) */
export const GRADE_OPTIONS = [
  '1등급',
  '2등급',
  '3등급',
  '4등급',
  '5등급',
  '6등급',
  '7등급',
  '8등급',
  '9등급',
]

/** 예상 점수로 적을 수 있는 글자 수 (예: '72점', '2~3등급') */
export const PREDICTION_MAX_LENGTH = 10

/**
 * 지금 이 시험의 예상을 물어야 하는지. 목표에 붙은 시험이고, 아직 안 골랐고, 시험이 0 ~ 3일 남았을 때
 *
 *   목표 연결 · 예상 없음 · 3일 남음  -> true
 *   목표 연결 · 예상 없음 · 4일 남음  -> false (아직 이름)
 *   목표 연결 · 예상 없음 · 어제 시험 -> false (지남)
 *   목표 연결 안 함                   -> false
 */
export function needsGoalPrediction(exam: Exam, today: Date = new Date()): boolean {
  if (!exam.goalId || exam.goalPrediction) return false
  const daysLeft = getDaysUntil(exam.date, today)
  return daysLeft >= 0 && daysLeft <= EXAM_PREDICTION_DAYS
}

/**
 * 목표가 등급으로 세는 목표인지. 목표 한 줄이나 시작할 때 점수에 '등급' 이 있으면 등급 보기(1 ~ 9등급)로 1탭에 고릅니다.
 * 아니면(점수 · 백분위 등) 한 줄로 적습니다.
 *
 *   { title: '11월 학평 수학 3등급' }               -> true
 *   { title: '중간고사 수학 90점', currentScore: '72점' } -> false
 */
export function isGradeGoal(goal: Pick<Goal, 'title' | 'currentScore'>): boolean {
  return goal.title.includes('등급') || (goal.currentScore ?? '').includes('등급')
}

/** 그 목표에 붙은 시험들 (날짜 순) */
export function getGoalExams(exams: Exam[], goalId: string): Exam[] {
  return exams
    .filter((exam) => exam.goalId === goalId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** 시험에 예상을 적습니다. 앞뒤 빈칸을 떼고 글자 수를 넘으면 자릅니다. */
export function setGoalPrediction(exam: Exam, prediction: string): Exam {
  return { ...exam, goalPrediction: prediction.trim().slice(0, PREDICTION_MAX_LENGTH) }
}
