/**
 * 웹 ↔ 휴대폰 앱(STARFLOW 앱) 사이에 말을 주고받는 함수입니다. (#349)
 *
 * 휴대폰 앱은 이 웹을 WebView(앱 안의 브라우저 창)로 띄우는 껍데기이고,
 * 웹이 혼자 못 하는 일(앱을 닫아도 오는 알림, 진동, 화면 켜 두기)만 대신 해 줍니다.
 * 컴퓨터·휴대폰 브라우저에서는 isInApp() 이 false 라서 아래 함수들이 아무 일도 하지 않습니다.
 *
 * 약속(프로토콜) 원문: Project-App 저장소의 docs/BRIDGE.md
 * 학생용 설명(새 메시지 추가하는 법): docs/APP-BRIDGE.md
 */

/** 앱이 웹을 띄우기 전에 넣어 주는 정보 (BRIDGE.md 1장) */
export interface AppInfo {
  platform: 'android' | 'ios'
  /** 앱 버전. 예) '0.1.0' */
  version: string
  /** 휴대폰의 알림 권한. 바뀌면 앱이 'notify.permission' 으로 알려 줍니다. */
  notificationPermission: NotificationPermission
}

/** 예약 알림 하나 (BRIDGE.md 2장의 Alarm). 앱이 이 시각에 휴대폰 알림을 띄웁니다. */
export interface Alarm {
  /** 웹이 정하는 이름. 같은 id 를 다시 보내면 바뀝니다. */
  id: string
  /** 울릴 시각 (Date.now() 값) */
  at: number
  title: string
  body: string
  /** 알림을 누르면 갈 주소. 예) '/timer?plan=abc' */
  url?: string
  /** 알림 아래 버튼. 'card-start' [시작] · 'card-missed' [미루기][실패로 기록] · 'card-missed-absolute' [실패로 기록] */
  category?: 'card-start' | 'card-missed' | 'card-missed-absolute'
  /** 버튼마다 갈 주소 */
  actionUrls?: Partial<Record<'start' | 'postpone' | 'fail', string>>
}

/** 진동 종류 */
export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error'

/**
 * 웹 → 앱 메시지. 이름(type)마다 같이 보내는 내용(payload)의 모양입니다. (BRIDGE.md 2장)
 * 새 메시지를 만들려면 여기에 한 줄을 더하고, 앱(Project-App)에도 같은 이름을 만들어 달라고 합니다.
 */
export interface WebToAppPayloads {
  ready: Record<string, never>
  'notify.getPermission': Record<string, never>
  'notify.requestPermission': Record<string, never>
  'notify.show': { tag: string; title: string; body: string; url?: string }
  'notify.close': { tag: string }
  'alarms.set': { alarms: Alarm[] }
  'call.schedule': { time: string | null; url: string }
  'screen.keepOn': { on: boolean }
  haptics: { kind: HapticKind }
  /** 휴대폰 구글 계정으로 로그인해서 구글 ID 토큰 받기 (웹뷰 안 구글 로그인은 구글이 막음, components/ui/GoogleButton.tsx) */
  'auth.googleSignIn': { webClientId: string }
}

/** 웹 → 앱 메시지의 이름들 ('ready' | 'notify.show' | …) */
export type WebToAppType = keyof WebToAppPayloads

/** 앱 → 웹 메시지. 앱이 'starflow-app' 이벤트로 보냅니다. (BRIDGE.md 3장) */
export type AppToWebMessage =
  | { type: 'reply'; replyTo: string; payload: unknown }
  | { type: 'navigate'; payload: { url: string } }
  | { type: 'appState'; payload: { state: 'active' | 'background' } }
  | { type: 'notify.permission'; payload: { permission: NotificationPermission } }

// 앱이 넣어 주는 window 의 값들을 TypeScript 에게 알려 줍니다. (앱 밖에서는 둘 다 없습니다)
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
    __STARFLOW_APP__?: AppInfo
  }
  interface WindowEventMap {
    // detail 은 누가 보냈는지 모르니 unknown 으로 받고, 아래 toAppMessage 에서 모양을 확인합니다.
    'starflow-app': CustomEvent<unknown>
  }
}

/** 앱 안에서 열렸는지. userAgent 가 아니라 앱이 넣어 준 postMessage 가 있는지로 봅니다. */
export function isInApp(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.ReactNativeWebView?.postMessage === 'function'
  )
}

/** 앱이 넣어 준 정보. 앱 밖이면 null 입니다. */
export function getAppInfo(): AppInfo | null {
  if (!isInApp()) return null
  return window.__STARFLOW_APP__ ?? null
}

/** 앱이 알려 준 새 알림 권한을 적어 둡니다. 그래야 getAppInfo() 가 늘 최신 권한을 돌려줍니다. */
export function saveAppNotificationPermission(permission: NotificationPermission): void {
  const info = window.__STARFLOW_APP__
  if (info !== undefined) info.notificationPermission = permission
}

/** 앱에게 글자(JSON)로 바꿔 보냅니다. */
function postToApp(message: { id?: string; type: WebToAppType; payload: unknown }): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message))
}

/**
 * 앱에게 메시지를 보냅니다. 답은 기다리지 않습니다. 앱 밖이면 아무 일도 하지 않습니다.
 *
 *   sendToApp('haptics', { kind: 'warning' })
 */
export function sendToApp<T extends WebToAppType>(type: T, payload: WebToAppPayloads[T]): void {
  if (!isInApp()) return
  postToApp({ type, payload })
}

// 요청마다 붙이는 번호. 답(reply)이 어느 요청의 답인지 맞춰 보는 데 씁니다.
let lastRequestNumber = 0

/**
 * 앱에게 묻고 답을 기다립니다. 답의 payload 를 돌려주고, timeoutMs 안에 답이 없으면 null 입니다.
 * 답의 모양은 앱이 정하므로 unknown 입니다. 쓰기 전에 꼭 모양을 확인하세요. (예: readPermissionReply)
 *
 *   const reply = await requestFromApp('notify.getPermission', {})   // { permission: 'granted' } 또는 null
 */
export function requestFromApp<T extends WebToAppType>(
  type: T,
  payload: WebToAppPayloads[T],
  timeoutMs = 2000,
): Promise<unknown> {
  if (!isInApp()) return Promise.resolve(null)

  lastRequestNumber += 1
  const id = `web-${Date.now()}-${lastRequestNumber}`

  return new Promise((resolve) => {
    // 답이 오거나 시간이 다 되면, 듣기를 그만두고 결과를 돌려줍니다.
    const stopListening = onAppMessage((message) => {
      if (message.type === 'reply' && message.replyTo === id) finish(message.payload)
    })
    const timerId = setTimeout(() => finish(null), timeoutMs)

    function finish(result: unknown) {
      clearTimeout(timerId)
      stopListening()
      resolve(result)
    }

    postToApp({ id, type, payload })
  })
}

/**
 * 앱이 보내는 메시지를 듣습니다. 그만 들을 때 부를 함수를 돌려줍니다. (useEffect 의 정리 함수로 쓰기 좋습니다)
 * 모양이 틀린 메시지는 handler 에 넘기지 않습니다.
 *
 *   const stop = onAppMessage((message) => { if (message.type === 'navigate') … })
 *   stop()
 */
export function onAppMessage(handler: (message: AppToWebMessage) => void): () => void {
  function handleEvent(event: CustomEvent<unknown>) {
    const message = toAppMessage(event.detail)
    if (message !== null) handler(message)
  }
  window.addEventListener('starflow-app', handleEvent)
  return () => window.removeEventListener('starflow-app', handleEvent)
}

function isPermission(value: unknown): value is NotificationPermission {
  return value === 'granted' || value === 'denied' || value === 'default'
}

/**
 * 'notify.getPermission' · 'notify.requestPermission' 의 답에서 권한을 꺼냅니다. 모양이 틀리거나 답이 없었으면 null.
 *
 *   readPermissionReply({ permission: 'granted' }) -> 'granted'
 *   readPermissionReply(null)                      -> null   (2초 안에 답이 없었음)
 */
export function readPermissionReply(reply: unknown): NotificationPermission | null {
  if (typeof reply !== 'object' || reply === null) return null
  const permission = (reply as Record<string, unknown>).permission
  return isPermission(permission) ? permission : null
}

/** 'auth.googleSignIn' 의 답: 성공이면 idToken, 아니면 error 이름 ('cancelled' · 'inProgress' · 'unavailable' · 'failed') */
export type GoogleSignInReply = { idToken: string } | { error: string }

/**
 * 'auth.googleSignIn' 의 답을 확인해서 꺼냅니다. 모양이 틀리거나 답이 없었으면(시간 초과) null.
 *
 *   readGoogleSignInReply({ idToken: 'eyJ…' })       -> { idToken: 'eyJ…' }
 *   readGoogleSignInReply({ error: 'cancelled' })    -> { error: 'cancelled' }   (계정 고르는 창을 닫음)
 *   readGoogleSignInReply(null)                      -> null
 */
export function readGoogleSignInReply(reply: unknown): GoogleSignInReply | null {
  if (typeof reply !== 'object' || reply === null) return null
  const { idToken, error } = reply as Record<string, unknown>
  if (typeof idToken === 'string' && idToken !== '') return { idToken }
  if (typeof error === 'string') return { error }
  return null
}

/**
 * 'starflow-app' 이벤트의 detail 이 약속한 모양인지 확인하고, 맞으면 메시지로 바꿉니다. 틀리면 null.
 * navigate 주소는 우리 앱 안의 주소('/' 로 시작, '//' 는 다른 사이트라 안 됨)만 받습니다.
 */
function toAppMessage(detail: unknown): AppToWebMessage | null {
  if (typeof detail !== 'object' || detail === null) return null
  const { type, replyTo, payload } = detail as Record<string, unknown>
  const data =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}

  if (type === 'reply' && typeof replyTo === 'string') {
    return { type: 'reply', replyTo, payload }
  }
  if (type === 'navigate' && typeof data.url === 'string') {
    const isInsideUrl = data.url.startsWith('/') && !data.url.startsWith('//')
    return isInsideUrl ? { type: 'navigate', payload: { url: data.url } } : null
  }
  if (type === 'appState' && (data.state === 'active' || data.state === 'background')) {
    return { type: 'appState', payload: { state: data.state } }
  }
  if (type === 'notify.permission' && isPermission(data.permission)) {
    return { type: 'notify.permission', payload: { permission: data.permission } }
  }
  return null
}
