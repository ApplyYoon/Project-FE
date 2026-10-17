import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/lib/api'
import {
  canSyncCheckIns,
  clearUnsent,
  loadUnsentDates,
  markUnsent,
  sendCheckIn,
} from '@/lib/checkInsApi'
import { loadLocalCheckIn, saveLocalCheckIn } from '@/lib/quickCheckIn'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * 체크인을 서버로 보내는 훅입니다. (#321, docs/DATA-FETCHING.md 5장)
 * 이 기기에 먼저 저장한 뒤에 부릅니다. 실패해도 이 기기의 체크인은 그대로이고, 그 날짜를 "못 보냄" 으로 적어 둡니다.
 * 적어 둔 날짜는 다음에 앱을 열 때 useUnsentCheckInRetry 가 다시 보냅니다.
 *
 *   const send = useSendCheckIn()
 *   saveCheckIn(checkIn)                                         // 1) 이 기기에 먼저
 *   send.mutate(checkIn, { onSuccess: (merged) => saveCheckIn(merged) })  // 2) 서버로. 서버가 채운 칸까지 이 기기에 반영
 *
 *   send.isPending  -> 보내는 중
 *   send.isError    -> 못 보냄. send.mutate(send.variables) 로 다시 보낼 수 있습니다
 *   canSync         -> false 면(로그아웃 · 테스트 로그인) 부르지 않습니다
 */
export function useSendCheckIn() {
  const { token } = useAuth()
  const mutation = useMutation({
    mutationFn: sendCheckIn,
    onSuccess: (merged) => clearUnsent(merged.date),
    onError: (_error, checkIn) => markUnsent(checkIn.date),
  })
  return { ...mutation, canSync: canSyncCheckIns(token) }
}

/**
 * 예전에 서버로 못 보낸 체크인을 앱을 열 때 한 번 다시 보냅니다. (#321 "저장에 실패해도 다시 시도할 수 있다")
 * 하루 1회 체크인 확인(RequireDailyCheckIn)에서 한 번만 부릅니다.
 * 보내다 실패한 날짜는 목록에 그대로 남아서, 다음에 앱을 열 때 또 보냅니다.
 */
export function useUnsentCheckInRetry(): void {
  const { token } = useAuth()
  const canSync = canSyncCheckIns(token)

  useEffect(() => {
    if (!canSync) return
    let cancelled = false

    async function retry() {
      // 한 번에 하나씩 보냅니다. 서버가 꺼져 있으면 첫 번째에서 멈춥니다.
      for (const date of loadUnsentDates()) {
        if (cancelled) return
        const checkIn = loadLocalCheckIn(date)
        // 그사이 "모든 기록 지우기" 등으로 이 기기에서 사라졌으면 보낼 것이 없습니다.
        if (checkIn === undefined) {
          clearUnsent(date)
          continue
        }
        try {
          const merged = await sendCheckIn(checkIn)
          if (!cancelled) saveLocalCheckIn(merged)
          clearUnsent(date)
        } catch (error) {
          // 서버가 "값이 틀렸다(400)" 고 하면 다시 보내도 같은 결과라 목록에서 뺍니다. 이 기기의 체크인은 그대로 둡니다.
          if (error instanceof ApiError && error.status === 400) {
            clearUnsent(date)
            continue
          }
          // 서버에 닿지 못했거나 로그인이 풀렸으면, 남은 것은 다음에 앱을 열 때 보냅니다.
          return
        }
      }
    }

    void retry()
    return () => {
      cancelled = true
    }
  }, [canSync])
}
