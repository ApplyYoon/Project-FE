import { getCardResult, getChecklistRate, getRunRate, isStartedOnTime } from '@/lib/cardResult'
import { getCardsOnDate, isOneOffCard } from '@/lib/cards'
import type { CardDayMarkInfo } from '@/lib/restDays'
import type { JudgedCardDay } from '@/lib/relapseSignal'
import { moveDateKey, toDayKey } from '@/lib/date'
import { getSessionCardId } from '@/lib/sessionRecords'
import type { Card, StudySession } from '@/types'

/**
 * 카드 · 세션 · 표시(휴식 · 미루기 · 실패)를 모아 **카드 하루치 판정 목록**을 만듭니다. (#412)
 * 재발 신호(relapseSignal.ts) · 의지력(willpower.ts) · 자기 실험(experiments.ts) · 홈의 매일 판정이 같이 씁니다.
 * React 도 저장소도 쓰지 않는 순수 함수입니다. (표시는 getMark 로 받습니다 — restDays.ts 의 getCardDayMarkInfo)
 */

/**
 * from ~ to(둘 다 포함) 동안 그날 하는 카드마다 판정한 결과를 돌려줍니다.
 * 아직 판정할 수 없는 카드 하루치(카드 시간 전 · 하는 중)는 넣지 않습니다.
 * 노는 기록은 빼고, 카드에 붙은 공부 세션만 봅니다.
 *
 *   카드 A(10/17 19:00 · 60분), 세션 19:05 ~ 20:00, 지금 21:00
 *   buildJudgedCardDays([A], [세션], '2026-10-17', '2026-10-17', 21:00, () => undefined)
 *     -> [ { cardId: 'A', dateKey: '2026-10-17', result: 'done', runRate: 0.92, startedOnTime: true, … } ]
 */
export function buildJudgedCardDays(
  cards: Card[],
  sessions: StudySession[],
  from: string,
  to: string,
  now: number,
  getMark: (cardId: string, dateKey: string) => CardDayMarkInfo | undefined,
): JudgedCardDay[] {
  // 카드 id · 날짜별로 세션을 미리 나눠 둡니다.
  const sessionsByKey = new Map<string, StudySession[]>()
  for (const session of sessions) {
    if (session.kind === 'play') continue
    const cardId = getSessionCardId(session, {})
    if (!cardId) continue
    const key = `${cardId}|${toDayKey(session.startedAt)}`
    sessionsByKey.set(key, [...(sessionsByKey.get(key) ?? []), session])
  }

  const days: JudgedCardDay[] = []
  for (let dateKey = from; dateKey <= to; dateKey = moveDateKey(dateKey, 1)) {
    for (const card of getCardsOnDate(cards, dateKey)) {
      const daySessions = sessionsByKey.get(`${card.id}|${dateKey}`) ?? []
      const markInfo = getMark(card.id, dateKey)
      const cardDay = { card, dateKey, sessions: daySessions, mark: markInfo?.mark }
      const result = getCardResult(cardDay, now)
      if (result === null) continue
      const startedOnTime = isStartedOnTime(cardDay)
      days.push({
        cardId: card.id,
        dateKey,
        isRoutine: !isOneOffCard(card),
        priority: card.priority,
        result,
        runRate: result === 'rest' ? 0 : getRunRate(cardDay),
        // 실패 원인: 대표 원인(하나)과 고른 원인 모두(여러 개)를 같이 넘깁니다. (2026-10-18)
        ...(markInfo?.mark === 'failed' && markInfo.reason ? { missReason: markInfo.reason } : {}),
        ...(markInfo?.mark === 'failed' && markInfo.reasons && markInfo.reasons.length > 0
          ? { missReasons: markInfo.reasons }
          : {}),
        ...(startedOnTime === null ? {} : { startedOnTime }),
        ...(daySessions.length > 0 ? { checklistRate: getChecklistRate(cardDay) } : {}),
      })
    }
  }
  return days
}
