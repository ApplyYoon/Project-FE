import { loadData, saveData } from '@/lib/storage'
import type { WeeklyReview } from '@/types'

/**
 * 주간 회고(#82)를 불러오고 저장하는 함수입니다.
 * 서버가 생기면 이 파일만 api() 로 바꾸면 됩니다.
 */

const STORAGE_KEY = 'weekly-reviews'

/** 답 하나의 최대 글자 수 */
export const REVIEW_MAX_LENGTH = 100

/** 저장소에서 꺼낸 값이 회고 모양이 맞는지 확인합니다. (깨진 값 때문에 화면이 멈추지 않게) */
function isWeeklyReview(value: unknown): value is WeeklyReview {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.weekStart === 'string' &&
    typeof item.best === 'string' &&
    typeof item.regret === 'string' &&
    typeof item.change === 'string' &&
    typeof item.skipped === 'boolean' &&
    typeof item.savedAt === 'number'
  )
}

/** 저장된 회고를 모두 불러옵니다. 없으면 빈 목록입니다. */
export function loadWeeklyReviews(): WeeklyReview[] {
  const saved = loadData<unknown>(STORAGE_KEY, [])
  return Array.isArray(saved) ? saved.filter(isWeeklyReview) : []
}

/** 그 주(월요일 날짜)의 회고를 찾습니다. 없으면 undefined 입니다. */
export function findWeeklyReview(weekStart: string): WeeklyReview | undefined {
  return loadWeeklyReviews().find((review) => review.weekStart === weekStart)
}

/**
 * 회고를 저장합니다. 같은 주의 회고가 이미 있으면 새 것으로 바꿉니다. (한 주에 하나)
 * 답은 앞뒤 공백을 지우고, 100자가 넘으면 100자까지만 저장합니다.
 */
export function saveWeeklyReview(review: WeeklyReview): void {
  const cleaned: WeeklyReview = {
    ...review,
    best: review.best.trim().slice(0, REVIEW_MAX_LENGTH),
    regret: review.regret.trim().slice(0, REVIEW_MAX_LENGTH),
    change: review.change.trim().slice(0, REVIEW_MAX_LENGTH),
  }
  const others = loadWeeklyReviews().filter((saved) => saved.weekStart !== review.weekStart)
  saveData(STORAGE_KEY, [...others, cleaned])
}
