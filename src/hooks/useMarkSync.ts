import { useIsServerData } from '@/hooks/useIsServerData'
import { CARDS_CHANGED_EVENT } from '@/lib/cards'
import { requestCardPush } from '@/lib/cardSync'
import { pushPendingMarks } from '@/lib/markSync'
import { useEffect } from 'react'

/** 보낼 것이 생겼는지 확인하는 간격 (1분) */
const CHECK_INTERVAL_MS = 60 * 1000

/**
 * 미루기 · 실패 · 휴식 · 사후 입력을 서버로 보냅니다. (#516, 규칙은 lib/markSync.ts)
 * 모든 화면에 늘 있는 Layout 에서 한 번만 부릅니다. 테스트 로그인이면 아무것도 하지 않습니다.
 *
 *   - 앱을 열 때, 그리고 1분마다 보냅니다.
 *   - 카드가 저장될 때(미루기로 카드를 옮김 · 카드가 서버에 올라감)도 바로 보냅니다.
 *   - 보낸 것이 있으면, 미루기를 기다리던 카드를 이어서 보냅니다.
 */
export function useMarkSync(): void {
  const isServerData = useIsServerData()

  useEffect(() => {
    if (!isServerData) return
    async function push() {
      const didSend = await pushPendingMarks()
      if (didSend) requestCardPush()
    }
    void push()
    const timerId = setInterval(() => void push(), CHECK_INTERVAL_MS)
    function handleCardsChanged() {
      void push()
    }
    window.addEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
    // 로그아웃하거나 화면을 떠날 때 멈춥니다.
    return () => {
      clearInterval(timerId)
      window.removeEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
    }
  }, [isServerData])
}
