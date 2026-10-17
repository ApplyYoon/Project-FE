# 휴대폰 앱과 말 주고받기 (앱 브릿지)

화면은 **이 웹 하나**입니다. 휴대폰 앱(Project-App)은 이 웹을 WebView(앱 안의 브라우저 창)로 띄우는 **껍데기**이고,
웹이 혼자 못 하는 일만 대신 해 줍니다. (앱을 닫아도 오는 알림, 알림 버튼, 진동, 화면 켜 두기) (#349)

> 한 줄 요약: **휴대폰 기능은 `lib/appBridge.ts` 의 `sendToApp` 으로 부탁하고, 앱 밖이면 지금까지의 웹 방식 그대로 둔다.**

약속(프로토콜) 원문은 **Project-App 저장소의 `docs/BRIDGE.md`** 입니다. (앱 저장소는 아직 원격에 코드를 올리지 않아서, 아래 6장에 요약을 둡니다)
메시지 이름이나 모양을 바꿀 때는 **그 문서와 앱 코드도 같이** 바꿔야 합니다.

---

## 1. 앱 안인지 알아보기

```ts
import { isInApp } from '@/lib/appBridge'

if (isInApp()) {
  // 휴대폰 앱 안
} else {
  // 컴퓨터·휴대폰 브라우저 (지금까지와 똑같이)
}
```

앱은 웹이 뜨기 **전에** `window.ReactNativeWebView` 와 `window.__STARFLOW_APP__`(플랫폼·버전·알림 권한)를 넣어 줍니다.
`isInApp()` 은 userAgent 가 아니라 이 값이 있는지로 봅니다.

## 2. 누가 무엇을 하나요?

| 파일                    | 하는 일                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `lib/appBridge.ts`      | 보내기(`sendToApp`) · 묻고 답 기다리기(`requestFromApp`) · 듣기(`onAppMessage`) |
| `hooks/useAppBridge.ts` | `App.tsx` 에서 한 번. `ready` 보내기, 알림을 누르면 그 주소로 가기, 알림 예약   |
| `lib/cardAlarms.ts`     | 카드 → 예약 알림 목록 (시작 · 3분 뒤 · 끝). React 없는 함수                     |
| `lib/notifications.ts`  | 앱 안이면 알림 권한 · 알림 띄우기를 앱에 부탁                                   |
| `lib/wakeLock.ts`       | 앱 안이면 "화면 켜 둬" 를 앱에 부탁                                             |
| `lib/alarm.ts`          | 앱 안이면 진동을 앱에 부탁 (소리는 웹이 그대로 냄)                              |
| `lib/pwa.ts`            | 앱 안이면 설치 안내 숨기기, 서비스 워커 등록 안 함                              |

화면(페이지)에서는 대부분 **아무것도 바꿀 필요가 없습니다.** 예를 들어 `showSystemNotification()` 을 부르면
브라우저에서는 브라우저 알림이, 앱에서는 휴대폰 알림이 뜹니다.

## 3. 예약 알림은 "통째로" 보냅니다

`alarms.set` 은 **앞으로 울릴 알림 목록 전체**를 보냅니다. 앱은 예전 것을 다 지우고 받은 것을 예약합니다.
그래서 카드를 지우면 다음 목록에서 빠지기만 하면 됩니다. `useAppBridge` 가 10초마다 목록을 다시 만들어 보고,
**바뀌었을 때만** 보냅니다. 앱이 다시 앞으로 올 때(`appState: active`)도 보냅니다. 전화 시각(`call.schedule`)도 같은 방식입니다.

앱 안에서는 예약 알림이 휴대폰 알림으로 뜨므로, 웹이 **같은 내용의 알림을 따로 띄우지 않습니다.**
예) 전화 시각 알림(`showCallNotification`)은 앱 안이면 건너뜁니다. (앱의 `call.schedule` 알림이 대신 뜸)

## 4. 새 메시지 추가하는 법

예) 앱에게 "공유 창 열어 줘" 를 부탁하고 싶다면

1. **약속부터** — Project-App 의 `docs/BRIDGE.md` 표에 이름(`share.open`)과 payload(`{ text }`)를 적고 앱 담당자와 맞춥니다.
2. **타입 한 줄** — `lib/appBridge.ts` 의 `WebToAppPayloads` 에 추가합니다.
   ```ts
   'share.open': { text: string }
   ```
3. **부르기** — 쓰는 곳에서 앱 안일 때만 보냅니다. 앱 밖의 웹 방식은 그대로 둡니다.
   ```ts
   if (isInApp()) sendToApp('share.open', { text: '오늘 3시간 공부했어요' })
   ```
4. **답이 필요하면** `requestFromApp` 을 씁니다. 2초 안에 답이 없으면 `null` 이 오니, 기본값을 꼭 정해 둡니다.
5. **앱이 웹에 보내는 메시지**를 늘릴 때는 `AppToWebMessage` 에 모양을 더하고, `toAppMessage` 에서 모양을 확인합니다.
   (누구나 보낼 수 있는 이벤트라서, 확인하지 않은 값은 쓰지 않습니다)

## 5. 브라우저에서 앱인 척 확인하기

앱이 넣어 주는 값은 **페이지가 뜨기 전에** 있어야 합니다. (`useAppBridge` 는 처음 뜰 때 한 번만 앱인지 봅니다)
그래서 헤드리스 크롬의 `Page.addScriptToEvaluateOnNewDocument` 로 아래를 먼저 넣고 페이지를 엽니다.

```js
window.__sent = [] // 웹이 앱에 보낸 메시지가 여기 쌓입니다
window.ReactNativeWebView = { postMessage: (m) => window.__sent.push(JSON.parse(m)) }
window.__STARFLOW_APP__ = {
  platform: 'android',
  version: '0.1.0',
  notificationPermission: 'granted',
}
```

앱이 웹에 보내는 것은 이벤트로 흉내 냅니다. 예) 알림을 누른 경우

```js
window.dispatchEvent(
  new CustomEvent('starflow-app', { detail: { type: 'navigate', payload: { url: '/timer' } } }),
)
```

## 6. 약속 요약 (Project-App `docs/BRIDGE.md` v1)

**웹 → 앱** `window.ReactNativeWebView.postMessage(JSON.stringify({ id?, type, payload }))`

| type                       | payload                                       | 답               |
| -------------------------- | --------------------------------------------- | ---------------- |
| `ready`                    | `{}`                                          | -                |
| `notify.getPermission`     | `{}`                                          | `{ permission }` |
| `notify.requestPermission` | `{}` (사람이 누를 때까지라 2초 제한 없음)     | `{ permission }` |
| `notify.show`              | `{ tag, title, body, url? }`                  | -                |
| `notify.close`             | `{ tag }`                                     | -                |
| `alarms.set`               | `{ alarms: Alarm[] }` (통째로 바꿈, 48개까지) | -                |
| `call.schedule`            | `{ time: 'HH:MM' \| null, url }`              | -                |
| `screen.keepOn`            | `{ on }`                                      | -                |
| `haptics`                  | `{ kind }`                                    | -                |

**앱 → 웹** `window.dispatchEvent(new CustomEvent('starflow-app', { detail }))`

| detail                                            | 언제                       |
| ------------------------------------------------- | -------------------------- |
| `{ type: 'reply', replyTo, payload }`             | 답이 필요한 요청에 대한 답 |
| `{ type: 'navigate', payload: { url } }`          | 알림·알림 버튼을 눌렀을 때 |
| `{ type: 'appState', payload: { state } }`        | 앱이 앞·뒤로 갈 때         |
| `{ type: 'notify.permission', payload: { ... } }` | 알림 권한이 바뀌었을 때    |

주소(`url`)는 우리 웹 안의 경로(`/` 로 시작, `//` 는 안 됨)만 씁니다.
