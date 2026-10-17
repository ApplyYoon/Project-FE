import { CARDS_KEY, loadCards } from '@/lib/cards'
import { saveData } from '@/lib/storage'
import type { Card } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 카드(#379)를 들고 있고, 바뀔 때마다 localStorage('study-cards')에 저장합니다.
 * 처음 열 때 카드가 하나도 저장돼 있지 않으면 옛 계획·루틴을 카드로 옮겨 옵니다. (lib/cards.ts)
 *
 *   const { cards, getCard, addCard, updateCard, deleteCard } = useCards()
 *   updateCard('card-1', { priority: 'absolute' })
 */
export function useCards() {
  // 처음 한 번만 저장소에서 불러옵니다. (필요하면 이때 옛 계획·루틴을 옮깁니다)
  const [cards, setCards] = useState<Card[]>(loadCards)

  // 카드가 바뀔 때마다 저장합니다.
  useEffect(() => {
    saveData(CARDS_KEY, cards)
  }, [cards])

  /** id 로 카드 하나를 찾습니다. 없으면 undefined */
  function getCard(cardId: string): Card | undefined {
    return cards.find((card) => card.id === cardId)
  }

  /** 새 카드를 목록 맨 뒤에 붙입니다. */
  function addCard(card: Card) {
    setCards((prev) => [...prev, card])
  }

  /**
   * 카드의 일부 칸만 바꿉니다. 바꾸지 않은 칸은 그대로 남습니다. id 는 바꿀 수 없습니다.
   *   updateCard('card-1', { title: '영어 단어 50개' })
   */
  function updateCard(cardId: string, changes: Partial<Omit<Card, 'id'>>) {
    setCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, ...changes } : card)))
  }

  /** 카드를 지웁니다. 그 카드로 잰 공부 기록은 그대로 남습니다. */
  function deleteCard(cardId: string) {
    setCards((prev) => prev.filter((card) => card.id !== cardId))
  }

  return { cards, getCard, addCard, updateCard, deleteCard }
}
