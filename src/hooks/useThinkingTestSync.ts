import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/lib/api'
import {
  canSyncThinkingTest,
  markThinkingTestHandled,
  needsSendingThinkingTest,
  sendThinkingTest,
} from '@/lib/thinkingTestApi'
import { useEffect } from 'react'

/**
 * 아직 서버에 안 간 생각 습관 테스트 결과를 앱을 열 때 한 번 보냅니다. (lib/thinkingTestApi.ts)
 * 테스트를 끝낸 직후(OnboardingThinkingPage)에도 보내지만, 그때 못 보냈거나 예전에 이 기기에만 저장한 결과를 여기서 보냅니다.
 * 하루 첫 한 줄(DailyTagBar, Layout 에 늘 있음)에서 한 번만 부릅니다. 실패하면 다음에 앱을 열 때 또 보냅니다.
 */
export function useThinkingTestSync(): void {
  const { token } = useAuth()
  const canSync = canSyncThinkingTest(token)

  useEffect(() => {
    if (!canSync || !needsSendingThinkingTest()) return
    void sendThinkingTest().catch((error: unknown) => {
      // 서버가 "값이 틀렸다(400)" 고 하면 다시 보내도 같은 결과라 보낸 것으로 칩니다. 이 기기의 결과는 그대로 둡니다.
      if (error instanceof ApiError && error.status === 400) markThinkingTestHandled()
      // 서버에 닿지 못했거나 로그인이 풀렸으면, 다음에 앱을 열 때 다시 보냅니다.
    })
  }, [canSync])
}
