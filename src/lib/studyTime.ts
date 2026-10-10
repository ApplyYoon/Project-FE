import type { StudySession } from '@/types'

/**
 * 기록 하나의 "실제 길이" 를 구합니다. 공부 기록이든 노는 기록이든 같은 계산입니다.
 *
 *   실제 길이 = 끝 시각 − 시작 시각 − 일시정지해 있던 시간
 *
 * 계획 줄의 `32 / 50분` 처럼 "그 계획으로 실제 쓴 시간" 을 보여줄 때 씁니다. (노는 계획도 실제 시간이 보여야 합니다)
 * 순공시간을 구할 때는 이 함수가 아니라 아래 getStudyMs 를 쓰세요. 잘못된 값의 처리 규칙은 getStudyMs 의 설명과 같습니다.
 */
export function getSessionMs(session: StudySession): number {
  const totalMs = session.endedAt - session.startedAt
  // 끝이 시작보다 빠르거나, 값이 깨져서 NaN 이면 0 입니다. (NaN > 0 은 false 입니다)
  if (!(totalMs > 0)) return 0

  const pausedMs = session.pausedMs
  const isValidPausedMs =
    typeof pausedMs === 'number' &&
    Number.isFinite(pausedMs) &&
    pausedMs >= 0 &&
    pausedMs <= totalMs

  return isValidPausedMs ? totalMs - pausedMs : totalMs
}

/**
 * 공부 기록 하나의 "순공시간"을 구하는 함수입니다. React 없이 돌아가는 순수 함수라서 `lib/` 에 둡니다.
 *
 *   순공시간 = 끝 시각 − 시작 시각 − 일시정지해 있던 시간
 *
 * 타이머 화면은 일시정지한 시간을 빼고 보여줍니다. 기록으로 계산할 때도 똑같이 빼야
 * 화면에서 본 시간과 기록·리포트의 시간이 같아집니다.
 *
 * 순공시간을 계산하는 곳은 모두 이 함수를 씁니다. `endedAt - startedAt` 을 직접 계산하지 마세요.
 * (BE 도 같은 규칙으로 계산합니다. 규칙을 바꾸면 BE 에도 알려야 합니다)
 *
 * ■ 규칙
 * 1. 끝 시각이 시작 시각보다 빠르거나 같은 잘못된 기록은 0 입니다.
 * 2. pausedMs 가 없는 옛 기록은 일시정지한 시간을 0 으로 봅니다.
 * 3. pausedMs 가 숫자가 아니거나, 음수이거나, (끝 − 시작)보다 크면 믿을 수 없는 값이라 0 으로 칩니다.
 * 4. 노는 기록(kind 가 'play')은 공부가 아니라서 순공시간이 0 입니다. (#238)
 *
 * ■ 예시 (입력 → 결과)
 *   예1) 19:00 시작 → 19:20 일시정지 → 20:00 다시 시작 → 20:10 정지
 *        끝 − 시작 = 70분, pausedMs = 40분                    -> 30분
 *   예2) 옛 기록 (pausedMs 없음), 10:00 ~ 10:50               -> 50분
 *   예3) pausedMs 가 -5분 (이상한 값), 10:00 ~ 10:50          -> 50분
 *   예4) pausedMs 가 90분인데 기록은 10:00 ~ 10:50 (50분짜리)  -> 50분
 *   예5) 끝이 시작보다 빠른 기록                              -> 0
 *   예6) 노는 기록 (kind: 'play'), 20:00 ~ 21:00              -> 0
 */
export function getStudyMs(session: StudySession): number {
  if (session.kind === 'play') return 0
  return getSessionMs(session)
}
