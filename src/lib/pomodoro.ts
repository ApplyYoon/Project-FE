import type { PomodoroPhase } from '@/types'

/** 뽀모도로 한 번의 공부 시간 (분) */
export const STUDY_MINUTES = 25
/** 공부가 끝난 뒤 쉬는 시간 (분) */
export const BREAK_MINUTES = 5

const STUDY_SECONDS = STUDY_MINUTES * 60
// 공부 + 휴식을 합친 한 바퀴의 길이 (초)
const CYCLE_SECONDS = (STUDY_MINUTES + BREAK_MINUTES) * 60

export interface PomodoroStatus {
  /** 지금이 공부 구간인지 휴식 구간인지 */
  phase: PomodoroPhase
  /** 이번 구간이 끝날 때까지 남은 초 */
  remainingSeconds: number
  /** 지금까지 끝난 구간의 수 (0, 1, 2 ...). 이 숫자가 커졌다면 구간이 막 끝난 것입니다. */
  phaseNumber: number
}

/**
 * 공부를 시작한 뒤 흐른 시간(초)으로 뽀모도로의 현재 상태를 계산합니다.
 *
 * 구간을 따로 저장하지 않고 "흐른 시간"만 가지고 계산합니다.
 * 한 바퀴(30분) 중 앞 25분은 공부, 뒤 5분은 휴식이고, 이게 계속 반복됩니다.
 *
 *   getPomodoroStatus(0)    -> 공부, 25분 남음
 *   getPomodoroStatus(1500) -> 휴식, 5분 남음
 *   getPomodoroStatus(1800) -> 공부, 25분 남음 (두 번째 바퀴 시작)
 */
/**
 * 흐른 시간(초) 가운데 "휴식 구간"이 차지한 시간(초)을 구합니다.
 * 뽀모도로로 잰 기록을 저장할 때, 쉬는 시간을 순공에서 빼려고 씁니다.
 *
 *   getPomodoroBreakSeconds(1200) -> 0     (첫 공부 구간 20분째)
 *   getPomodoroBreakSeconds(1620) -> 120   (25분 공부 + 휴식 2분째)
 *   getPomodoroBreakSeconds(1800) -> 300   (한 바퀴 끝. 휴식 5분)
 *   getPomodoroBreakSeconds(2400) -> 300   (두 번째 공부 구간 10분째)
 */
export function getPomodoroBreakSeconds(elapsedSeconds: number): number {
  const cycleCount = Math.floor(elapsedSeconds / CYCLE_SECONDS)
  const secondsInCycle = elapsedSeconds % CYCLE_SECONDS
  // 이번 바퀴에서 공부 구간(25분)을 넘긴 만큼이 지금까지의 휴식 시간입니다.
  const breakSecondsInCycle = Math.max(0, secondsInCycle - STUDY_SECONDS)
  return cycleCount * BREAK_MINUTES * 60 + breakSecondsInCycle
}

export function getPomodoroStatus(elapsedSeconds: number): PomodoroStatus {
  const cycleCount = Math.floor(elapsedSeconds / CYCLE_SECONDS)
  // 이번 바퀴가 시작된 뒤 흐른 초 (% 는 나눈 나머지)
  const secondsInCycle = elapsedSeconds % CYCLE_SECONDS
  const isStudy = secondsInCycle < STUDY_SECONDS

  return {
    phase: isStudy ? 'study' : 'break',
    remainingSeconds: isStudy ? STUDY_SECONDS - secondsInCycle : CYCLE_SECONDS - secondsInCycle,
    // 한 바퀴에 구간이 2개(공부, 휴식)라서 바퀴 수에 2 를 곱합니다.
    phaseNumber: cycleCount * 2 + (isStudy ? 0 : 1),
  }
}
