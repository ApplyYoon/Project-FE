import { useIsServerData } from '@/hooks/useIsServerData'
import { FIXED_BLOCKS_CHANGED_EVENT, type FixedBlocksChangedDetail } from '@/lib/fixedBlocks'
import {
  applyServerFixedBlocks,
  markFixedBlockChanges,
  pushPendingFixedBlocks,
  serverFixedBlocksQuery,
} from '@/lib/fixedBlockSync'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * 이 기기의 고정 일정(학교 · 학원)을 서버와 맞춥니다. (#516, 규칙은 lib/fixedBlockSync.ts)
 * 모든 화면에 늘 있는 Layout 에서 한 번만 부릅니다. 테스트 로그인이면 아무것도 하지 않습니다.
 *
 *   1) 이 기기에서 저장하면 바뀐 것을 보낼 목록에 적고 바로 서버로 보냅니다.
 *   2) 앱을 열 때 서버의 고정 일정을 받아 다른 기기에서 바뀐 것을 반영하고, 못 보낸 것을 다시 보냅니다.
 */
export function useFixedBlockSync(): void {
  const isServerData = useIsServerData()

  useEffect(() => {
    if (!isServerData) return
    function handleChanged(event: Event) {
      const { prev, next, source } = (event as CustomEvent<FixedBlocksChangedDetail>).detail
      // 서버에서 받은 것으로 맞춘 저장은 다시 보내지 않습니다.
      if (source !== 'local') return
      markFixedBlockChanges(prev, next)
      void pushPendingFixedBlocks()
    }
    window.addEventListener(FIXED_BLOCKS_CHANGED_EVENT, handleChanged)
    // 로그아웃하거나 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(FIXED_BLOCKS_CHANGED_EVENT, handleChanged)
  }, [isServerData])

  // 서버의 고정 일정은 TanStack Query 로 받습니다. (docs/DATA-FETCHING.md) 받으면 이 기기의 것과 맞춥니다.
  const { data: serverBlocks } = useQuery({ ...serverFixedBlocksQuery(), enabled: isServerData })
  useEffect(() => {
    if (!serverBlocks) return
    applyServerFixedBlocks(serverBlocks)
    void pushPendingFixedBlocks()
  }, [serverBlocks])
}
