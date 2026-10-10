import { formatCountdown, getCountdownStatus } from '@/lib/countdown'
import { getPomodoroStatus } from '@/lib/pomodoro'
import { loadData } from '@/lib/storage'

/**
 * 타이머 방식과, 화면에 크게 보여줄 시간 글자를 만드는 함수들입니다.
 * 타이머 화면과 홈의 "진행 중인 타이머" 가 똑같은 글자를 보여주도록 한 곳에 모았습니다. (#243)
 */

// target: 목표 정하기(목표 시간에서 0 으로 줄어듦)
// pomodoro: 뽀모도로(25분 공부 / 5분 휴식)
// free: 목표 없이(흐른 시간이 늘어남)
export type TimerMode = 'target' | 'pomodoro' | 'free'

/** 저장해 둔 모드를 읽습니다. 예전 값('normal')이나 모르는 값은 기본인 '목표 정하기' 로 봅니다. */
export function loadTimerMode(): TimerMode {
  const saved = loadData<unknown>('timer-mode', 'target')
  if (saved === 'pomodoro' || saved === 'free') return saved
  return 'target'
}

/** 초 단위 숫자를 '01:23:45' 형태로 바꿔줍니다. */
export function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (value: number) => value.toString().padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** 화면에 보여줄 타이머 글자 */
export interface TimerDisplay {
  /** 크게 보여줄 시간. 예) '37:48' · '+03:12' · '00:24:59' */
  timeText: string
  /** 그 시간이 무엇인지 알려주는 짧은 말. 예) '남은 시간' */
  label: string
}

/**
 * 스톱워치가 센 "흐른 시간(초)" 으로, 화면에 보여줄 시간 글자와 그 이름을 만듭니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * ■ 규칙
 * - 목표 정하기: 남은 시간이 줄어들고, 목표를 채우면 더 한 시간을 + 로 보여줍니다.
 * - 뽀모도로: 이번 구간(공부 25분 / 휴식 5분)의 남은 시간이 줄어듭니다.
 * - 목표 없이: 흐른 시간이 늘어납니다.
 *
 * ■ 예시 (targetMinutes = 50)
 *   getTimerDisplay('target', 732, 50)    -> { timeText: '37:48',    label: '남은 시간' }
 *   getTimerDisplay('target', 3192, 50)   -> { timeText: '+03:12',   label: '목표보다 더 한 시간' }
 *   getTimerDisplay('pomodoro', 1, 50)    -> { timeText: '00:24:59', label: '이번 공부 남은 시간' }
 *   getTimerDisplay('pomodoro', 1560, 50) -> { timeText: '00:04:00', label: '쉬는 시간 남음' }
 *   getTimerDisplay('free', 754, 50)      -> { timeText: '00:12:34', label: '공부한 시간' }
 */
export function getTimerDisplay(
  mode: TimerMode,
  elapsedSeconds: number,
  targetMinutes: number,
): TimerDisplay {
  if (mode === 'target') {
    const countdown = getCountdownStatus(elapsedSeconds, targetMinutes)
    return countdown.isOver
      ? { timeText: `+${formatCountdown(countdown.overSeconds)}`, label: '목표보다 더 한 시간' }
      : { timeText: formatCountdown(countdown.remainingSeconds), label: '남은 시간' }
  }

  if (mode === 'pomodoro') {
    const pomodoro = getPomodoroStatus(elapsedSeconds)
    return {
      timeText: formatTime(pomodoro.remainingSeconds),
      label: pomodoro.phase === 'break' ? '쉬는 시간 남음' : '이번 공부 남은 시간',
    }
  }

  return { timeText: formatTime(elapsedSeconds), label: '공부한 시간' }
}
