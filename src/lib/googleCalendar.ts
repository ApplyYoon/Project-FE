/**
 * 구글 캘린더 연결 (#314)
 *
 * ■ 방식
 *  1. 구글이 주는 브라우저용 연결 창(Google Identity Services, GIS) 스크립트를 불러옵니다. (라이브러리 설치 없음)
 *  2. [연결] 을 누르면 구글 창이 뜨고, 허락하면 "출입증"(access token)을 받습니다.
 *  3. 그 출입증으로 구글 캘린더 API 를 브라우저에서 바로 부릅니다. 우리 서버와 client secret 은 쓰지 않습니다.
 *
 * ■ 알아 둘 것
 *  - 출입증은 한 시간짜리입니다. 끝나면 [다시 연결] 을 눌러 새로 받습니다.
 *  - 구글 클라우드 콘솔이 "테스트 모드" 라서, 콘솔의 "테스트 사용자" 에 넣은 계정만 연결할 수 있습니다.
 *  - 클라이언트 ID 는 .env.local · Vercel 의 VITE_GOOGLE_CLIENT_ID 에 넣습니다. (공개돼도 되는 값)
 *
 * ⚠️ 출입증과 일정 내용을 console.log 로 찍지 않습니다. 일정 제목은 받아오지도 않습니다.
 */
import { queryOptions } from '@tanstack/react-query'
import { DAY_START_HOUR } from '@/lib/date'
import { loadData, removeData, saveData } from '@/lib/storage'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
// 일정 읽기·쓰기 권한 하나만 받습니다. (#315 바쁜 시간 읽기, #316 일정 넣기)
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3'
// 저장 이름. (실제 키는 storage.ts 가 앞에 'study-' 를 붙입니다)
const STORAGE_KEY = 'google-calendar'
const REQUEST_TIMEOUT_MS = 10000
// 출입증이 끝나기 1분 전부터는 "끝난 것" 으로 봅니다. 요청 도중에 끝나는 일을 막으려는 것입니다.
const EXPIRY_MARGIN_MS = 60 * 1000

/* ---------- 구글 스크립트(GIS)의 모양. 쓰는 것만 적었습니다 ---------- */

interface TokenResponse {
  access_token?: string
  /** 출입증이 몇 초 동안 쓸 수 있는지 */
  expires_in?: number | string
  /** 실패했을 때의 이유. 예) 'access_denied' (허락 안 함) */
  error?: string
}

interface TokenClient {
  requestAccessToken: () => void
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback: (error: { type: string }) => void
  }) => TokenClient
  hasGrantedAllScopes: (response: TokenResponse, scope: string) => boolean
  revoke: (accessToken: string, done: () => void) => void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

/* ---------- 연결 상태 ---------- */

/** 이 기기에 저장해 두는 연결 정보 */
interface SavedConnection {
  accessToken: string
  /** 출입증이 끝나는 시각 (Date.now() 값) */
  expiresAt: number
}

/**
 * 구글 캘린더 연결 상태
 *  - unavailable : 클라이언트 ID 가 없어서 아직 쓸 수 없음
 *  - off         : 연결 안 함
 *  - expired     : 연결했지만 출입증이 끝남 → [다시 연결]
 *  - on          : 연결됨
 */
export type CalendarStatus = 'unavailable' | 'off' | 'expired' | 'on'

/** 연결하다가 실패했을 때. message 는 화면에 그대로 보여 줄 문장입니다. */
export class CalendarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CalendarError'
  }
}

function loadConnection(): SavedConnection | null {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const record = saved as Record<string, unknown>
  if (typeof record.accessToken !== 'string' || typeof record.expiresAt !== 'number') return null
  return { accessToken: record.accessToken, expiresAt: record.expiresAt }
}

/** 지금 연결 상태를 알려 줍니다. */
export function getCalendarStatus(now: number = Date.now()): CalendarStatus {
  if (CLIENT_ID === '') return 'unavailable'
  const connection = loadConnection()
  if (connection === null) return 'off'
  return connection.expiresAt - EXPIRY_MARGIN_MS > now ? 'on' : 'expired'
}

/* ---------- 연결 · 끊기 ---------- */

// 스크립트는 한 번만 불러옵니다. 두 번째부터는 같은 약속(Promise)을 돌려줍니다.
let scriptPromise: Promise<void> | null = null

/** 구글 연결 창 스크립트를 불러옵니다. 설정 화면이 열릴 때 미리 부릅니다. */
export function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null // 실패했으면 다음에 다시 시도할 수 있게 비웁니다.
      reject(new CalendarError('구글 연결 창을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * 구글 창을 띄워 캘린더 권한을 받습니다. 성공하면 출입증을 저장합니다.
 * ⚠️ 버튼을 누른 그 순간에 바로 불러야 합니다. 중간에 기다렸다가 부르면 브라우저가 팝업을 막습니다.
 *    그래서 스크립트는 loadGoogleScript 로 미리 불러 둡니다.
 */
export function connectCalendar(): Promise<void> {
  const oauth2 = window.google?.accounts?.oauth2
  if (CLIENT_ID === '' || !oauth2) {
    return Promise.reject(
      new CalendarError('구글 연결 창을 준비하는 중이에요. 잠시 후 다시 눌러 주세요.'),
    )
  }

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new CalendarError('권한을 허락하지 않아서 연결하지 못했어요.'))
          return
        }
        // 구글 창에서 캘린더 체크를 풀고 허락할 수도 있어서 한 번 더 확인합니다.
        if (!oauth2.hasGrantedAllScopes(response, CALENDAR_SCOPE)) {
          reject(new CalendarError('캘린더 권한에 체크해야 연결돼요. 다시 연결해 주세요.'))
          return
        }
        const seconds = Number(response.expires_in) || 3600
        saveData<SavedConnection>(STORAGE_KEY, {
          accessToken: response.access_token,
          expiresAt: Date.now() + seconds * 1000,
        })
        resolve()
      },
      // 창을 닫았거나 팝업이 막혔을 때
      error_callback: (error) => {
        reject(
          new CalendarError(
            error.type === 'popup_failed_to_open'
              ? '팝업이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요.'
              : '연결을 마치지 않았어요. 다시 연결해 주세요.',
          ),
        )
      },
    })
    client.requestAccessToken()
  })
}

/** 연결을 끊습니다. 이 기기의 출입증을 지우고, 구글 쪽 허락도 취소합니다. */
export function disconnectCalendar(): void {
  const connection = loadConnection()
  removeData(STORAGE_KEY)
  // 구글에 "허락 취소" 를 알립니다. 실패해도 이 기기에서는 이미 끊긴 상태입니다.
  if (connection) window.google?.accounts?.oauth2?.revoke(connection.accessToken, () => {})
}

/* ---------- 바쁜 시간 읽기 ---------- */

/** 구글 캘린더에서 바쁜 시간 한 칸 (Date.now() 값). 일정 제목은 받지 않습니다 */
export interface BusyTime {
  start: number
  end: number
}

interface CalendarEventTime {
  /** 시각이 있는 일정. 예) '2026-10-15T15:00:00+09:00' */
  dateTime?: string
  /** 하루 종일 일정. 예) '2026-10-15' */
  date?: string
}

interface CalendarEvent {
  start?: CalendarEventTime
  end?: CalendarEventTime
  status?: string
  /** 'transparent' 면 "한가함" 으로 표시한 일정입니다 */
  transparency?: string
}

/** 'YYYY-MM-DD' 하루의 시작(새벽 4시)과 끝(다음 날 새벽 4시)입니다. 하루는 새벽 4시에 시작합니다. (lib/date.ts) */
function getDayRange(dayKey: string): { start: Date; end: Date } {
  const [year, month, day] = dayKey.split('-').map(Number)
  return {
    start: new Date(year, month - 1, day, DAY_START_HOUR),
    end: new Date(year, month - 1, day + 1, DAY_START_HOUR),
  }
}

/**
 * 그날(새벽 4시 ~ 다음 날 새벽 4시) 내 기본 캘린더의 바쁜 시간을 시각 순서로 받아옵니다.
 *  - 하루 종일 일정(생일 등)은 빼고, 시각이 있는 일정만 봅니다.
 *  - 취소된 일정과 "한가함" 으로 표시한 일정은 뺍니다.
 *  - fields 로 시작·끝·상태만 달라고 해서, 일정 제목은 이 앱으로 오지 않습니다.
 */
export async function getBusyTimes(dayKey: string): Promise<BusyTime[]> {
  const connection = loadConnection()
  if (getCalendarStatus() !== 'on' || connection === null) {
    throw new CalendarError('구글 캘린더 연결이 끝났어요. 다시 연결해 주세요.')
  }

  const { start, end } = getDayRange(dayKey)
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true', // 반복 일정을 하루하루 풀어서 받습니다.
    orderBy: 'startTime',
    fields: 'items(start,end,status,transparency)',
  })
  const response = await fetch(`${CALENDAR_API_URL}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 401) {
    // 출입증이 끝났거나 구글에서 허락을 취소했습니다. "다시 연결" 이 보이게 끝난 것으로 표시합니다.
    saveData<SavedConnection>(STORAGE_KEY, { ...connection, expiresAt: 0 })
    throw new CalendarError('구글 캘린더 연결이 끝났어요. 다시 연결해 주세요.')
  }
  if (!response.ok) {
    throw new CalendarError('구글 캘린더를 읽지 못했어요. 잠시 후 다시 시도해 주세요.')
  }

  const body = (await response.json()) as { items?: CalendarEvent[] }
  const busyTimes: BusyTime[] = []
  for (const event of body.items ?? []) {
    if (event.status === 'cancelled' || event.transparency === 'transparent') continue
    if (!event.start?.dateTime || !event.end?.dateTime) continue
    busyTimes.push({
      start: new Date(event.start.dateTime).getTime(),
      end: new Date(event.end.dateTime).getTime(),
    })
  }
  return busyTimes
}

/**
 * 그날 바쁜 시간의 "쿼리 설정" 입니다. 화면에서는 useSuspenseQuery 에 넘겨서 받아옵니다. (docs/DATA-FETCHING.md)
 *
 *   const { data: busyTimes } = useSuspenseQuery(busyTimesQuery('2026-10-15'))
 *
 * - staleTime: 다른 기기에서 일정을 바꿀 수 있어서 1분만 보관합니다.
 */
export function busyTimesQuery(dayKey: string) {
  return queryOptions({
    queryKey: ['google-calendar', 'busy', dayKey],
    queryFn: () => getBusyTimes(dayKey),
    staleTime: 60 * 1000,
  })
}
