/**
 * STARFLOW 서비스 워커 (#105)
 *
 * 서비스 워커는 웹 페이지와 따로, 브라우저 뒤에서 돌아가는 작은 프로그램입니다.
 * 지금 하는 일은 두 가지입니다.
 *   - 인터넷이 끊긴 상태에서 화면을 열면, 미리 저장해 둔 오프라인 안내 화면(offline.html)을 보여줍니다.
 *   - 휴대폰·컴퓨터에 뜬 알림을 누르면, 그 알림에 적힌 화면을 엽니다.
 *     (알림을 띄우는 쪽은 src/lib/notifications.ts 의 showSystemNotification 입니다. 휴대폰은 서비스 워커를 거쳐야만 알림이 뜹니다)
 *
 * 앱 화면(JS·CSS)은 일부러 저장하지 않습니다. 저장해 두면 새로 배포해도 옛날 화면이 계속 보일 수 있어서입니다.
 * 앱을 완전히 닫아도 알림이 오게 하려면(웹 푸시 #256) 여기에 'push' 이벤트를 추가합니다.
 *
 * ⚠️ 이 파일을 고치면 아래 CACHE_NAME 의 숫자를 올려 주세요. 그래야 예전 저장본이 지워집니다.
 */

const CACHE_NAME = 'starflow-offline-v2'
const OFFLINE_URL = '/offline.html'

// 오프라인 화면과 그 화면에 나오는 아이콘을 미리 저장합니다.
const PRECACHE_URLS = [OFFLINE_URL, '/icons/icon-192.png']

// 1) 설치: 오프라인 화면을 미리 저장해 둡니다.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)))
  // 새 버전이 설치되면 기다리지 않고 바로 바꿔 끼웁니다.
  self.skipWaiting()
})

// 2) 활성화: 이름이 다른 예전 저장본을 지웁니다.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  )
})

// 3) 요청 가로채기: "화면 열기" 요청만 봅니다. 인터넷이 되면 그대로, 끊겼으면 오프라인 화면을 줍니다.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || Response.error()),
    ),
  )
})

// 4) 알림을 눌렀을 때: 알림에 붙어 있는 주소(data.url)의 화면을 엽니다.
self.addEventListener('notificationclick', (event) => {
  // 누른 알림은 닫습니다.
  event.notification.close()

  // 알림을 띄울 때 붙여 둔 주소입니다. 없으면 홈을 엽니다. (예: '/notifications', '/call')
  const data = event.notification.data
  const path = data && typeof data.url === 'string' ? data.url : '/'

  event.waitUntil(openAppAt(path))
})

/**
 * 앱 창을 앞으로 가져와서 path 화면을 엽니다.
 *  - 이미 열려 있는 앱 창이 있으면 그 창을 씁니다. (창이 계속 늘어나지 않게)
 *  - 없으면 새 창을 엽니다.
 */
async function openAppAt(path) {
  // 지금 열려 있는 우리 앱의 창(탭)들을 찾습니다.
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const opened = windows[0]
  if (!opened) return self.clients.openWindow(path)

  try {
    const focused = await opened.focus()
    // 이미 그 화면을 보고 있으면 그대로 둡니다. (다시 열면 화면이 새로고침됩니다)
    if (new URL(focused.url).pathname === path) return focused
    return await focused.navigate(path)
  } catch {
    // 창을 못 옮기는 경우(브라우저가 막음)에는 새 창으로 엽니다.
    return self.clients.openWindow(path)
  }
}
