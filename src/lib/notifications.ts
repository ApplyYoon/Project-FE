/**
 * AI 메시지를 브라우저 알림으로 보내는 함수들을 모아둡니다. (#62)
 *
 * React 를 쓰지 않는 순수 함수(canSendAiMessageNotification)와, 실제로 알림을
 * 띄우는 함수(showAiMessageNotification)를 나눠서, 판단 로직만 따로 테스트할 수 있게 했습니다.
 *
 * 판단에 쓰는 설정들
 * - 연락 금지 시간(#60): getSafetyBrakeResult 에 quietHours 로 넘겨서 적용합니다. (toQuietHours)
 * - 하루 메시지 수(#60): 훅(useAiMessageNotifications)에서 오늘 보낸 개수를 세어 지킵니다.
 * - 관리 강도 최대 한도(#59): canSendAiMessageNotification 의 maxCareLevel 로 거릅니다.
 * - 안전 브레이크(#95): brake 로 넘겨 받습니다.
 */
import type { CareLevel } from '@/lib/careLevel'
import type { MessageSettings } from '@/lib/messageSettings'
import type { QuietHours, SafetyBrakeResult } from '@/lib/safetyBrake'
import type { AiMessage } from '@/types'

// 관리 강도가 이 값 이상이면 "채찍(독촉)" 문구로 봅니다. (3 심리적 채찍, 4 강제적 채찍)
const WHIP_CARE_LEVEL = 3

/**
 * 메시지 설정의 연락 금지 시간('HH:MM')을 안전 브레이크가 받는 시(0~23)로 바꿉니다.
 *   예) { quietStart: '23:00', quietEnd: '07:00' } -> { startHour: 23, endHour: 7 }
 * 안전 브레이크는 "시" 단위만 받아서, 분은 버립니다. ('07:30' 은 7시로 계산되어 30분 일찍 풀립니다)
 */
export function toQuietHours(
  settings: Pick<MessageSettings, 'quietStart' | 'quietEnd'>,
): QuietHours {
  return {
    startHour: Number(settings.quietStart.slice(0, 2)),
    endHour: Number(settings.quietEnd.slice(0, 2)),
  }
}

export interface CanSendAiMessageNotificationInput {
  /** 보내려는 메시지의 관리 강도 */
  careLevel: CareLevel
  /** 안전 브레이크 판정 결과 (getSafetyBrakeResult 의 반환값) */
  brake: Pick<SafetyBrakeResult, 'quiet' | 'stopWhip' | 'recoveryMode'>
  /** 사용자가 정한 관리 강도 최대 한도 (#59). 이 단계보다 센 메시지는 보내지 않습니다. */
  maxCareLevel: CareLevel
}

/**
 * 지금 이 메시지를 브라우저 알림으로 보내도 되는지 판단합니다.
 *
 * 1) 연락 금지 시간이면 무엇이든 보내지 않습니다. (#60)
 *      예1) { careLevel: 1, maxCareLevel: 4, brake: { quiet: true, stopWhip: false, recoveryMode: false } } -> false
 * 2) 사용자가 정한 최대 한도(#59)보다 센 메시지는 보내지 않습니다. (한도는 어떤 경우에도 우선)
 *      예2) { careLevel: 3, maxCareLevel: 2, brake: 모두 꺼짐 } -> false
 *      예3) { careLevel: 2, maxCareLevel: 2, brake: 모두 꺼짐 } -> true (한도와 같으면 보냅니다)
 * 3) 안전 브레이크(#95)가 켜졌으면(stopWhip 또는 recoveryMode) 채찍 메시지(3~4단계)는 보내지 않습니다.
 *      예4) { careLevel: 3, maxCareLevel: 4, brake: { quiet: false, stopWhip: true, recoveryMode: false } } -> false
 *      예5) { careLevel: 3, maxCareLevel: 4, brake: { quiet: false, stopWhip: false, recoveryMode: true } } -> false
 * 4) 그 외에는 보냅니다. 브레이크가 켜져도 당근·넛지(0~2단계)는 그대로 보냅니다.
 *      예6) { careLevel: 1, maxCareLevel: 4, brake: { quiet: false, stopWhip: true, recoveryMode: false } } -> true
 */
export function canSendAiMessageNotification({
  careLevel,
  brake,
  maxCareLevel,
}: CanSendAiMessageNotificationInput): boolean {
  if (brake.quiet) return false
  if (careLevel > maxCareLevel) return false
  if ((brake.stopWhip || brake.recoveryMode) && careLevel >= WHIP_CARE_LEVEL) return false
  return true
}

/** 이 브라우저가 알림 기능을 지원하는지 확인합니다. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** 지금의 알림 권한 상태. 지원하지 않는 브라우저면 'denied' 와 똑같이 취급합니다. */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied'
  return Notification.permission
}

/** 알림 권한을 요청합니다. 이미 허용·거부한 적이 있으면 그 결과를 바로 돌려줍니다. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied'
  return Notification.requestPermission()
}

/**
 * AI 메시지를 브라우저 알림으로 띄웁니다. 권한이 없으면 아무 일도 하지 않습니다.
 * (메시지 자체는 이 함수와 상관없이 메시지함에 이미 저장되어 있습니다)
 * 알림을 누르면 메시지함(/messages)으로 이동합니다.
 *
 * 알림을 띄우지 못하면 에러를 내지 않고 null 을 돌려줍니다.
 * 안드로이드 크롬은 `new Notification()` 을 막아 두어서 권한을 허용해도 TypeError 를 냅니다.
 * 이 에러를 잡지 않으면 앱 전체가 에러 화면이 되기 때문에, 알림만 포기하고 앱은 계속 돌아가게 합니다.
 * (전화 알림 lib/callReminder.ts 도 같은 방식입니다)
 */
export function showAiMessageNotification(message: AiMessage): Notification | null {
  if (getNotificationPermission() !== 'granted') return null

  try {
    // tag 를 메시지 id 로 두면, 같은 메시지로 또 알림을 보내려 할 때 브라우저가 하나로 합쳐 줍니다.
    const notification = new Notification('AI 메시지', { body: message.text, tag: message.id })
    notification.onclick = () => {
      window.focus()
      window.location.assign('/messages')
      notification.close()
    }
    return notification
  } catch {
    return null
  }
}
