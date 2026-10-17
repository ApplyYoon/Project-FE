/**
 * 통화가 끝난 뒤 결과 화면에서 하는 카드 처리입니다. (기획서 「4.5 상담」 통화 2번 · 4칸 회고, #415)
 *
 *   - 정리 안 한 카드: 원인을 1탭으로 골라 실패로 기록 (#400 과 같은 addCardMark)
 *     설정 '실패 카드 처리 시점' 이 '통화 때' 면, 실패한 카드를 나눠 다른 날에 넣을지도 묻습니다.
 *   - 4칸 회고가 들어간 통화: ④ "카드를 어떻게 고칠까?" 의 답을 카드 수정안(시간 · 체크리스트)으로 만들어,
 *     [이대로 고치기] 를 눌러야 반영합니다.
 */
import { getDaysSinceLastCall, loadCallJudgedDays, loadSinceLastCall } from '@/lib/callCard'
import type { CallModule } from '@/lib/callModules'
import { isMissResult, type CardResult } from '@/lib/cardResult'
import type { Card, ChecklistItem } from '@/types'

/** 결과 화면에서 처리할 카드 하루치 */
export interface CallCardAction {
  card: Card
  /** 그 카드를 하려던 날짜 */
  dateKey: string
  result: CardResult
}

export interface CallCardActions {
  /** 지난 통화 이후 아직 미루기 · 실패를 고르지 않은 카드 */
  unhandled: CallCardAction[]
  /** 지난 통화 이후 미루거나 못 한 카드 (같은 카드는 한 번만) — 4칸 회고 ④ 에서 고칠 카드 고르기 */
  missedCards: Card[]
  /** 이번 통화에 들어간 조건부 모듈 */
  module: CallModule | null
}

/**
 * 결과 화면에서 처리할 카드들. **통화 기록을 적기 전에** 불러야 "지난 통화 이후" 가 이번 통화 전으로 잡힙니다.
 * (결과 화면이 처음 그려질 때 한 번 부르고, 기록은 서버 정리가 끝난 뒤에 적습니다)
 */
export function loadCallCardActions(now: number, todayKey: string): CallCardActions {
  const { cards, judgedDays, lastCallAt } = loadCallJudgedDays(now, todayKey)
  const days = getDaysSinceLastCall(judgedDays, cards, lastCallAt, now)
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const withCard = days.flatMap((day) => {
    const card = cardById.get(day.cardId)
    return card ? [{ card, dateKey: day.dateKey, result: day.result }] : []
  })
  const missedCards = [
    ...new Map(
      withCard.filter((item) => isMissResult(item.result)).map((item) => [item.card.id, item.card]),
    ).values(),
  ]
  return {
    unhandled: withCard.filter((item) => item.result === 'unhandled'),
    missedCards,
    module: loadSinceLastCall(now, todayKey).callModule,
  }
}

/**
 * 실패한 카드를 나눠 다른 날에 넣을 1회성 카드를 만듭니다. 할 일(체크리스트)은 그대로 옮기고 길이만 정합니다.
 * 원래 카드는 그대로 두고(실패로 기록됨), 새 카드를 하나 더 만듭니다.
 *
 *   makeSplitCard({ title: '수학 문제집', durationMinutes: 60, checklist: [a, b] }, '2026-10-18', 30, 1000)
 *     -> { id: 'card-1000', title: '수학 문제집', date: '2026-10-18', durationMinutes: 30, checklist: [a', b'], … }
 */
export function makeSplitCard(card: Card, dateKey: string, minutes: number, now: number): Card {
  const id = `card-${now}`
  const checklist: ChecklistItem[] = card.checklist.map((item, index) => ({
    id: `${id}-item-${index}`,
    text: item.text,
  }))
  return {
    id,
    title: card.title,
    date: dateKey,
    ...(card.startTime ? { startTime: card.startTime } : {}),
    durationMinutes: minutes,
    checklist,
    ...(card.goalId ? { goalId: card.goalId } : {}),
    // 나눈 카드는 다시 미룰 수 있게 유연으로 둡니다. (절대 카드를 나눠도 새 날짜는 학생이 정한 것이라서)
    priority: 'flexible',
    type: card.type,
    createdAt: now,
  }
}

/** 나눌 때 고르는 길이: 원래의 절반 · 원래 그대로 (10분 아래로는 줄이지 않음) */
export function getSplitMinuteOptions(durationMinutes: number): number[] {
  const half = Math.max(10, Math.round(durationMinutes / 2 / 5) * 5)
  return half >= durationMinutes ? [durationMinutes] : [half, durationMinutes]
}
