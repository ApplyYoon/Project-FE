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
 * 메시지 설정의 연락 금지 시간('HH:MM')을 안전 브레이크가 받는 모양(시 · 분)으로 바꿉니다.
 *   예) { quietStart: '22:30', quietEnd: '07:00' } -> { startHour: 22, startMinute: 30, endHour: 7, endMinute: 0 }
 */
export function toQuietHours(
  settings: Pick<MessageSettings, 'quietStart' | 'quietEnd'>,
): QuietHours {
  // 'HH:MM' 에서 앞 두 글자가 시, 뒤 두 글자가 분입니다.
  return {
    startHour: Number(settings.quietStart.slice(0, 2)),
    startMinute: Number(settings.quietStart.slice(3, 5)),
    endHour: Number(settings.quietEnd.slice(0, 2)),
    endMinute: Number(settings.quietEnd.slice(3, 5)),
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

/** 휴대폰·컴퓨터의 알림(시스템 알림) 하나에 들어가는 내용입니다. */
export interface SystemNotificationContent {
  /** 굵게 보이는 첫 줄 */
  title: string
  /** 그 아래에 보이는 내용 */
  body: string
  /** 알림의 이름표. 같은 tag 로 또 보내면 새로 쌓이지 않고 하나로 합쳐집니다. */
  tag: string
  /** 알림을 눌렀을 때 열 주소. 예) '/notifications' */
  url: string
}

/** 알림 옆에 보이는 그림. (홈 화면 아이콘과 같은 그림입니다) */
const NOTIFICATION_ICON = '/icons/icon-192.png'

/**
 * 일하고 있는 서비스 워커(public/sw.js)를 찾아 줍니다. 없으면 null 입니다.
 * 개발 서버(pnpm run dev)는 서비스 워커를 등록하지 않아서 null 이 나옵니다. (lib/pwa.ts)
 */
async function getServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null

  const registration = await navigator.serviceWorker.getRegistration()
  if (registration === undefined) return null
  // 등록은 됐지만 아직 준비 중일 수 있어서 준비가 끝날 때까지 기다립니다.
  // (등록된 게 있을 때만 기다립니다. 하나도 없는데 기다리면 영원히 끝나지 않습니다)
  return navigator.serviceWorker.ready
}

/**
 * 시스템 알림을 띄웁니다. 띄웠으면 true, 못 띄웠으면 false 입니다. (에러를 내지 않습니다)
 * 알림 권한이 없으면 아무 일도 하지 않고 false 를 돌려줍니다.
 *
 * ■ 띄우는 방법은 두 가지이고, 위에서부터 됩니다.
 *  1. 서비스 워커에게 부탁하기 — 휴대폰에서 되는 방법은 이것뿐입니다.
 *     안드로이드 크롬은 2번 방법을 막아 두었고, 아이폰은 홈 화면에 추가한 앱에서 이 방법만 됩니다.
 *     알림을 눌렀을 때 할 일은 서비스 워커(public/sw.js 의 'notificationclick')가 맡습니다.
 *  2. 화면이 직접 띄우기(`new Notification()`) — 서비스 워커가 없을 때(개발 서버)만 씁니다. PC 에서만 됩니다.
 *
 * ⚠️ 앱이 열려 있을 때(또는 방금 뒤로 보낸 동안)만 뜹니다. 앱을 완전히 닫아도 오게 하려면 웹 푸시(#256)가 필요합니다.
 *
 *   await showSystemNotification({ title: 'STARFLOW 알림', body: '계획 시간이 지났어요', tag: 'alert-1', url: '/notifications' })
 */
export async function showSystemNotification(content: SystemNotificationContent): Promise<boolean> {
  if (getNotificationPermission() !== 'granted') return false

  try {
    const serviceWorker = await getServiceWorker()
    if (serviceWorker !== null) {
      await serviceWorker.showNotification(content.title, {
        body: content.body,
        tag: content.tag,
        icon: NOTIFICATION_ICON,
        // data: 알림에 붙여 두는 쪽지입니다. 알림을 누르면 서비스 워커가 이 주소를 읽어서 엽니다.
        data: { url: content.url },
      })
      return true
    }

    const notification = new Notification(content.title, {
      body: content.body,
      tag: content.tag,
      icon: NOTIFICATION_ICON,
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
      window.location.assign(content.url)
    }
    return true
  } catch {
    // 브라우저가 막으면(예: 서비스 워커 없는 안드로이드 크롬) 알림만 포기하고 앱은 계속 돌아가게 합니다.
    // 이 에러를 잡지 않으면 앱 전체가 에러 화면이 됩니다.
    return false
  }
}

/**
 * AI 메시지를 시스템 알림으로 띄웁니다. 띄웠으면 true 입니다. 권한이 없으면 아무 일도 하지 않습니다.
 * (메시지 자체는 이 함수와 상관없이 알림 화면에 이미 저장되어 있습니다)
 * 알림을 누르면 알림 화면(/notifications)으로 이동합니다.
 */
export function showAiMessageNotification(message: AiMessage): Promise<boolean> {
  return showSystemNotification({
    // 앱이 정해 둔 문장으로 만든 알림에는 "AI 메시지" 라고 붙이지 않습니다. (AI 가 쓴 글이 아닙니다)
    title: message.source === 'app' ? 'STARFLOW 알림' : 'AI 메시지',
    body: message.text,
    // tag 를 메시지 id 로 두면, 같은 메시지로 또 알림을 보내려 할 때 브라우저가 하나로 합쳐 줍니다.
    tag: message.id,
    url: '/notifications',
  })
}
