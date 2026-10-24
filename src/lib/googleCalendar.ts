/**
 * 구글 캘린더 연결 (#314 에서 만들고 #417 에서 뺐다가, 2026-10-24 홈 달력으로 다시 넣음)
 * 사용자: "구글 캘린더 이전에 작업했다가 뺐는데 이거를 좀 더 적극적으로 써야돼", "캘린더 UI 도 잘 보이는 홈에"
 *
 * ■ 방식
 *  1. 홈 달력의 [구글 캘린더 연결] 을 누르면 구글 창이 뜨고, 허락하면 "출입증"(access token)을 받습니다.
 *     창은 @react-oauth/google 의 useGoogleLogin 이 띄웁니다. (hooks/useCalendarConnect.ts)
 *  2. 받은 출입증을 saveCalendarToken 으로 이 기기에 저장합니다.
 *  3. 그 출입증으로 구글 캘린더 API 를 브라우저에서 바로 부릅니다. 우리 서버와 client secret 은 쓰지 않습니다.
 *
 * ■ 알아 둘 것
 *  - 지금은 **읽기만** 합니다. (권한도 읽기 전용) 카드를 구글에 넣는 것은 아직 안 합니다.
 *  - 출입증은 한 시간짜리입니다. 끝나면 [다시 연결] 을 눌러 새로 받습니다. (한 번 허락했으면 창이 잠깐 떴다 닫힙니다)
 *  - 구글 클라우드 콘솔이 "테스트 모드" 라서, 콘솔의 "테스트 사용자" 에 넣은 계정만 연결할 수 있습니다.
 *  - 클라이언트 ID 는 lib/googleClient.ts 에서 가져옵니다.
 *
 * ⚠️ 일정 제목은 화면에 보여 주기만 합니다. 이 기기 저장소에 넣지 않고, 우리 서버(GPT 포함)에도 보내지 않습니다.
 * ⚠️ 출입증과 일정 내용을 console.log 로 찍지 않습니다.
 */
import { queryOptions } from '@tanstack/react-query'
import { DAY_START_HOUR, moveDateKey, toDayKey } from '@/lib/date'
import { isGoogleConfigured } from '@/lib/googleClient'
import { loadData, removeData, saveData } from '@/lib/storage'

/** 일정 읽기 권한 하나만 받습니다. (쓰기 권한은 카드를 구글에 넣을 때 다시 받습니다) */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
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

/* ---------- 구글 캘린더에서 일정 읽기 ---------- */

const RECONNECT_MESSAGE = '구글 캘린더 연결이 끝났어요. 연결 끊기를 누른 뒤 다시 연결해 주세요.'

/**
 * 저장해 둔 출입증을 붙여 구글 캘린더 API 에 GET 을 보냅니다. 구글의 답(Response)을 그대로 돌려줍니다.
 *   path : 'calendars/primary/events?…' 처럼 CALENDAR_API_URL 뒤에 붙는 부분
 * 출입증이 없거나 끝났으면, 그리고 구글이 401 을 주면 "다시 연결" 안내로 실패합니다.
 */
async function calendarGet(path: string): Promise<Response> {
  const connection = loadConnection()
  if (getCalendarStatus() !== 'on' || connection === null) {
    throw new CalendarError(RECONNECT_MESSAGE)
  }

  const response = await fetch(`${CALENDAR_API_URL}/${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 401) {
    // 출입증이 끝났거나 구글에서 허락을 취소했습니다. 다음에 홈을 열면 [다시 연결] 이 보이게 끝난 것으로 표시합니다.
    saveData<SavedConnection>(STORAGE_KEY, { ...connection, expiresAt: 0 })
    throw new CalendarError(RECONNECT_MESSAGE)
  }
  if (!response.ok) {
    throw new CalendarError('구글 캘린더를 읽지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
  return response
}

/** 구글이 주는 일정의 시각 */
interface GoogleEventTime {
  /** 시각이 있는 일정. 예) '2026-10-24T15:00:00+09:00' */
  dateTime?: string
  /** 하루 종일 일정. 예) '2026-10-24' */
  date?: string
}

/** 구글이 주는 일정 한 개 (우리가 달라고 한 칸만) */
export interface GoogleEventItem {
  id?: string
  /** 일정 제목. 비공개 일정이면 없을 수 있습니다 */
  summary?: string
  start?: GoogleEventTime
  end?: GoogleEventTime
  /** 'cancelled' 면 지운 일정입니다 */
  status?: string
}

/** 홈 달력에 보여 줄 구글 일정 한 개 (그날 한 칸) */
export interface CalendarEvent {
  /** 구글 일정 id. 며칠짜리 하루 종일 일정은 날마다 같은 id 로 여러 번 나옵니다 */
  id: string
  title: string
  /** 이 일정이 보이는 날 'YYYY-MM-DD' (하루는 새벽 4시에 시작합니다) */
  dayKey: string
  /** 하루 종일 일정인지 */
  isAllDay: boolean
  /** 시작 · 끝 시각 'HH:MM'. 하루 종일 일정이면 null */
  startTime: string | null
  endTime: string | null
}

/** Date 를 'HH:MM' 으로 바꿉니다. (이 기기의 시간대 기준) */
function toClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * 구글이 준 일정 목록을 홈 달력의 날짜 칸으로 나눕니다. React 도 인터넷도 쓰지 않는 순수 함수입니다.
 *   items   : 구글이 준 일정들
 *   dayKeys : 보여 줄 날짜들 (예: 이번 주 7일). 여기 없는 날의 일정은 뺍니다.
 *
 * ■ 규칙
 *  - 지운 일정(status 'cancelled')은 뺍니다.
 *  - 시각이 있는 일정은 "시작한 날" 한 칸에만 놓습니다. 하루는 새벽 4시에 시작해서, 새벽 1시 일정은 전날 칸입니다.
 *  - 하루 종일 일정은 시작 날부터 끝 날 "전날" 까지 날마다 놓습니다. (구글은 끝 날을 하루 뒤로 줍니다)
 *  - 제목이 없으면 '(제목 없음)' 으로 보여 줍니다.
 *
 * ■ 예시 (dayKeys = ['2026-10-24', '2026-10-25'])
 *   { summary: '학원', start: { dateTime: '2026-10-24T18:00:00+09:00' }, end: { dateTime: '2026-10-24T20:00:00+09:00' } }
 *     -> [{ dayKey: '2026-10-24', isAllDay: false, startTime: '18:00', endTime: '20:00', title: '학원', … }]
 *   { summary: '수학여행', start: { date: '2026-10-24' }, end: { date: '2026-10-26' } }
 *     -> 10-24 · 10-25 두 칸 (isAllDay: true)
 *   { summary: '밤 스터디', start: { dateTime: '2026-10-26T01:00:00+09:00' }, … }
 *     -> 10-25 칸 (새벽 4시 전이라 전날)
 */
export function toCalendarEvents(items: GoogleEventItem[], dayKeys: string[]): CalendarEvent[] {
  const events: CalendarEvent[] = []
  items.forEach((item, index) => {
    if (item.status === 'cancelled') return
    const id = item.id ?? `event-${index}`
    const title = item.summary?.trim() || '(제목 없음)'

    // 시각이 있는 일정
    if (item.start?.dateTime) {
      const start = new Date(item.start.dateTime)
      if (Number.isNaN(start.getTime())) return
      const dayKey = toDayKey(start)
      if (!dayKeys.includes(dayKey)) return
      const end = item.end?.dateTime ? new Date(item.end.dateTime) : null
      events.push({
        id,
        title,
        dayKey,
        isAllDay: false,
        startTime: toClock(start),
        endTime: end && !Number.isNaN(end.getTime()) ? toClock(end) : null,
      })
      return
    }

    // 하루 종일 일정. 'YYYY-MM-DD' 는 글자로 비교해도 날짜 순서와 같습니다.
    const startDate = item.start?.date
    if (!startDate) return
    // 끝 날이 없으면 하루짜리로 봅니다.
    const endDate = item.end?.date ?? moveDateKey(startDate, 1)
    for (const dayKey of dayKeys) {
      if (dayKey >= startDate && dayKey < endDate) {
        events.push({ id, title, dayKey, isAllDay: true, startTime: null, endTime: null })
      }
    }
  })
  return events
}

/**
 * startKey 부터 7일(새벽 4시 ~ 7일 뒤 새벽 4시) 동안 내 기본 캘린더의 일정을 받아옵니다.
 *  - fields 로 제목 · 시각 · 상태만 달라고 해서, 장소 · 참석자 · 설명은 이 앱으로 오지 않습니다.
 */
export async function getWeekEvents(startKey: string): Promise<CalendarEvent[]> {
  const dayKeys = Array.from({ length: 7 }, (_, i) => moveDateKey(startKey, i))
  const [year, month, day] = startKey.split('-').map(Number)
  const params = new URLSearchParams({
    timeMin: new Date(year, month - 1, day, DAY_START_HOUR).toISOString(),
    timeMax: new Date(year, month - 1, day + 7, DAY_START_HOUR).toISOString(),
    singleEvents: 'true', // 반복 일정을 하루하루 풀어서 받습니다.
    orderBy: 'startTime',
    maxResults: '250',
    fields: 'items(id,summary,start,end,status)',
  })
  const response = await calendarGet(`calendars/primary/events?${params}`)
  const body = (await response.json()) as { items?: unknown }
  const items = Array.isArray(body.items) ? (body.items as GoogleEventItem[]) : []
  return toCalendarEvents(items, dayKeys)
}

/**
 * 한 주 구글 일정의 "쿼리 설정" 입니다. 화면에서는 useSuspenseQuery 에 넘겨서 받아옵니다. (docs/DATA-FETCHING.md)
 *
 *   const { data: events } = useSuspenseQuery(weekEventsQuery('2026-10-19'))
 *
 * - staleTime: 다른 기기에서 일정을 바꿀 수 있어서 1분만 보관합니다.
 * - retry: 구글이 거절한 것(CalendarError)은 다시 보내도 같아서 다시 시도하지 않습니다. 인터넷이 잠깐 끊긴 것만 한 번 더.
 */
export function weekEventsQuery(startKey: string) {
  return queryOptions({
    queryKey: ['google-calendar', 'week', startKey],
    queryFn: () => getWeekEvents(startKey),
    staleTime: 60 * 1000,
    retry: (failureCount, error) => !(error instanceof CalendarError) && failureCount < 1,
  })
}
