import type { PlayTag, StudySession } from '@/types'

/**
 * 놀기 타이머 (최종 기획서 「4.4 타이머」 놀기 타이머, #401)
 *
 * 놀 시간과 태그를 정하고 시작합니다. 끝나기 1분 전에 한 번 알리고, 끝나면 다음 카드 시작 화면을 엽니다.
 * 놀기가 끝난 뒤 [카드 시작] · [놀기 끝] 을 누를 때까지의 시간은 **초과 휴식**으로 자동 기록합니다.
 * ('미래의 나 과대평가'(4번 오류)를 숫자로 보여 주기 위해서입니다)
 */

const MS_PER_MINUTE = 60 * 1000

/** 놀 시간 고르기 (분) */
export const PLAY_MINUTE_PRESETS = [15, 30, 60]
/** 끝나기 몇 분 전에 알릴지 */
export const PLAY_WARN_MINUTES = 1

/** 진행 중인 놀기. 저장소에 그대로 넣습니다 (새로고침해도 이어짐) */
export interface ActivePlay {
  startedAt: number
  /** 이 시각에 놀기가 끝납니다 */
  endAt: number
  minutes: number
  tag: PlayTag
  /** 1분 전 알림을 보냈는지 */
  warned?: boolean
  /** 끝났다는 알림을 보냈는지 */
  endAlerted?: boolean
}

/** 놀기를 시작합니다 */
export function startPlay(now: number, minutes: number, tag: PlayTag): ActivePlay {
  return { startedAt: now, endAt: now + minutes * MS_PER_MINUTE, minutes, tag }
}

/**
 * 1분 전 알림을 보낼 때인지 (끝나기 1분 전 ~ 끝 사이, 아직 안 보냈으면)
 *
 *   20:00 ~ 20:30 놀기, 지금 20:28:59 -> false   20:29 -> true   20:30 이후 -> false (이미 끝남)
 */
export function shouldWarnPlayEnd(play: ActivePlay, now: number): boolean {
  if (play.warned) return false
  return now >= play.endAt - PLAY_WARN_MINUTES * MS_PER_MINUTE && now < play.endAt
}

/** 놀기 시간이 끝났는지 */
export function isPlayOver(play: Pick<ActivePlay, 'endAt'>, now: number): boolean {
  return now >= play.endAt
}

/**
 * 놀기를 끝내고 저장할 기록을 만듭니다.
 * - 예정보다 일찍 [그만 놀기] 를 누르면 그 시각에 끝나고 초과 휴식은 0
 * - 예정이 지나서 누르면 놀기는 예정 끝 시각까지, 그 뒤 누를 때까지가 초과 휴식
 *
 *   20:00 ~ 20:30 놀기, 20:20 에 그만    -> 20:00 ~ 20:20, overRestMs 0
 *   20:00 ~ 20:30 놀기, 20:42 에 [카드 시작] -> 20:00 ~ 20:30, overRestMs 12분
 */
export function finishPlay(play: ActivePlay, now: number, id: string): StudySession {
  const endedAt = Math.min(now, play.endAt)
  return {
    id,
    subjectId: '',
    startedAt: play.startedAt,
    endedAt,
    pauseCount: 0,
    pausedMs: 0,
    targetMinutes: play.minutes,
    kind: 'play',
    playTag: play.tag,
    overRestMs: Math.max(0, now - play.endAt),
  }
}
