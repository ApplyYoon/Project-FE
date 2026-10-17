import { loadData, saveData } from '@/lib/storage'
import type { Card, ChecklistItem } from '@/types'

/**
 * 종료 팝업(최종 기획서 「4.4 타이머」 종료, #398)에서 쓰는 순수 함수들입니다.
 */

/** 체크리스트를 다 했는지 (체크한 항목 id → 시각) */
export function isChecklistComplete(
  checklist: ChecklistItem[],
  checked: Record<string, number>,
): boolean {
  return checklist.every((item) => checked[item.id] !== undefined)
}

/**
 * 잘 된 이유를 이번에 물을지 — 체크리스트를 다 했을 때 N번에 1번 (기본 3번에 1번, 외부 귀인 높음이면 2번에 1번).
 * completedCount 는 이번 것을 포함해 지금까지 체크리스트를 다 한 횟수입니다.
 *
 *   shouldAskGoodReason(1, 3) -> false   (2, 3) -> false   (3, 3) -> true   (6, 3) -> true
 *   shouldAskGoodReason(2, 2) -> true    (1, 2) -> false
 */
export function shouldAskGoodReason(completedCount: number, every: number): boolean {
  return every > 0 && completedCount > 0 && completedCount % every === 0
}

// 체크리스트를 다 한 횟수를 세어 두는 곳 (실제 키는 'study-checklist-complete-count')
const COMPLETE_COUNT_KEY = 'checklist-complete-count'

/** 체크리스트를 다 한 횟수를 하나 올리고, 올린 값을 돌려줍니다 */
export function countChecklistComplete(): number {
  const saved = loadData<unknown>(COMPLETE_COUNT_KEY, 0)
  const next = (typeof saved === 'number' && Number.isFinite(saved) ? saved : 0) + 1
  saveData(COMPLETE_COUNT_KEY, next)
  return next
}

/** [지금 시작] 으로 만든 즉석 카드인지 (제목을 아직 안 정한 카드) */
export function isUntitledInstantCard(card: Pick<Card, 'title'>): boolean {
  return card.title === '지금 시작한 공부'
}

/**
 * 즉석 카드의 제목·체크리스트를 한 줄로 받습니다. ',' 로 나누면 체크리스트 여러 개, 첫 칸이 제목입니다.
 * 이미 체크한 항목이 있으면 그 칸 id 를 그대로 둡니다 (세션 기록과 이어지게).
 *
 *   splitInstantLine('수학 문제집 42쪽', 'k')        -> { title: '수학 문제집 42쪽', checklist: [{ id: 'k-item-0', text: '수학 문제집 42쪽' }] }
 *   splitInstantLine('영어, 단어 50개, 듣기', 'k')    -> { title: '영어', checklist: [단어 50개, 듣기] }
 *   splitInstantLine('   ', 'k')                     -> null (빈 줄)
 */
export function splitInstantLine(
  line: string,
  cardId: string,
): { title: string; checklist: ChecklistItem[] } | null {
  const parts = line
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length === 0) return null
  const title = parts[0]
  const items = parts.length === 1 ? parts : parts.slice(1)
  return {
    title,
    checklist: items.map((text, index) => ({ id: `${cardId}-item-${index}`, text })),
  }
}
