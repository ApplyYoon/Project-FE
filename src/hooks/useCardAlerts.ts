import { getCardsOnDate, loadSavedCards } from '@/lib/cards'
import { getDueCardAlerts } from '@/lib/cardAlerts'
import { loadAllSessions } from '@/lib/dailyRecords'
import { toDayKey } from '@/lib/date'
import { getMessageSettings } from '@/lib/messageSettings'
import { showSystemNotification, toQuietHours } from '@/lib/notifications'
import { isWithinQuietHours } from '@/lib/safetyBrake'
import { getSessionCardId } from '@/lib/sessionRecords'
import { loadAutoSettings } from '@/lib/settingsMapping'
import { loadRecord, saveData } from '@/lib/storage'
import { isTimerLocked } from '@/lib/timerLock'
import { useEffect } from 'react'

// 보낸 카드 알림 이름을 날짜별로 적어 두는 곳 (실제 키는 'study-card-alerts-sent')
const SENT_KEY = 'card-alerts-sent'
// 몇 초마다 확인할지
const CHECK_INTERVAL_MS = 20 * 1000

/** 지금 보낼 카드 알림이 있으면 시스템 알림으로 띄웁니다. 같은 알림은 한 번만 보냅니다. */
function checkCardAlerts(): void {
  const now = Date.now()
  // 연락 금지 시간에는 보내지 않습니다. 공부 중(타이머 잠금)에도 다른 카드 알림은 보내지 않습니다.
  if (isWithinQuietHours(new Date(now), toQuietHours(getMessageSettings())) || isTimerLocked())
    return

  const dateKey = toDayKey(now)
  const cards = getCardsOnDate(loadSavedCards() ?? [], dateKey)
  if (cards.length === 0) return
  const sentByDate = loadRecord<string[]>(SENT_KEY)
  const sentKeys = new Set(sentByDate[dateKey] ?? [])
  const startedCardIds = new Set(
    loadAllSessions()
      .filter((session) => toDayKey(session.startedAt) === dateKey)
      .map((session) => getSessionCardId(session, {}))
      .filter((id): id is string => id !== undefined),
  )
  const earlyMinutes = loadAutoSettings().earlyAlertMinutes.value
  const due = getDueCardAlerts(cards, dateKey, now, sentKeys, startedCardIds, earlyMinutes)
  if (due.length === 0) return

  for (const alert of due) {
    // 알림을 누르면 사전 질문 없이 그 카드로 바로 시작합니다. (CardTimerPage 의 ?card=)
    void showSystemNotification({
      title: alert.title,
      body: alert.body,
      tag: alert.key,
      url: `/timer?card=${encodeURIComponent(alert.cardId)}`,
    })
  }
  // 오늘 것만 남겨서 저장소가 계속 커지지 않게 합니다.
  saveData(SENT_KEY, { [dateKey]: [...sentKeys, ...due.map((alert) => alert.key)] })
}

/**
 * 카드 시작 알림을 챙깁니다. (#399) 앱이 열려 있는 동안 20초마다 확인합니다. Layout 이 한 번 부릅니다.
 * ⚠️ 앱을 완전히 닫으면 오지 않습니다 — 닫혀 있어도 오게 하는 것은 서버 웹 푸시(#256, BE#31)입니다.
 */
export function useCardAlerts(): void {
  useEffect(() => {
    checkCardAlerts()
    const id = setInterval(checkCardAlerts, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
}
