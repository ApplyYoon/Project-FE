/**
 * AI 메시지를 브라우저 알림으로 보내는 함수들을 모아둡니다. (#62)
 *
 * React 를 쓰지 않는 순수 함수(canSendAiMessageNotification)와, 실제로 알림을
 * 띄우는 함수(showAiMessageNotification)를 나눠서, 판단 로직만 따로 테스트할 수 있게 했습니다.
 *
 * ⚠️ 지금은 안전 브레이크(#95)만 연동합니다. 아래 두 가지는 아직 없어서 적용하지 못합니다.
 * - 메시지 빈도·연락 금지 시간을 사용자가 직접 바꾸는 설정 (#60, 아직 develop 에 없음)
 *   → 지금은 getSafetyBrakeResult 의 기본 연락 금지 시간(23시~7시)만 적용됩니다.
 * - 채찍 강도 한도 설정 (#59, 아직 develop 에 없음) → 한도를 넘는 메시지를 거르는 부분은
 *   그 설정의 저장·조회 함수가 생기면 이 파일에 조건을 추가하면 됩니다.
 */
import type { CareLevel } from '@/lib/careLevel'
import type { SafetyBrakeResult } from '@/lib/safetyBrake'
import type { AiMessage } from '@/types'

// 관리 강도가 이 값 이상이면 "채찍(독촉)" 문구로 봅니다. (3 심리적 채찍, 4 강제적 채찍)
const WHIP_CARE_LEVEL = 3

export interface CanSendAiMessageNotificationInput {
  /** 보내려는 메시지의 관리 강도 */
  careLevel: CareLevel
  /** 안전 브레이크 판정 결과 (getSafetyBrakeResult 의 반환값) */
  brake: Pick<SafetyBrakeResult, 'quiet' | 'stopWhip' | 'recoveryMode'>
}

/**
 * 지금 이 메시지를 브라우저 알림으로 보내도 되는지 판단합니다.
 *
 * 1) 연락 금지 시간이면 무엇이든 보내지 않습니다. (#60)
 *      예1) { careLevel: 1, brake: { quiet: true, stopWhip: false, recoveryMode: false } } -> false
 * 2) 안전 브레이크(#95)가 켜졌으면(stopWhip 또는 recoveryMode) 채찍 메시지(3~4단계)는 보내지 않습니다.
 *      예2) { careLevel: 3, brake: { quiet: false, stopWhip: true, recoveryMode: false } } -> false
 *      예3) { careLevel: 3, brake: { quiet: false, stopWhip: false, recoveryMode: true } } -> false
 * 3) 그 외에는 보냅니다. 브레이크가 켜져도 당근·넛지(0~2단계)는 그대로 보냅니다.
 *      예4) { careLevel: 1, brake: { quiet: false, stopWhip: true, recoveryMode: false } } -> true
 *      예5) { careLevel: 2, brake: { quiet: false, stopWhip: false, recoveryMode: false } } -> true
 */
export function canSendAiMessageNotification({
  careLevel,
  brake,
}: CanSendAiMessageNotificationInput): boolean {
  if (brake.quiet) return false
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
 */
export function showAiMessageNotification(message: AiMessage): Notification | null {
  if (getNotificationPermission() !== 'granted') return null

  // tag 를 메시지 id 로 두면, 같은 메시지로 또 알림을 보내려 할 때 브라우저가 하나로 합쳐 줍니다.
  const notification = new Notification('AI 메시지', { body: message.text, tag: message.id })
  notification.onclick = () => {
    window.focus()
    window.location.assign('/messages')
    notification.close()
  }
  return notification
}
