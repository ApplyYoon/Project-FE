/**
 * "목표 시간에서 0 으로 줄어드는 타이머" 의 계산을 하는 순수 함수들입니다. React 없이 돌아가서 `lib/` 에 둡니다.
 *
 * 남은 시간을 따로 세지 않습니다. 스톱워치가 센 "흐른 시간" 과 "목표 시간" 만 가지고 그때그때 계산합니다.
 * (뽀모도로의 getPomodoroStatus 와 같은 방식입니다. 그래서 새로고침해도 남은 시간이 그대로 이어집니다)
 */

/** 목표 시간 버튼에 보여줄 값들 (분) */
export const TARGET_PRESETS = [25, 50, 80]

// 목표 시간 버튼마다 "이게 어느 정도 길이인지" 를 알려 주는 한 줄입니다. 버튼을 바꾸면 여기도 같이 고치세요.
// 사실만 적습니다. (수능 국어는 80분, 수학은 100분입니다)
const TARGET_HINTS: Record<number, string> = {
  25: '뽀모도로 한 번과 같은 길이예요. 가볍게 시작하고 싶을 때 좋아요.',
  50: '학교 수업 한 교시와 같은 길이예요. 평소 공부에 잘 맞아요.',
  80: '수능 국어 시험 시간과 같은 길이예요. 길게 버티는 연습을 할 때 골라요.',
}

/**
 * 고른 목표 시간이 어느 정도 길이인지 알려 주는 한 줄을 돌려줍니다.
 * 버튼에 없는 값(직접 적은 값)은 설명이 없어서 null 입니다.
 *
 *   getTargetHint(50) -> '학교 수업 한 교시와 같은 길이예요. 평소 공부에 잘 맞아요.'
 *   getTargetHint(40) -> null
 */
export function getTargetHint(minutes: number): string | null {
  return TARGET_HINTS[minutes] ?? null
}

/** 처음 쓰는 사람에게 골라 두는 목표 시간 (분) */
export const DEFAULT_TARGET_MINUTES = 50
/** 직접 입력할 수 있는 가장 짧은·긴 목표 시간 (분) */
export const MIN_TARGET_MINUTES = 1
export const MAX_TARGET_MINUTES = 600

export interface CountdownStatus {
  /** 목표까지 남은 초. 목표를 채웠으면 0 */
  remainingSeconds: number
  /** 목표를 채웠으면 true */
  isOver: boolean
  /** 목표를 넘겨서 더 한 초. 아직 못 채웠으면 0 */
  overSeconds: number
  /** 목표 대비 얼마나 했는지 (0 ~ 100, 소수점은 버립니다) */
  percent: number
}

/**
 * 흐른 시간(초)과 목표 시간(분)으로 카운트다운의 지금 상태를 계산합니다.
 *
 *   getCountdownStatus(0, 50)     -> 남은 3000초(50:00), 아직, 더 한 0초,   0%
 *   getCountdownStatus(720, 50)   -> 남은 2280초(38:00), 아직, 더 한 0초,  24%
 *   getCountdownStatus(3000, 50)  -> 남은 0초,           채움, 더 한 0초, 100%
 *   getCountdownStatus(3192, 50)  -> 남은 0초,           채움, 더 한 192초(+03:12), 100%
 *   getCountdownStatus(100, 0)    -> 목표가 없는 것과 같아서 남은 0초, 아직, 0%
 */
export function getCountdownStatus(elapsedSeconds: number, targetMinutes: number): CountdownStatus {
  const targetSeconds = targetMinutes * 60
  // 목표가 0 이하이거나 숫자가 아니면 계산할 수 없습니다. "아직 못 채움" 으로 돌려줍니다.
  if (!(targetSeconds > 0)) {
    return { remainingSeconds: 0, isOver: false, overSeconds: 0, percent: 0 }
  }

  const isOver = elapsedSeconds >= targetSeconds
  return {
    remainingSeconds: isOver ? 0 : targetSeconds - elapsedSeconds,
    isOver,
    overSeconds: isOver ? elapsedSeconds - targetSeconds : 0,
    percent: isOver ? 100 : Math.floor((elapsedSeconds * 100) / targetSeconds),
  }
}

/**
 * 저장소에서 꺼냈거나 직접 입력한 목표 시간을 쓸 수 있는 값으로 맞춥니다.
 * 숫자가 아니면 기본값(50분), 범위를 벗어나면 1 ~ 600분 안으로 맞추고, 소수는 반올림합니다.
 *
 *   normalizeTargetMinutes(35)      -> 35
 *   normalizeTargetMinutes(0)       -> 1
 *   normalizeTargetMinutes(9999)    -> 600
 *   normalizeTargetMinutes('abc')   -> 50
 */
export function normalizeTargetMinutes(value: unknown): number {
  const minutes = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(minutes)) return DEFAULT_TARGET_MINUTES
  return Math.min(MAX_TARGET_MINUTES, Math.max(MIN_TARGET_MINUTES, Math.round(minutes)))
}

/**
 * 초를 카운트다운에 맞는 글자로 바꿉니다. 1시간이 안 되면 '37:48', 넘으면 '1:20:00' 입니다.
 * (목표는 대부분 1시간 안쪽이라, 앞의 '00:' 을 빼서 숫자를 크게 보여줍니다)
 */
export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => value.toString().padStart(2, '0')

  if (hours === 0) return `${pad(minutes)}:${pad(seconds)}`
  return `${hours}:${pad(minutes)}:${pad(seconds)}`
}
