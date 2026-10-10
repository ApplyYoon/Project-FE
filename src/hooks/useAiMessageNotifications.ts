import { countUnreadAiMessages, loadAiMessages } from '@/lib/aiMessages'
import { getCareLimits } from '@/lib/careLimits'
import { toDateKey } from '@/lib/date'
import { getMessageSettings } from '@/lib/messageSettings'
import {
  canSendAiMessageNotification,
  showAiMessageNotification,
  toQuietHours,
} from '@/lib/notifications'
import { getSafetyBrakeResult } from '@/lib/safetyBrake'
import { loadData, saveData } from '@/lib/storage'
import type { CheckIn } from '@/types'
import { useEffect } from 'react'

// 한 번 알림을 보낸 메시지의 id 를 저장해 두는 키. 새로고침하거나 다른 페이지로 가도
// 똑같은 메시지로 또 알림이 뜨지 않게 막아줍니다.
const NOTIFIED_IDS_KEY = 'ai-message-notified-ids'

// 오늘 알림을 몇 번 보냈는지 저장해 두는 키. 하루 메시지 수(#60)를 지키는 데 씁니다.
const SENT_TODAY_KEY = 'ai-message-sent-today'

/** 오늘 보낸 알림 개수. date 가 오늘이 아니면 어제 기록이라 0 으로 칩니다. */
interface SentToday {
  date: string
  count: number
}

/**
 * 앱이 열려 있는 동안, 아직 알림을 보내지 않은 안 읽은 AI 메시지를 찾아
 * 브라우저 알림으로 띄웁니다. Layout 에서 한 번만 불러서 씁니다.
 *
 * 알림을 보내기 전에 아래 설정을 모두 지킵니다.
 * - 연락 금지 시간, 하루 메시지 수 (#60 메시지 설정)
 * - 관리 강도 최대 한도 (#59)
 * - 안전 브레이크 (#95): 최근 체크인의 기분·글로 판정합니다.
 *
 * ⚠️ 일기 원문(#63)은 아직 develop 에 없어서 안전 브레이크에 넘기지 못합니다.
 * 일기가 생기면 recentTexts 에 일기 글도 같이 넣어 주세요. (시험 목록 #80 도 아직 없어서 빈 배열입니다)
 */
export function useAiMessageNotifications(): void {
  useEffect(() => {
    const messages = loadAiMessages()
    if (countUnreadAiMessages(messages) === 0) return

    const settings = getMessageSettings()
    const limits = getCareLimits()
    const today = toDateKey(new Date())

    // 체크인(#24)의 기분과 약속 글을 안전 브레이크 입력으로 씁니다.
    const checkIns = Object.values(loadData<Record<string, CheckIn>>('checkins', {}))
    const brake = getSafetyBrakeResult({
      now: new Date(),
      recentTexts: checkIns.flatMap((checkIn) => [
        checkIn.promiseIf ?? '',
        checkIn.promiseThen ?? '',
      ]),
      recentMoods: checkIns.map((checkIn) => ({ date: checkIn.date, mood: checkIn.mood })),
      exams: [],
      quietHours: toQuietHours(settings),
    })

    const notifiedIds = new Set(loadData<string[]>(NOTIFIED_IDS_KEY, []))
    const savedSent = loadData<SentToday>(SENT_TODAY_KEY, { date: today, count: 0 })
    // 날짜가 지났으면 0 부터 다시 셉니다.
    let sentCount = savedSent.date === today ? savedSent.count : 0

    const newlyNotifiedIds: string[] = []
    for (const message of messages) {
      if (message.read || notifiedIds.has(message.id)) continue

      const hasRoomToday = sentCount < settings.dailyCount
      const canSend = canSendAiMessageNotification({
        careLevel: message.careLevel,
        brake,
        maxCareLevel: limits.maxCareLevel,
      })
      if (hasRoomToday && canSend) {
        showAiMessageNotification(message)
        sentCount += 1
      }
      // 보냈든 조건에 걸려 건너뛰었든, 같은 메시지를 또 검사하지 않도록 기록해 둡니다.
      newlyNotifiedIds.push(message.id)
    }

    if (newlyNotifiedIds.length > 0) {
      saveData(NOTIFIED_IDS_KEY, [...notifiedIds, ...newlyNotifiedIds])
      saveData<SentToday>(SENT_TODAY_KEY, { date: today, count: sentCount })
    }
  }, [])
}
