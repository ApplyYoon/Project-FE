import { keepScreenOn, letScreenSleep } from '@/lib/wakeLock'
import { useEffect } from 'react'

/**
 * isOn 이 true 인 동안 휴대폰 화면이 자동으로 꺼지지 않게 합니다. false 가 되면 바로 풉니다.
 *
 *   useKeepScreenOn(isRunning)   // 타이머가 흐르는 동안만 화면을 켜 둡니다
 *
 * 지원하지 않는 브라우저에서는 아무 일도 일어나지 않습니다. (lib/wakeLock.ts)
 */
export function useKeepScreenOn(isOn: boolean): void {
  useEffect(() => {
    if (!isOn) return

    void keepScreenOn()

    // 다른 탭·앱에 다녀오면 브라우저가 화면 꺼짐 방지를 풀어 버립니다. 화면이 다시 보이면 다시 겁니다.
    function handleVisibilityChange() {
      if (!document.hidden) void keepScreenOn()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // isOn 이 false 로 바뀌거나 화면을 떠나면 정리합니다.
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void letScreenSleep()
    }
  }, [isOn])
}
