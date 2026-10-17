import { useIsServerData } from '@/hooks/useIsServerData'
import { CARDS_CHANGED_EVENT } from '@/lib/cards'
import { pushPendingSessions } from '@/lib/sessionSync'
import { useEffect } from 'react'

/** 보낼 기록이 생겼는지 확인하는 간격 (1분) */
const CHECK_INTERVAL_MS = 60 * 1000

/**
 * 이 기기의 공부 기록을 서버로 보냅니다. (#516, 규칙은 lib/sessionSync.ts)
 * 모든 화면에 늘 있는 Layout 에서 한 번만 부릅니다. 테스트 로그인이면 아무것도 하지 않습니다.
 *
 *   - 앱을 열 때, 그리고 1분마다: 끝난 지 10분이 지난 기록을 보냅니다.
 *   - 카드가 서버에 올라갈 때: 그 카드를 기다리던 기록을 보냅니다.
 */
export function useSessionSync(): void {
  const isServerData = useIsServerData()

  useEffect(() => {
    if (!isServerData) return
    void pushPendingSessions()
    const timerId = setInterval(() => void pushPendingSessions(), CHECK_INTERVAL_MS)
    function handleCardsChanged() {
      void pushPendingSessions()
    }
    window.addEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
    // 로그아웃하거나 화면을 떠날 때 멈춥니다.
    return () => {
      clearInterval(timerId)
      window.removeEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
    }
  }, [isServerData])
}
