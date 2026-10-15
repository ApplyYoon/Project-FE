/**
 * 구글 캘린더 연결 (#314)
 *
 * ■ 방식
 *  1. [연결] 을 누르면 구글 창이 뜨고, 허락하면 "출입증"(access token)을 받습니다.
 *     창은 @react-oauth/google 의 useGoogleLogin 이 띄웁니다. (설정 화면 GoogleCalendarSection)
 *  2. 받은 출입증을 saveCalendarToken 으로 이 기기에 저장합니다.
 *  3. 그 출입증으로 구글 캘린더 API 를 브라우저에서 바로 부릅니다. 우리 서버와 client secret 은 쓰지 않습니다.
 *
 * ■ 알아 둘 것
 *  - 출입증은 한 시간짜리입니다. 끝나면 [다시 연결] 을 눌러 새로 받습니다.
 *  - 구글 클라우드 콘솔이 "테스트 모드" 라서, 콘솔의 "테스트 사용자" 에 넣은 계정만 연결할 수 있습니다.
 *  - 클라이언트 ID 는 lib/googleClient.ts 에서 가져옵니다.
 *
 * ⚠️ 출입증과 일정 내용을 console.log 로 찍지 않습니다. 일정 제목은 받아오지도 않습니다.
 */
import { queryOptions } from '@tanstack/react-query'
import { DAY_START_HOUR } from '@/lib/date'
import { isGoogleConfigured } from '@/lib/googleClient'
import { loadData, removeData, saveData } from '@/lib/storage'

/** 일정 읽기·쓰기 권한 하나만 받습니다. (#315 바쁜 시간 읽기, #316 일정 넣기) */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3'
// 구글에 "허락 취소" 를 알리는 주소
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
// 저장 이름. (실제 키는 storage.ts 가 앞에 'study-' 를 붙입니다)
const STORAGE_KEY = 'google-calendar'
const REQUEST_TIMEOUT_MS = 10000
// 출입증이 끝나기 1분 전부터는 "끝난 것" 으로 봅니다. 요청 도중에 끝나는 일을 막으려는 것입니다.
const EXPIRY_MARGIN_MS = 60 * 1000

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

/** 캘린더를 읽다가 실패했을 때. message 는 화면에 그대로 보여 줄 문장입니다. */
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
  if (!isGoogleConfigured) return 'unavailable'
  const connection = loadConnection()
  if (connection === null) return 'off'
  return connection.expiresAt - EXPIRY_MARGIN_MS > now ? 'on' : 'expired'
}

/* ---------- 연결 · 끊기 ---------- */

/**
 * 구글 창에서 받은 출입증을 저장합니다.
 *   accessToken : 구글이 준 출입증
 *   expiresIn   : 몇 초 동안 쓸 수 있는지 (보통 3599초 = 한 시간)
 */
export function saveCalendarToken(accessToken: string, expiresIn: number): void {
  const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600
  saveData<SavedConnection>(STORAGE_KEY, {
    accessToken,
    expiresAt: Date.now() + seconds * 1000,
  })
}

/** 연결을 끊습니다. 이 기기의 출입증을 지우고, 구글 쪽 허락도 취소합니다. */
export function disconnectCalendar(): void {
  const connection = loadConnection()
  removeData(STORAGE_KEY)
  if (connection === null) return
  // 구글에 "허락 취소" 를 알립니다. 답은 읽지 않아도 돼서 no-cors 로 보냅니다.
  // 실패해도 이 기기에서는 이미 끊긴 상태이고, 출입증은 한 시간 뒤 저절로 끝납니다.
  void fetch(REVOKE_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: connection.accessToken }),
  }).catch(() => {})
}

/* ---------- 구글 캘린더에 요청 보내기 (읽기 · 쓰기 공통) ---------- */

/**
 * 저장해 둔 출입증을 붙여 구글 캘린더 API 를 부릅니다. 구글의 답(Response)을 그대로 돌려줍니다.
 *   path        : 'calendars/primary/events?…' 처럼 CALENDAR_API_URL 뒤에 붙는 부분
 *   failMessage : 구글이 거절했을 때(401 말고) 화면에 보여 줄 문장
 *   okStatuses  : 실패가 아니라고 볼 상태 번호 (예: 지우기의 404 = 이미 없음)
 * 출입증이 없거나 끝났으면, 그리고 구글이 401 을 주면 "다시 연결" 안내로 실패합니다.
 */
async function calendarRequest(
  path: string,
  init: RequestInit,
  failMessage: string,
  okStatuses: number[] = [],
): Promise<Response> {
  const connection = loadConnection()
  if (getCalendarStatus() !== 'on' || connection === null) {
    throw new CalendarError(RECONNECT_MESSAGE)
  }

  const response = await fetch(`${CALENDAR_API_URL}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 401) {
    // 출입증이 끝났거나 구글에서 허락을 취소했습니다. "다시 연결" 이 보이게 끝난 것으로 표시합니다.
    saveData<SavedConnection>(STORAGE_KEY, { ...connection, expiresAt: 0 })
    throw new CalendarError(RECONNECT_MESSAGE)
  }
  if (!response.ok && !okStatuses.includes(response.status)) throw new CalendarError(failMessage)
  return response
}

const RECONNECT_MESSAGE = '구글 캘린더 연결이 끝났어요. 다시 연결해 주세요.'

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
  const { start, end } = getDayRange(dayKey)
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true', // 반복 일정을 하루하루 풀어서 받습니다.
    orderBy: 'startTime',
    fields: 'items(start,end,status,transparency)',
  })
  const response = await calendarRequest(
    `calendars/primary/events?${params}`,
    { method: 'GET' },
    '구글 캘린더를 읽지 못했어요. 잠시 후 다시 시도해 주세요.',
  )

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

/* ---------- 일정 넣기 · 옮기기 · 지우기 (#316) ---------- */

/** 구글 캘린더에 넣을 일정 한 개. 시각은 Date.now() 값입니다 */
export interface CalendarEventInput {
  /** 일정 제목. 예) '수학 · 문제집 3단원' */
  title: string
  start: number
  end: number
  /** 이 일정을 만든 우리 앱 계획의 id. 구글 일정 안에 몰래(private) 적어 두어서, 앱이 만든 일정인지 알 수 있게 합니다 */
  planId: string
}

/** 구글 API 가 받는 일정 모양으로 바꿉니다. 시간대는 한국 시간입니다. */
function toEventBody(input: CalendarEventInput) {
  return {
    summary: input.title,
    description:
      'STARFLOW 공부 계획에서 만든 일정이에요. 앱에서 계획을 옮기거나 지우면 여기도 같이 바뀌어요.',
    start: { dateTime: new Date(input.start).toISOString(), timeZone: 'Asia/Seoul' },
    end: { dateTime: new Date(input.end).toISOString(), timeZone: 'Asia/Seoul' },
    extendedProperties: { private: { starflowPlanId: input.planId } },
  }
}

/** 구글 캘린더에 일정을 만들고, 구글이 정해 준 일정 id 를 돌려줍니다. (POST) */
export async function insertCalendarEvent(input: CalendarEventInput): Promise<string> {
  const response = await calendarRequest(
    'calendars/primary/events',
    { method: 'POST', body: JSON.stringify(toEventBody(input)) },
    '구글 캘린더에 넣지 못했어요. 잠시 후 다시 시도해 주세요.',
  )
  const body = (await response.json()) as { id?: unknown }
  if (typeof body.id !== 'string') {
    throw new CalendarError('구글 캘린더에 넣지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
  return body.id
}

/** 앱이 만든 일정의 제목·시각을 바꿉니다. (PATCH: 보낸 칸만 바뀌고 나머지는 그대로입니다) */
export async function moveCalendarEvent(eventId: string, input: CalendarEventInput): Promise<void> {
  await calendarRequest(
    `calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(toEventBody(input)) },
    '구글 캘린더의 일정을 옮기지 못했어요. 잠시 후 다시 시도해 주세요.',
  )
}

/**
 * 앱이 만든 일정을 지웁니다. (DELETE)
 * 구글에서 이미 지운 일정이면(404 · 410) 지울 것이 없으니 성공으로 봅니다.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await calendarRequest(
    `calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
    '구글 캘린더의 일정을 지우지 못했어요. 구글 캘린더에서 직접 지워 주세요.',
    [404, 410],
  )
}
