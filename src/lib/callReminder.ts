/**
 * 매일 정해 둔 시간에 AI 전화를 알려주는 기능에 필요한 계산과 브라우저 알림 도우미입니다.
 * (정하는 화면은 SettingsPage, 시간을 지켜보는 곳은 hooks/useCallReminder.ts)
 *
 * ⚠️ 이 기능은 **앱(웹 페이지)이 열려 있을 때만** 동작합니다.
 *    앱이 닫혀 있을 때 알림을 보내려면 서버가 보내는 웹 푸시와 서비스 워커(#105)가 필요합니다.
 */

// 저장소에 넣는 이름들입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙입니다)
/** 전화 받을 시간. 'HH:MM' 글자 (예: '22:00'). 아직 안 정했으면 저장돼 있지 않습니다. */
export const CALL_TIME_STORAGE_KEY = 'call-time'
/** 마지막으로 전화를 울린 시각 (Date.now() 값). 같은 시간에 두 번 울리지 않으려고 기록합니다. */
export const LAST_RING_STORAGE_KEY = 'call-last-ring'

const MINUTES_PER_DAY = 24 * 60

/**
 * 정해진 시간으로부터 몇 분 안에 열려 있으면 울릴지입니다.
 * 탭이 뒤에 숨어 있으면 브라우저가 시계를 느리게 돌려서 딱 그 1분을 놓칠 수 있어서 여유를 둡니다.
 */
export const RING_WINDOW_MINUTES = 5

/** 한 번 울린 뒤 다시 울리지 않는 시간(12시간). 하루에 한 번만 울리게 합니다. 자정을 넘기는 시간(23:58 등)도 안전합니다. */
const RING_COOLDOWN_MS = 12 * 60 * 60 * 1000

/**
 * 저장돼 있는 'HH:MM' 글자를 "자정부터 몇 분째인지" 로 바꿉니다. 올바른 시간이 아니면 null 입니다.
 *
 *   parseCallTime('00:00')  -> 0
 *   parseCallTime('07:30')  -> 450
 *   parseCallTime('22:00')  -> 1320
 *   parseCallTime('25:00')  -> null   (없는 시간)
 *   parseCallTime('')       -> null   (아직 안 정함)
 */
export function parseCallTime(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (match === null) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

/**
 * 지금 전화를 울려야 하는지 알려줍니다.
 * 아래가 모두 맞을 때만 true 입니다.
 *  1) 전화 받을 시간이 올바르게 정해져 있다
 *  2) 지금이 그 시간이거나, 그 시간이 지난 지 5분(RING_WINDOW_MINUTES)이 안 됐다
 *  3) 최근 12시간 안에 이미 울린 적이 없다
 *
 * now 는 "지금이 언제인지" 입니다. 평소엔 new Date() 를 넣고, 확인할 때 시각을 바꿔 넣을 수 있습니다.
 *
 *   시간 '22:00', 지금 21:59, 울린 적 없음   -> false  (아직 안 됨)
 *   시간 '22:00', 지금 22:00, 울린 적 없음   -> true   (딱 그 시간)
 *   시간 '22:00', 지금 22:04, 울린 적 없음   -> true   (5분 안이라 아직 울림. 탭이 뒤에 있었던 경우)
 *   시간 '22:00', 지금 22:05, 울린 적 없음   -> false  (5분이 지나서 놓침)
 *   시간 '22:00', 지금 22:00, 방금 울렸음     -> false  (같은 시간에 두 번 울리지 않음)
 *   시간 '23:58', 지금 다음 날 00:01, 어제 울렸음 -> false (자정을 넘겨도 12시간 안이라 안 울림)
 *   시간 '23:58', 지금 00:01, 처음           -> true   (자정을 넘겨도 5분 안이면 울림)
 *   시간을 안 정했다                          -> false
 */
export function shouldRingNow(now: Date, savedTime: unknown, lastRingAt: unknown): boolean {
  const scheduled = parseCallTime(savedTime)
  if (scheduled === null) return false

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  // 정해진 시간으로부터 몇 분 지났는지. 자정을 넘겨도(23:58 → 00:01 = 3분) 맞게 나오도록 하루(1440분)를 더해서 나눕니다.
  const minutesPassed = (nowMinutes - scheduled + MINUTES_PER_DAY) % MINUTES_PER_DAY
  if (minutesPassed >= RING_WINDOW_MINUTES) return false

  if (typeof lastRingAt === 'number') {
    const sinceLastRing = now.getTime() - lastRingAt
    // 음수는 컴퓨터 시계를 뒤로 돌린 경우라서 무시합니다.
    if (sinceLastRing >= 0 && sinceLastRing < RING_COOLDOWN_MS) return false
  }

  return true
}

/** 브라우저 알림 권한 상태. unsupported 는 이 브라우저에 알림 기능이 아예 없다는 뜻입니다. */
export type NotificationState = 'default' | 'granted' | 'denied' | 'unsupported'

/** 지금 알림 권한이 어떤지 알려줍니다. (default = 아직 안 물어봄, granted = 허용, denied = 거부) */
export function getNotificationState(): NotificationState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * 알림 허용을 브라우저에 묻습니다. 사용자가 버튼을 직접 누른 순간에 불러야 합니다. (아이폰은 특히 그렇습니다)
 * 허용·거부를 고른 뒤의 상태를 돌려줍니다.
 */
export async function requestNotificationPermission(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported'

  try {
    return await Notification.requestPermission()
  } catch {
    // 오래된 브라우저에서 권한 요청이 실패해도 앱이 멈추지 않게 지금 상태를 돌려줍니다.
    return getNotificationState()
  }
}

/**
 * 아이폰·아이패드이면서 아직 "홈 화면에 추가" 를 안 한 상태인지 알려줍니다.
 * 아이폰은 홈 화면에 추가한 앱만 알림을 받을 수 있어서, 이 경우에만 안내를 보여줍니다.
 */
export function isIosWithoutInstall(): boolean {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (!isIos) return false

  // 홈 화면에서 열었다면 주소창 없는 "독립 실행(standalone)" 모드입니다.
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return !isStandalone
}

/**
 * 전화가 왔다는 브라우저 알림을 띄웁니다. 알림을 누르면 onClick 이 불립니다.
 * 권한이 없거나 이 브라우저가 지원하지 않으면 아무것도 하지 않습니다. (에러도 내지 않습니다)
 *
 * 참고: 안드로이드 크롬은 서비스 워커 없이는 이 방식의 알림을 못 띄웁니다. (#105 에서 서비스 워커를 만든 뒤 지원)
 */
export function showCallNotification(onClick: () => void): void {
  if (getNotificationState() !== 'granted') return

  try {
    const notification = new Notification('AI 선생님에게 전화가 왔어요', {
      body: '받으러 가서 오늘 하루를 같이 돌아봐요.',
      // tag: 같은 알림이 여러 개 쌓이지 않고 하나만 남게 합니다.
      tag: 'ai-call',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
      onClick()
    }
  } catch {
    console.warn('[callReminder] 브라우저 알림을 띄우지 못했습니다.')
  }
}
