import { useEffect, useRef, useState } from 'react'

/**
 * 1초마다 올라가는 스톱워치입니다.
 * 탭을 떠나거나 컴포넌트가 사라지면 clearInterval 로 정리합니다.
 *
 *   const { seconds, isRunning, start, pause, stop } = useStopwatch()
 */
export function useStopwatch() {
  const [seconds, setSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isRunning) return

    intervalRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning])

  const start = () => setIsRunning(true)
  const pause = () => setIsRunning(false)
  const stop = () => {
    setIsRunning(false)
    setSeconds(0)
  }

  return { seconds, isRunning, start, pause, stop }
}
