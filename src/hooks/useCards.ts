import {
  CARDS_CHANGED_EVENT,
  CARDS_KEY,
  getCardsOnDate,
  loadSavedCards,
  migratePlansToCards,
  saveCards,
} from '@/lib/cards'
import { loadRoutines } from '@/lib/routines'
import { loadRecord, saveData } from '@/lib/storage'
import type { Card, StudyPlan } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 저장된 카드를 불러옵니다.
 * 카드를 한 번도 저장한 적이 없으면 옛 계획('study-plans')·루틴('study-routines')을 카드로 옮겨서 시작합니다.
 * 옛 저장 값은 지우지 않습니다.
 * (옮긴 카드는 화면을 그리는 중이라 알림 없이 바로 저장합니다. 서버에는 다음에 서버와 맞출 때 올라갑니다, lib/cardSync.ts)
 */
function loadCardsOrMigrate(): Card[] {
  const saved = loadSavedCards()
  if (saved !== undefined) return saved

  const migrated = migratePlansToCards(loadRecord<StudyPlan[]>('plans'), loadRoutines(), Date.now())
  saveData(CARDS_KEY, migrated)
  return migrated
}

/**
 * 카드(최종 기획서 「4.3 카드」)를 들고 있습니다. (#379)
 * 고칠 때는 저장소의 최신 카드를 고쳐서 바로 저장합니다(saveCards). 저장하면 이벤트가 나가서,
 * 같은 카드를 들고 있는 다른 화면도 다시 읽고 서버로도 보냅니다. (hooks/useCardSync.ts, #516)
 *
 *   const { cards, getCards, addCard, updateCard, deleteCard } = useCards()
 *   const todayCards = getCards('2026-10-17')   // 그날 하는 카드 (반복 카드 포함, 시작 시각 순)
 */
export function useCards() {
  // 처음 한 번만 저장소에서 불러옵니다.
  const [cards, setCards] = useState<Card[]>(loadCardsOrMigrate)

  // 다른 화면이나 서버 맞추기에서 카드가 저장되면 다시 읽습니다.
  useEffect(() => {
    function handleCardsChanged() {
      setCards(loadSavedCards() ?? [])
    }
    window.addEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
    // 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
  }, [])

  /** 저장소의 최신 카드 목록을 고쳐서 저장합니다. (이 훅의 화면은 이벤트로 다시 그려집니다) */
  function change(update: (current: Card[]) => Card[]) {
    saveCards(update(loadSavedCards() ?? []))
  }

  /** 그 날짜에 하는 카드를 시작 시각 순서로 돌려줍니다. */
  function getCards(dateKey: string): Card[] {
    return getCardsOnDate(cards, dateKey)
  }

  /** 새 카드를 목록 맨 뒤에 붙입니다. */
  function addCard(card: Card) {
    change((current) => [...current, card])
  }

  /** 그 카드의 일부 칸만 바꿉니다. (id 는 바꿀 수 없습니다) */
  function updateCard(cardId: string, changes: Partial<Omit<Card, 'id'>>) {
    change((current) =>
      current.map((card) => (card.id === cardId ? { ...card, ...changes } : card)),
    )
  }

  /** 카드를 지웁니다. 그 카드로 잰 타이머 기록은 그대로 남습니다. */
  function deleteCard(cardId: string) {
    change((current) => current.filter((card) => card.id !== cardId))
  }

  return { cards, getCards, addCard, updateCard, deleteCard }
}
