/**
 * 구글 캘린더 일정 10분 전 알림 (2026-10-24)
 * 사용자: "캘린더 시작 10분 전에 실제 앱처럼 알람 오게", "알림에 일정 제목 넣자", "스케줄러로 10분마다 확인"
 *
 * ■ 방식
 *  1. 홈 달력이 열려 있을 때, 앞으로 7일 구글 일정의 제목 · 시작 시각을 서버에 올립니다. (hooks/useCalendarAlarmSync.ts)
 *     PUT /calendar-alarms — 보낸 목록이 "앞으로의 내 일정 전부" 가 되는 덮어쓰기입니다.
 *  2. 서버의 예약 작업(calendar-alarm, 10분마다)이 곧 시작하는 일정에 웹 푸시를 보냅니다. 앱을 닫아 둬도 옵니다.
 *  3. 구글 캘린더 연결을 끊으면 서버에 올린 일정도 지웁니다. DELETE /calendar-alarms
 *
 * ■ 알아 둘 것
 *  - 푸시를 받으려면 설정에서 푸시 알림을 켜 둬야 합니다. (아이폰은 홈 화면에 추가한 앱에서만)
 *  - 홈을 마지막으로 연 뒤 구글에서 바꾼 일정은, 다음에 홈을 열 때까지 서버가 모릅니다.
 *  - 테스트 로그인은 서버를 쓰지 않아서 올리지 않습니다.
 */
import { api } from '@/lib/api'
import type { CalendarEvent } from '@/lib/googleCalendar'

/** 서버가 받는 일정 하나 */
export interface CalendarAlarmItem {
  /** 구글 캘린더의 일정 id */
  eventKey: string
  /** 일정 제목 (알림 제목에 들어감, 100자까지) */
  title: string
  /** 시작 순간 (ISO-8601, 예: '2026-10-24T10:00:00.000Z') */
  startsAt: string
}

/** 서버가 받는 제목의 최대 글자 수 (BE CalendarAlarm.MAX_TITLE_LENGTH) */
const MAX_TITLE_LENGTH = 100
/** 서버가 한 번에 받는 일정 수 (BE CalendarAlarmSyncRequest.MAX_EVENTS) */
const MAX_EVENTS = 200

/**
 * 달력에 쓰는 구글 일정을 서버에 올릴 모양으로 바꿉니다. React 도 인터넷도 쓰지 않는 순수 함수입니다.
 *  - 하루 종일 일정은 "10분 전" 이 없어서 뺍니다.
 *  - 이미 시작한 일정은 뺍니다.
 *  - 같은 일정 id 는 한 번만 넣습니다. 제목은 100자로 자릅니다.
 *
 *   now = 18:00
 *   [{ id: 'a', title: '학원', startAt: 19:00 }, { id: 'b', isAllDay: true, … }, { id: 'c', startAt: 17:00 }]
 *     -> [{ eventKey: 'a', title: '학원', startsAt: '…19:00 의 ISO…' }]
 */
export function toCalendarAlarmItems(events: CalendarEvent[], now: number): CalendarAlarmItem[] {
  const items: CalendarAlarmItem[] = []
  const seen = new Set<string>()
  for (const event of events) {
    if (event.isAllDay || event.startAt === null || event.startAt <= now) continue
    if (seen.has(event.id)) continue
    seen.add(event.id)
    items.push({
      eventKey: event.id,
      title: event.title.slice(0, MAX_TITLE_LENGTH),
      startsAt: new Date(event.startAt).toISOString(),
    })
  }
  return items.slice(0, MAX_EVENTS)
}

/** 앞으로의 내 일정을 서버에 올립니다. (덮어쓰기) 저장된 일정 수를 돌려줍니다. */
export async function syncCalendarAlarms(items: CalendarAlarmItem[]): Promise<number> {
  const response = await api<{ saved: number }>('/calendar-alarms', {
    method: 'PUT',
    body: JSON.stringify({ events: items }),
  })
  return response.saved
}

/** 서버에 올린 내 일정을 모두 지웁니다. (구글 캘린더 연결을 끊을 때) */
export async function clearCalendarAlarms(): Promise<void> {
  await api('/calendar-alarms', { method: 'DELETE' })
}
