/**
 * "지금 보낼 이벤트 메시지가 있는지" 판단하는 순수 함수입니다. (#83, 기획서 v2 2장·4장)
 *
 * 정해진 빈도의 정기 메시지와 별도로, 무슨 일이 생겼을 때 바로 보내는 메시지입니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 * 실제로 알림을 보내는 일은 #62 가 합니다. 이 함수는 "무엇을 보낼지"만 정해 줍니다.
 *
 *   상황                                     돌려주는 값      메시지 성격
 *   계획 시간이 지났는데 타이머가 꺼져 있음  'planLate'       담백한 알림 (넛지)
 *   오늘 목표를 달성함                       'goalDone'       칭찬 (당근)
 *   3일 연속 목표 미달                       'missed3Days'    회복 (독촉 아님)
 *   해당 없음                                null
 */
import { isWithinQuietHours, type QuietHours } from '@/lib/safetyBrake'
import type { CareLevel } from '@/types'

export type EventMessageType = 'planLate' | 'goalDone' | 'missed3Days'

/** 이 일수 이상 연속으로 목표를 못 채우면 회복 메시지를 보냅니다. (기획서 4장: 3일 연속 미달) */
export const MISSED_DAYS_FOR_RECOVERY = 3

/** 이벤트 메시지 말풍선 아래에 붙는 짧은 이름 (AiMessage 의 eventLabel 로 씁니다) */
export const eventMessageLabels: Record<EventMessageType, string> = {
  planLate: '계획 시간 지남',
  goalDone: '목표 달성',
  missed3Days: '3일 연속 미달',
}

/** 이벤트 메시지를 보낼 때의 관리 강도. 3일 연속 미달은 채찍이 아니라 회복(0)입니다. */
export const eventMessageCareLevels: Record<EventMessageType, CareLevel> = {
  planLate: 2,
  goalDone: 1,
  missed3Days: 0,
}

export interface EventMessageInput {
  /** 지금 시각 */
  now: Date
  /** 연락 금지 시간 (#60). 이 안이면 무엇이든 보내지 않습니다. */
  quietHours: QuietHours
  /** 하루에 받을 AI 메시지 수 (#60). 0 이면 이벤트 메시지도 모두 꺼집니다. */
  dailyCount: number
  /** 오늘 이미 보낸 이벤트 메시지 종류들. 같은 메시지를 하루에 두 번 보내지 않기 위해 받습니다. */
  alreadySentToday: EventMessageType[]
  /**
   * 오늘 공부를 시작하기로 한 시각 ('HH:MM'). 정하지 않았으면 null.
   * 공부 계획에는 목표 시간만 있고 시작 시각이 없어서, 이 값은 호출하는 쪽이 정해서 넘겨야 합니다.
   */
  plannedStartTime: string | null
  /** 타이머가 지금 돌아가고 있는지 */
  isTimerRunning: boolean
  /** 오늘 공부를 한 번이라도 시작했는지 (타이머 기록이 하나라도 있으면 true) */
  hasStudiedToday: boolean
  /** 오늘 지금까지 순공시간 (분) */
  todayStudyMinutes: number
  /** 오늘 계획들의 목표 시간 합계 (분). 계획이 없으면 0 */
  todayTargetMinutes: number
  /** 어제부터 거슬러 올라가며 연속으로 목표를 못 채운 일수 */
  consecutiveMissDays: number
}

/** 'HH:MM' 을 그날 0시부터 몇 분인지로 바꿉니다. 모양이 틀리면 null 입니다.  '19:30' -> 1170 */
function toMinutesOfDay(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (match === null) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * 지금 보낼 이벤트 메시지를 정합니다. 위에서부터 차례로 따지고, 먼저 맞는 줄에서 끝냅니다.
 *
 * 0) 먼저 걸러 내는 조건 (하나라도 맞으면 항상 null)
 *    - 연락 금지 시간 안이다
 *    - 하루 메시지 수가 0 이다 (이벤트 메시지까지 모두 꺼진 상태)
 *
 * 1) 오늘 목표를 달성했다 → 'goalDone' (칭찬)
 *      목표 시간이 0 보다 크고, 순공시간이 목표 이상일 때입니다.
 *
 * 2) 3일 이상 연속 미달이다 → 'missed3Days' (회복)
 *      회복 모드가 우선이라서, 이때는 아래의 'planLate' 를 아예 보내지 않습니다.
 *      (이미 보냈으면 다른 메시지로 넘어가지 않고 null 입니다)
 *
 * 3) 계획 시간이 지났는데 오늘 공부를 한 번도 안 했고 타이머도 꺼져 있다 → 'planLate' (담백한 알림)
 *
 * 4) 어디에도 안 맞는다 → null
 *
 * 각 메시지는 alreadySentToday 에 있으면 건너뜁니다. (하루에 한 번만)
 *
 * 예시 (모두 지금 오후 8시, 연락 금지 23시~7시, 하루 3개, 오늘 아직 아무것도 안 보냈을 때)
 *   예1) 목표 120분, 순공 130분                         -> 'goalDone'
 *   예2) 목표 120분, 순공 130분, 이미 'goalDone' 보냄   -> null   (같은 메시지는 두 번 안 보냄)
 *   예3) 목표 120분, 순공 0분, 3일 연속 미달            -> 'missed3Days'
 *   예4) 예3 인데 이미 'missed3Days' 보냄               -> null   (회복 중에는 독촉하지 않음)
 *   예5) 계획 시각 19:00, 공부 안 함, 타이머 꺼짐, 2일 연속 미달 -> 'planLate'
 *   예6) 예5 인데 타이머가 켜져 있음                    -> null
 *   예7) 예5 인데 오늘 이미 공부를 했음                 -> null
 *   예8) 지금 밤 11시 30분 (연락 금지)                  -> null   (예1~7 어느 것이든)
 *   예9) 하루 메시지 수 0                               -> null
 *   예10) 계획 시각을 정하지 않았음(null), 공부 안 함   -> null   (3일 연속 미달이 아니면)
 */
export function getEventMessage(input: EventMessageInput): EventMessageType | null {
  const {
    now,
    quietHours,
    dailyCount,
    alreadySentToday,
    plannedStartTime,
    isTimerRunning,
    hasStudiedToday,
    todayStudyMinutes,
    todayTargetMinutes,
    consecutiveMissDays,
  } = input

  // 0) 연락 금지 시간이거나 메시지를 모두 끈 상태
  if (isWithinQuietHours(now, quietHours)) return null
  if (dailyCount <= 0) return null

  // 1) 오늘 목표 달성 → 칭찬
  const isGoalDone = todayTargetMinutes > 0 && todayStudyMinutes >= todayTargetMinutes
  if (isGoalDone) {
    return alreadySentToday.includes('goalDone') ? null : 'goalDone'
  }

  // 2) 3일 연속 미달 → 회복. 회복 모드가 우선이라 독촉(planLate)으로 넘어가지 않습니다.
  if (consecutiveMissDays >= MISSED_DAYS_FOR_RECOVERY) {
    return alreadySentToday.includes('missed3Days') ? null : 'missed3Days'
  }

  // 3) 계획 시간이 지났는데 공부를 안 시작했다 → 담백한 알림
  if (plannedStartTime !== null) {
    const plannedMinutes = toMinutesOfDay(plannedStartTime)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const isPlanTimePassed = plannedMinutes !== null && nowMinutes >= plannedMinutes

    if (
      isPlanTimePassed &&
      !isTimerRunning &&
      !hasStudiedToday &&
      !alreadySentToday.includes('planLate')
    ) {
      return 'planLate'
    }
  }

  return null
}
