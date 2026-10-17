import { getCardsOnDate, loadSavedCards, migratePlansToCards, saveCards } from '@/lib/cards'
import { loadRoutines } from '@/lib/routines'
import { loadRecord } from '@/lib/storage'
import type { Card, StudyPlan } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 저장된 카드를 불러옵니다.
 * 카드를 한 번도 저장한 적이 없으면 옛 계획('study-plans')·루틴('study-routines')을 카드로 옮겨서 시작합니다.
 * 옛 저장 값은 지우지 않습니다. (옛 화면이 아직 쓰고 있어서)
 */
function loadCardsOrMigrate(): Card[] {
  const saved = loadSavedCards()
  if (saved !== undefined) return saved

  const migrated = migratePlansToCards(loadRecord<StudyPlan[]>('plans'), loadRoutines(), Date.now())
  saveCards(migrated)
  return migrated
}

/**
 * 카드(최종 기획서 「4.3 카드」)를 들고 있고, 바뀔 때마다 localStorage 에 저장합니다. (#379)
 *
 *   const { cards, getCards, addCard, updateCard, deleteCard } = useCards()
 *   const todayCards = getCards('2026-10-17')   // 그날 하는 카드 (반복 카드 포함, 시작 시각 순)
 */
export function useCards() {
  // 처음 한 번만 저장소에서 불러옵니다.
  const [cards, setCards] = useState<Card[]>(loadCardsOrMigrate)

  // 카드가 바뀔 때마다 저장합니다.
  useEffect(() => {
    saveCards(cards)
  }, [cards])

  /** 그 날짜에 하는 카드를 시작 시각 순서로 돌려줍니다. */
  function getCards(dateKey: string): Card[] {
    return getCardsOnDate(cards, dateKey)
  }

  /** 새 카드를 목록 맨 뒤에 붙입니다. */
  function addCard(card: Card) {
    setCards((prev) => [...prev, card])
  }

  /** 그 카드의 일부 칸만 바꿉니다. (id 는 바꿀 수 없습니다) */
  function updateCard(cardId: string, changes: Partial<Omit<Card, 'id'>>) {
    setCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, ...changes } : card)))
  }

  /** 카드를 지웁니다. 그 카드로 잰 타이머 기록은 그대로 남습니다. */
  function deleteCard(cardId: string) {
    setCards((prev) => prev.filter((card) => card.id !== cardId))
  }

  return { cards, getCards, addCard, updateCard, deleteCard }
}
