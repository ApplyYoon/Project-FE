import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useIsServerData } from '@/hooks/useIsServerData'
import { syncCalendarAlarms, toCalendarAlarmItems } from '@/lib/calendarAlarmsApi'
import { getTodayKey } from '@/lib/date'
import { weekEventsQuery } from '@/lib/googleCalendar'

/** 다시 올리는 간격 (10분). 서버의 알림 작업도 10분마다 돕니다 */
const SYNC_INTERVAL_MS = 10 * 60 * 1000

// 지금 올리는 중인지. 올리기가 거의 동시에 두 번 가지 않게 합니다.
// (개발 모드에서는 React 가 effect 를 두 번 실행해서, 막지 않으면 같은 일정이 두 번 올라갔습니다. 서버도 한 줄만 두게 막아 둠)
let isSyncing = false

/**
 * 앞으로 7일 구글 일정을 서버에 올려서, 일정 시작 10분 전에 푸시가 오게 합니다. (lib/calendarAlarmsApi.ts)
 * 홈 달력에서 부릅니다. 구글 캘린더가 연결돼 있고(isConnected) 진짜 로그인일 때만 올립니다.
 *
 *   - 홈을 열 때, 그리고 홈에 있는 동안 10분마다 올립니다. (구글에서 바꾼 일정을 따라가려고)
 *   - 실패해도 화면에는 알리지 않고 다음 번에 다시 올립니다. (구글 연결이 끝났으면 달력이 [다시 연결] 을 보여 줌)
 */
export function useCalendarAlarmSync(isConnected: boolean): void {
  const isServerData = useIsServerData()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isConnected || !isServerData) return
    async function push() {
      if (isSyncing) return
      isSyncing = true
      try {
        // 오늘부터 7일 일정. 달력이 이미 받아 둔 것이 있으면 그것을 씁니다. (같은 쿼리 설정)
        const events = await queryClient.fetchQuery(weekEventsQuery(getTodayKey()))
        await syncCalendarAlarms(toCalendarAlarmItems(events, Date.now()))
      } catch {
        // 다음 번(10분 뒤)에 다시 올립니다.
      } finally {
        isSyncing = false
      }
    }
    void push()
    const timerId = setInterval(() => void push(), SYNC_INTERVAL_MS)
    // 홈을 떠나거나 연결을 끊으면 멈춥니다.
    return () => clearInterval(timerId)
  }, [isConnected, isServerData, queryClient])
}
