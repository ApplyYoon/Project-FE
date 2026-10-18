import { TIMER_LOCK_EVENT, isTimerLocked } from '@/lib/timerLock'
import { useEffect, useState } from 'react'

/**
 * 지금 타이머 잠금(공부 세션 진행 중)인지 알려 줍니다. (#396)
 * 같은 창에서 세션을 시작·끝내면(이벤트), 다른 탭에서 바꾸면(storage), 앱으로 돌아오면(visibilitychange) 다시 읽습니다.
 *
 *   const isLocked = useTimerLock()
 */
export function useTimerLock(): boolean {
  const [isLocked, setIsLocked] = useState(isTimerLocked)

  useEffect(() => {
    const refresh = () => setIsLocked(isTimerLocked())
    window.addEventListener(TIMER_LOCK_EVENT, refresh)
    window.addEventListener('storage', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener(TIMER_LOCK_EVENT, refresh)
      window.removeEventListener('storage', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return isLocked
}
