import { loadData, saveData } from '@/lib/storage'
import { useEffect, useState } from 'react'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-timer' 가 됩니다)
const STORAGE_KEY = 'timer'

// 화면을 다시 그리는 간격(밀리초)입니다. 시간 계산에는 쓰이지 않고, 1초가 넘어가는 순간을 놓치지 않게 짧게 잡았습니다.
const REDRAW_INTERVAL_MS = 200

/** 저장해 두는 스톱워치 상태입니다. 흘러간 초를 직접 세지 않고, "언제 시작했는지"만 기억합니다. */
interface StopwatchState {
  /** 처음 시작한 시각 (Date.now() 값). 아직 시작 전이면 null */
  startedAt: number | null
  /** 일시정지 중이면 멈춘 시각, 흐르는 중이거나 시작 전이면 null */
  pausedAt: number | null
  /** 지금까지 일시정지했던 시간을 전부 더한 값 (밀리초). 공부 시간에서 빠집니다. */
  pausedTotalMs: number
  /** 일시정지를 누른 횟수. 새로고침해도 공부 기록에 그대로 남아야 해서 여기서 같이 저장합니다. */
  pauseCount: number
}

const idleState: StopwatchState = {
  startedAt: null,
  pausedAt: null,
  pausedTotalMs: 0,
  pauseCount: 0,
}

/** 저장소에서 꺼낸 값이 우리가 저장한 모양이 맞는지 확인합니다. (깨진 값이면 시간이 NaN 이 되기 때문입니다) */
function isStopwatchState(value: unknown): value is StopwatchState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    (state.startedAt === null || typeof state.startedAt === 'number') &&
    (state.pausedAt === null || typeof state.pausedAt === 'number') &&
    typeof state.pausedTotalMs === 'number' &&
    typeof state.pauseCount === 'number'
  )
}

/** 저장된 상태를 불러옵니다. 없거나 깨져 있으면 "시작 전" 상태입니다. */
function loadState(): StopwatchState {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  return isStopwatchState(saved) ? saved : idleState
}

/**
 * 새로고침하거나 다른 화면에 다녀와도 계속 흐르는 스톱워치입니다.
 *
 * 1초마다 숫자를 1씩 올리면 새로고침할 때 0 으로 돌아가고 시간도 조금씩 밀립니다.
 * 그래서 "처음 시작한 시각"을 저장해 두고, 보여줄 때마다
 *   (지금 - 시작 시각 - 일시정지했던 시간)
 * 으로 계산합니다. setInterval 은 화면을 다시 그리는 용도로만 씁니다.
 *
 *   const { seconds, isRunning, isStarted, startedAt, pauseCount, getPausedMs, start, pause, stop } = useStopwatch()
 */
export function useStopwatch() {
  const [state, setState] = useState<StopwatchState>(loadState)
  // 화면을 다시 그리기 위한 "지금 시각" 입니다. 이 값이 바뀌면 경과 시간이 새로 계산됩니다.
  const [now, setNow] = useState(() => Date.now())

  const isRunning = state.startedAt !== null && state.pausedAt === null
  // 시작한 뒤 정지하기 전까지 true 입니다. (일시정지 중에도 true. 시작하자마자 멈춰서 0초여도 true)
  const isStarted = state.startedAt !== null

  // 상태가 바뀔 때마다 저장합니다. (시작·일시정지·정지 때만 바뀌므로 매초 저장하지 않습니다)
  useEffect(() => {
    saveData(STORAGE_KEY, state)
  }, [state])

  // 흐르는 동안에만 화면을 다시 그립니다.
  useEffect(() => {
    if (!isRunning) return

    const intervalId = setInterval(() => setNow(Date.now()), REDRAW_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [isRunning])

  // 일시정지 중에는 멈춘 시각까지만, 흐르는 중에는 지금까지 계산합니다.
  // Math.max(0, ...): 컴퓨터 시계를 뒤로 돌렸을 때 음수가 나오지 않게 합니다.
  let elapsedMs = 0
  if (state.startedAt !== null) {
    const endAt = state.pausedAt ?? now
    elapsedMs = Math.max(0, endAt - state.startedAt - state.pausedTotalMs)
  }
  const seconds = Math.floor(elapsedMs / 1000)

  const start = () => {
    const currentTime = Date.now()
    setNow(currentTime)
    setState((prev) => {
      // 시작 전: 지금을 시작 시각으로 저장합니다.
      if (prev.startedAt === null) {
        return { startedAt: currentTime, pausedAt: null, pausedTotalMs: 0, pauseCount: 0 }
      }
      // 일시정지 중: 멈춰 있던 시간을 "빠지는 시간"에 더하고 다시 흐르게 합니다.
      if (prev.pausedAt !== null) {
        return {
          ...prev,
          pausedAt: null,
          pausedTotalMs: prev.pausedTotalMs + (currentTime - prev.pausedAt),
        }
      }
      // 이미 흐르는 중이면 그대로 둡니다.
      return prev
    })
  }

  const pause = () => {
    const currentTime = Date.now()
    setNow(currentTime)
    setState((prev) => {
      // 흐르는 중일 때만 멈춘 시각을 기록하고, 누른 횟수를 올립니다.
      if (prev.startedAt === null || prev.pausedAt !== null) return prev
      return { ...prev, pausedAt: currentTime, pauseCount: prev.pauseCount + 1 }
    })
  }

  const stop = () => {
    setNow(Date.now())
    setState(idleState)
  }

  /**
   * 시작한 뒤 at 시각까지 일시정지해 있던 시간(밀리초)을 돌려줍니다.
   * 지금 일시정지 중이면, 멈춘 순간부터 at 까지도 더합니다. (일시정지한 채로 정지를 누르는 경우)
   * 공부 기록을 저장할 때 이 값을 같이 저장해야 순공시간에서 뺄 수 있습니다.
   */
  const getPausedMs = (at: number) => {
    if (state.startedAt === null) return 0
    const currentPauseMs = state.pausedAt === null ? 0 : Math.max(0, at - state.pausedAt)
    return state.pausedTotalMs + currentPauseMs
  }

  return {
    seconds,
    isRunning,
    isStarted,
    startedAt: state.startedAt,
    pauseCount: state.pauseCount,
    getPausedMs,
    start,
    pause,
    stop,
  }
}
