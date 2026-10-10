/**
 * STARFLOW 서비스 워커 (#105)
 *
 * 서비스 워커는 웹 페이지와 따로, 브라우저 뒤에서 돌아가는 작은 프로그램입니다.
 * 지금 하는 일은 딱 하나입니다.
 *   - 인터넷이 끊긴 상태에서 화면을 열면, 미리 저장해 둔 오프라인 안내 화면(offline.html)을 보여줍니다.
 *
 * 앱 화면(JS·CSS)은 일부러 저장하지 않습니다. 저장해 두면 새로 배포해도 옛날 화면이 계속 보일 수 있어서입니다.
 * 나중에 웹 푸시(#39 #62)를 받게 되면 여기에 'push' 이벤트를 추가합니다.
 *
 * ⚠️ 이 파일을 고치면 아래 CACHE_NAME 의 숫자를 올려 주세요. 그래야 예전 저장본이 지워집니다.
 */

const CACHE_NAME = 'starflow-offline-v1'
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
