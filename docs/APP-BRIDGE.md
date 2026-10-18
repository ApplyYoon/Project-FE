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

## 5-1. 앱 안 구글 로그인

구글은 앱 안 브라우저(웹뷰)의 구글 로그인을 막습니다. 그래서 `components/ui/GoogleButton.tsx` 는 앱 안이면 우리 버튼을 그리고,
누르면 `auth.googleSignIn` 으로 휴대폰 구글 로그인을 부탁합니다. 받은 ID 토큰은 브라우저 구글 버튼과 똑같이 `onCredential` 로 넘어가서
로그인 화면·탈퇴 확인 화면은 바꿀 것이 없습니다. BE 도 그대로입니다. (앱이 `webClientId` 로 로그인하면 토큰의 aud 가 같음)

## 5-2. 공부 중 폰 들림 경고 (v1.3, 2026-10-18)

타이머 세션이 열리면 `hooks/usePhoneLift.ts` 가 앱에 `focus.start` 를 보냅니다. 앱은 폰을 엎어 뒀는지 재다가,
들 때마다 `focus.lifted`, 다시 엎으면 `focus.down` 을 보냅니다. 경고 단계는 **웹이** 정합니다(`lib/liftAlerts.ts`, 오늘의 관리 강도로 세기 결정).

| 세기 (관리 강도)  | 1단계 안내 + 진동 | 2단계 화면 전체 경고 | 3단계 자동 일시정지 |
| ----------------- | ----------------- | -------------------- | ------------------- |
| 약 (회복 · 당근)  | 15초              | 없음                 | 없음                |
| 보통 (넛지)       | 10초              | 20초                 | 60초                |
| 강 (채찍 · 4단계) | 5초               | 15초 + 소리          | 45초                |

- 폰을 든 채 앱을 나가면(홈 · 다른 앱) 앱이 `nudges` 문구로 휴대폰 알림을 예약하고, 돌아오면 지웁니다.
- 세션이 끝나면 `focus.end` 의 답(들린 것 하나하나 · 앱 밖 시간)을 정리해 종료 팝업에 한 줄로 보여 주고 `study-phone-lifts` 에 세션별로 남깁니다.
  5초 미만은 버리고, 5~30초는 "잠깐 확인", 30초 넘으면 "오래 든 것" 입니다. (팀 회의안)
- 앱 밖(컴퓨터 · 모바일 웹)에서는 아무것도 하지 않습니다.

## 6. 약속 요약 (Project-App `docs/BRIDGE.md` v1.3)

**웹 → 앱** `window.ReactNativeWebView.postMessage(JSON.stringify({ id?, type, payload }))`

| type                       | payload                                                 | 답                             |
| -------------------------- | ------------------------------------------------------- | ------------------------------ |
| `ready`                    | `{}`                                                    | -                              |
| `notify.getPermission`     | `{}`                                                    | `{ permission }`               |
| `notify.requestPermission` | `{}` (사람이 누를 때까지라 2초 제한 없음)               | `{ permission }`               |
| `notify.show`              | `{ tag, title, body, url? }`                            | -                              |
| `notify.close`             | `{ tag }`                                               | -                              |
| `alarms.set`               | `{ alarms: Alarm[] }` (통째로 바꿈, 48개까지)           | -                              |
| `call.schedule`            | `{ time: 'HH:MM' \| null, url }`                        | -                              |
| `screen.keepOn`            | `{ on }`                                                | -                              |
| `haptics`                  | `{ kind }`                                              | -                              |
| `auth.googleSignIn`        | `{ webClientId }` (사람이 고를 때까지라 2분까지 기다림) | `{ idToken }` 또는 `{ error }` |
| `focus.start`              | `{ dnd?, pin?, nudges?, url? }`                         | `{ faceDown, dnd, pin }`       |
| `focus.end`                | `{}`                                                    | `{ lifts, outsideMs, … }`      |

**앱 → 웹** `window.dispatchEvent(new CustomEvent('starflow-app', { detail }))`

| detail                                              | 언제                        |
| --------------------------------------------------- | --------------------------- |
| `{ type: 'reply', replyTo, payload }`               | 답이 필요한 요청에 대한 답  |
| `{ type: 'navigate', payload: { url } }`            | 알림·알림 버튼을 눌렀을 때  |
| `{ type: 'appState', payload: { state } }`          | 앱이 앞·뒤로 갈 때          |
| `{ type: 'notify.permission', payload: { ... } }`   | 알림 권한이 바뀌었을 때     |
| `{ type: 'focus.lifted', payload: { at } }`         | 공부 중 폰을 집어 들었을 때 |
| `{ type: 'focus.down', payload: { at, liftedMs } }` | 다시 엎어 뒀을 때           |

주소(`url`)는 우리 웹 안의 경로(`/` 로 시작, `//` 는 안 됨)만 씁니다.
