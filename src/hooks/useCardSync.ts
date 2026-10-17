import { useIsServerData } from '@/hooks/useIsServerData'
import { CARDS_CHANGED_EVENT, type CardsChangedDetail } from '@/lib/cards'
import { serverCardsQuery } from '@/lib/cardsApi'
import { applyServerCards, markCardChanges, requestCardPush } from '@/lib/cardSync'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * 이 기기의 카드를 서버와 맞춥니다. (#516, 규칙은 lib/cardSync.ts)
 * 모든 화면에 늘 있는 Layout 에서 한 번만 부릅니다. 테스트 로그인이면 아무것도 하지 않습니다.
 *
 *   1) 이 기기에서 카드를 저장하면 바뀐 것을 보낼 목록에 적고, 잠시 뒤 서버로 보냅니다.
 *   2) 앱을 열 때 서버의 카드를 받아 다른 기기에서 바뀐 것을 반영하고, 못 보낸 것을 다시 보냅니다.
 */
export function useCardSync(): void {
  const isServerData = useIsServerData()

  useEffect(() => {
    if (!isServerData) return
    function handleCardsChanged(event: Event) {
      const { prev, next, source } = (event as CustomEvent<CardsChangedDetail>).detail
      // 서버에서 받은 것으로 맞춘 저장은 다시 보내지 않습니다.
      if (source !== 'local') return
      markCardChanges(prev, next)
      requestCardPush()
    }
    window.addEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
    // 로그아웃하거나 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(CARDS_CHANGED_EVENT, handleCardsChanged)
  }, [isServerData])

  // 서버의 카드는 TanStack Query 로 받습니다. (docs/DATA-FETCHING.md) 받으면 이 기기의 카드와 맞춥니다.
  const { data: serverCards } = useQuery({ ...serverCardsQuery(), enabled: isServerData })
  useEffect(() => {
    if (!serverCards) return
    applyServerCards(serverCards)
    requestCardPush()
  }, [serverCards])
}
