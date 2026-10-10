import { useAuth } from '@/hooks/useAuth'
import { checkAppAlerts } from '@/lib/appAlertCheck'
import { useEffect } from 'react'

// 쌓을 알림이 있는지 확인하는 간격(밀리초)입니다. 전화 알림(useCallReminder)과 같이 10초마다 봅니다.
const CHECK_INTERVAL_MS = 10_000

/**
 * 앱이 열려 있는 동안, 앱 안에서 생긴 일을 알림 화면에 쌓습니다. (#255)
 * 예) 계획한 시작 시각이 지났을 때, 타이머 목표를 채웠을 때, 오늘 계획을 다 채웠을 때
 *
 * 무엇을 언제 쌓는지는 lib/appAlertCheck.ts 에 있습니다. 이 훅은 10초마다 그 함수를 부르기만 합니다.
 * 모든 화면에 걸쳐 한 번만 돌면 되므로 Layout 에서만 부릅니다.
 */
export function useAppAlerts(): void {
  const { isLoggedIn } = useAuth()

  useEffect(() => {
    // 로그인 전에는 알릴 사람이 없으므로 확인하지 않습니다.
    if (!isLoggedIn) return

    // 열자마자 한 번 확인하고, 그다음부터 10초마다 확인합니다.
    checkAppAlerts()
    const intervalId = setInterval(() => checkAppAlerts(), CHECK_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [isLoggedIn])
}
