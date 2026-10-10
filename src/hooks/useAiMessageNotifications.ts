import { countUnreadAiMessages, loadAiMessages } from '@/lib/aiMessages'
import { canSendAiMessageNotification, showAiMessageNotification } from '@/lib/notifications'
import { getSafetyBrakeResult } from '@/lib/safetyBrake'
import { loadData, saveData } from '@/lib/storage'
import { useEffect } from 'react'

// 한 번 알림을 보낸 메시지의 id 를 저장해 두는 키. 새로고침하거나 다른 페이지로 가도
// 똑같은 메시지로 또 알림이 뜨지 않게 막아줍니다.
const NOTIFIED_IDS_KEY = 'ai-message-notified-ids'

/**
 * 앱이 열려 있는 동안, 아직 알림을 보내지 않은 안 읽은 AI 메시지를 찾아
 * 브라우저 알림으로 띄웁니다. Layout 에서 한 번만 불러서 씁니다.
 *
 * ⚠️ 위기 표현·기분 저하 감지(#95)는 일기·체크인 글이 있어야 정확한데,
 * 아직 그 데이터를 주는 기능(#24, #63)이 develop 에 없어서 지금은 빈 값으로 둡니다.
 * 그 기능들이 생기면 recentTexts·recentMoods 자리에 실제 데이터를 넣어 주세요.
 * 연락 금지 시간(기본 23시~7시)은 지금도 그대로 적용됩니다.
 */
export function useAiMessageNotifications(): void {
  useEffect(() => {
    const messages = loadAiMessages()
    if (countUnreadAiMessages(messages) === 0) return

    const notifiedIds = new Set(loadData<string[]>(NOTIFIED_IDS_KEY, []))
    const brake = getSafetyBrakeResult({
      now: new Date(),
      recentTexts: [],
      recentMoods: [],
      exams: [],
    })

    const newlyNotifiedIds: string[] = []
    for (const message of messages) {
      if (message.read || notifiedIds.has(message.id)) continue

      if (canSendAiMessageNotification({ careLevel: message.careLevel, brake })) {
        showAiMessageNotification(message)
      }
      // 보냈든 조건에 걸려 건너뛰었든, 같은 메시지를 또 검사하지 않도록 기록해 둡니다.
      newlyNotifiedIds.push(message.id)
    }

    if (newlyNotifiedIds.length > 0) {
      saveData(NOTIFIED_IDS_KEY, [...notifiedIds, ...newlyNotifiedIds])
    }
  }, [])
}
