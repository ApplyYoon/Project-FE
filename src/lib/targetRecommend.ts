/**
 * 타이머를 시작할 때 "알맞은 목표 시간" 을 추천하는 순수 함수입니다. (#246) React 없이 돌아가서 `lib/` 에 둡니다.
 *
 * 이 앱의 보상은 선물이 아니라 "딱 맞는 난이도" 입니다. 계속 완주하면 조금 길게, 자꾸 중간에 멈추면 "더 열심히" 가 아니라
 * "더 짧게" 를 권합니다. 추천은 보여주기만 하고 고르는 것은 사용자입니다. 무시해도 아무 일도 일어나지 않습니다.
 *
 * (하루 목표 전체를 올리고 내리는 제안은 lib/goalAdjust.ts 입니다. 이 파일은 타이머 "한 번" 의 길이입니다)
 */
import { MAX_TARGET_MINUTES } from '@/lib/countdown'
import { getStudyMs } from '@/lib/studyTime'
import type { StudySession } from '@/types'

/** 과목마다 "목표가 있는 최근 기록" 을 몇 개 볼지 */
export const RECENT_SESSION_COUNT = 3
/** 최근 기록을 모두 완주했을 때 올리는 시간 (분) */
export const RAISE_STEP_MINUTES = 10
/** 최근 기록 중 이 횟수 이상 중간에 멈췄으면 낮춥니다 */
export const STOPPED_COUNT_TO_LOWER = 2
/** 낮출 때 맞추는 단위 (분). 32분 → 35분 */
export const LOWER_UNIT_MINUTES = 5
/** 추천하는 가장 짧은 목표 (분) */
export const MIN_RECOMMEND_MINUTES = 15

const MS_PER_MINUTE = 60 * 1000

/** 추천 하나 */
export interface TargetRecommendation {
  /** 추천하는 목표 시간 (분) */
  minutes: number
  /** raise: 지금보다 길게 / lower: 지금보다 짧게 */
  kind: 'raise' | 'lower'
  /** 화면에 보여줄 이유 한 줄 */
  reason: string
}

/**
 * 그 과목의 최근 기록을 보고 목표 시간을 추천합니다. 추천할 것이 없으면 null 입니다.
 *
 *   const recommendation = getTargetRecommendation(sessions, 'math', 50)
 *   recommendation?.minutes -> 35
 *   recommendation?.reason  -> '최근엔 32분쯤에서 멈췄어. 35분부터 해볼까?'
 *
 * ■ 규칙
 *  1. 그 과목의 공부 기록 중 "목표가 있는 것"(targetMinutes 가 0 보다 큼)만 봅니다. 노는 기록은 보지 않습니다.
 *  2. 그중 가장 최근에 시작한 3개만 봅니다. 3개가 안 되면 추천하지 않습니다.
 *  3. 완주 = 순공시간이 그 기록의 목표 이상. (lib/facts.ts 와 같은 기준)
 *  4. 3개 모두 완주 → (3개의 목표 중 가장 긴 것 + 10분) 을 추천합니다.
 *     "지금 고른 목표 + 10분" 이 아니라 "해낸 목표 + 10분" 인 이유: 추천을 받아들인 뒤에도 같은 기록으로
 *     60 → 70 → 80분… 을 계속 권하면 안 되기 때문입니다. 새로 완주해야 다음 단계가 열립니다.
 *     지금 고른 목표가 이미 그 이상이면 추천하지 않습니다. 직접 입력할 수 있는 최대(600분)를 넘지 않습니다.
 *  5. 2개 이상 중간에 멈춤 → 멈춘 기록들의 순공시간 평균을 5분 단위로 올림한 값을 추천합니다. 최소 15분입니다.
 *     (평균 32분 → 35분) 지금 고른 목표가 이미 그 이하이면 추천하지 않습니다.
 *  6. 그 밖(3개 중 1개만 멈춤)에는 추천하지 않습니다.
 *
 * ■ 예시 (입력 → 결과) — 과목은 모두 수학
 *
 *   예1) 올리기: 목표 50분을 3번 모두 완주, 지금 목표 50분
 *        -> { minutes: 60, kind: 'raise', reason: '3번 연속 완주! 60분 어때?' }
 *
 *   예2) 낮추기: 목표 50분에 30분·34분에서 멈추고 1번은 완주, 지금 목표 50분
 *        -> { minutes: 35, kind: 'lower', reason: '최근엔 32분쯤에서 멈췄어. 35분부터 해볼까?' }   ((30 + 34) ÷ 2 = 32 → 35)
 *
 *   예3) 추천 없음: 3번 중 2번 완주, 1번만 멈춤                     -> null
 *
 *   예4) 기록 부족: 목표가 있는 기록이 2개뿐                        -> null
 *
 *   예5) 이미 반영함: 목표 50분을 3번 완주했는데 지금 목표가 60분     -> null   (새로 완주해야 70분을 권합니다)
 *
 *   예6) 최소 15분: 목표 25분에 4분·6분에서 멈춤, 지금 목표 25분
 *        -> { minutes: 15, kind: 'lower', reason: '최근엔 5분쯤에서 멈췄어. 15분부터 해볼까?' }
 *
 *   예7) 다른 과목·노는 기록·목표 없는 기록은 세지 않습니다.
 */
export function getTargetRecommendation(
  sessions: StudySession[],
  subjectId: string,
  currentTargetMinutes: number,
): TargetRecommendation | null {
  // 규칙 1, 2: 그 과목의 목표가 있는 공부 기록을 최근 순으로 3개 고릅니다.
  const recentSessions = sessions
    .filter(
      (session) =>
        session.kind !== 'play' &&
        session.subjectId === subjectId &&
        typeof session.targetMinutes === 'number' &&
        Number.isFinite(session.targetMinutes) &&
        session.targetMinutes > 0,
    )
    // 시작 시각이 큰(늦은) 것이 앞으로 오게 줄 세웁니다. filter 가 새 배열을 만들어서 원래 배열은 바뀌지 않습니다.
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, RECENT_SESSION_COUNT)

  if (recentSessions.length < RECENT_SESSION_COUNT) return null

  // 중간에 멈춘 기록들의 순공시간(밀리초)과, 본 기록들의 목표 중 가장 긴 것을 구합니다.
  const stoppedMsList: number[] = []
  let longestTargetMinutes = 0
  for (const session of recentSessions) {
    // 위 filter 에서 숫자인 것만 남겼지만, 타입스크립트는 그걸 몰라서 다시 꺼내 둡니다.
    const targetMinutes = session.targetMinutes ?? 0
    longestTargetMinutes = Math.max(longestTargetMinutes, targetMinutes)

    const studyMs = getStudyMs(session)
    if (studyMs < targetMinutes * MS_PER_MINUTE) stoppedMsList.push(studyMs)
  }

  // 규칙 4: 모두 완주했으면 조금 길게.
  if (stoppedMsList.length === 0) {
    const minutes = Math.min(longestTargetMinutes + RAISE_STEP_MINUTES, MAX_TARGET_MINUTES)
    if (currentTargetMinutes >= minutes) return null
    return {
      minutes,
      kind: 'raise',
      reason: `${RECENT_SESSION_COUNT}번 연속 완주! ${minutes}분 어때?`,
    }
  }

  // 규칙 5: 자꾸 멈췄으면 멈춘 지점쯤으로 짧게.
  if (stoppedMsList.length >= STOPPED_COUNT_TO_LOWER) {
    let stoppedMsSum = 0
    for (const stoppedMs of stoppedMsList) stoppedMsSum += stoppedMs
    const averageMinutes = Math.round(stoppedMsSum / stoppedMsList.length / MS_PER_MINUTE)

    // 5분 단위로 올림 (32 → 35, 35 → 35), 그리고 최소 15분.
    const roundedUp = Math.ceil(averageMinutes / LOWER_UNIT_MINUTES) * LOWER_UNIT_MINUTES
    const minutes = Math.max(roundedUp, MIN_RECOMMEND_MINUTES)
    if (currentTargetMinutes <= minutes) return null
    return {
      minutes,
      kind: 'lower',
      reason: `최근엔 ${averageMinutes}분쯤에서 멈췄어. ${minutes}분부터 해볼까?`,
    }
  }

  // 규칙 6
  return null
}
