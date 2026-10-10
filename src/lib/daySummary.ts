import { toDayKey } from '@/lib/date'
import { getStudyMs } from '@/lib/studyTime'
import type { StudyPlan, StudySession } from '@/types'

/** 하루 기록으로 계산한 기본 지표입니다. */
export interface DaySummary {
  /** 순공시간 (분). 그날 시작한 세션의 순공(끝 − 시작 − 일시정지한 시간)을 모두 더한 값 */
  studyMinutes: number
  /** 계획 달성률 (0 ~ 100 정수). 순공시간 ÷ 그날 계획 목표 시간의 합계 */
  achievementRate: number
  /** 그날 가장 먼저 공부를 시작한 시각 (Date.now() 값). 공부 기록이 없으면 null */
  firstStartAt: number | null
  /** 세션 하나의 평균 순공시간 (분). 공부 기록이 없으면 0 */
  averageSessionMinutes: number
  /** 일시정지를 누른 횟수의 합계. 그날 시작한 세션들의 pauseCount 를 더한 값. 공부 기록이 없으면 0 */
  pauseCount: number
}

const MS_PER_MINUTE = 60 * 1000

/**
 * 하루치 계획과 공부 기록으로 그날의 기본 지표를 계산합니다.
 * (숫자는 코드가 계산하고, AI 는 그 숫자를 해석만 합니다.)
 *
 * date 는 계산할 날짜입니다. 'YYYY-MM-DD' 모양이고, plans 와 sessions 는 여러 날짜가
 * 섞여 있어도 됩니다. 이 함수가 date 에 해당하는 것만 골라서 계산합니다.
 *
 * ■ 정해 둔 규칙 (BE 도 똑같이 만들어야 같은 결과가 나옵니다)
 *
 * 1. 날짜는 한국 시간 기준입니다. 하루는 새벽 4시에 바뀝니다. (lib/date.ts 의 toDayKey)
 *    00:00 ~ 03:59 에 시작한 세션은 전날 기록입니다.
 * 2. 새벽 4시를 넘긴 세션은 "시작한 날"의 기록으로 셉니다.
 *    세션 전체 시간을 시작한 날에 넣고, 다음 날에는 0분으로 칩니다.
 *    (공부 연속일을 세는 getStudyStreak 도 시작한 날 기준이라 서로 맞습니다.)
 * 3. 순공시간(분)은 세션의 순공(밀리초)을 모두 더한 뒤 마지막에 한 번만 반올림합니다.
 *    세션마다 반올림하지 않습니다.
 *    세션의 순공 = 끝 − 시작 − 일시정지한 시간(pausedMs). 계산은 lib/studyTime.ts 의 getStudyMs 가 합니다. (규칙 9)
 * 4. 평균 세션 길이(분)도 (전체 길이 ÷ 세션 수) 를 마지막에 한 번만 반올림합니다.
 * 5. 달성률 = 순공시간 ÷ 계획 목표 시간 합계 × 100, 소수점은 버립니다.
 *    100 을 넘으면 100 으로 맞춥니다. 반올림하지 않는 이유는, 99.6% 가 100% 로 보이면
 *    "다 못 채운 날" 인데도 못 채웠다고 안 물어보게 되기 때문입니다.
 * 6. 계획 목표 시간 합계가 0 (계획이 없거나 전부 0분) 이면 나눌 수 없으므로 달성률은 0 입니다.
 *    공부를 했어도 0 입니다.
 * 7. 끝 시각이 시작 시각보다 빠른 잘못된 세션은 길이를 0분으로 칩니다.
 * 8. 일시정지 횟수(pauseCount)는 그날 시작한 세션들의 pauseCount 를 모두 더합니다. (규칙 2 처럼 시작한 날에 셉니다)
 *    pauseCount 가 없거나(옛 기록) 0 이상의 정수가 아닌 이상한 값이면 그 세션은 0번으로 칩니다.
 * 9. 일시정지해 있던 시간(pausedMs)은 순공에서 뺍니다. 뽀모도로의 휴식 시간도 pausedMs 에 들어 있습니다.
 *    pausedMs 가 없는 옛 기록은 0 으로 보고, 음수이거나 (끝 − 시작)보다 큰 이상한 값도 0 으로 칩니다.
 * 10. 노는 계획과 노는 기록(kind 가 'play')은 공부가 아니라서 어떤 지표에도 넣지 않습니다. (#238)
 *    순공시간 · 달성률의 목표 시간 · 첫 시작 시각 · 평균 세션 길이 · 일시정지 횟수 모두에서 빠집니다.
 *
 * ■ 예시 (입력 → 결과)
 *
 *   예1) 계획도 기록도 없는 날
 *        plans = [], sessions = []
 *        -> { studyMinutes: 0, achievementRate: 0, firstStartAt: null, averageSessionMinutes: 0, pauseCount: 0 }
 *
 *   예2) 계획만 있고 공부는 안 한 날 (수학 60분 계획, 기록 없음)
 *        -> { studyMinutes: 0, achievementRate: 0, firstStartAt: null, averageSessionMinutes: 0, pauseCount: 0 }
 *
 *   예3) 계획 목표가 0분인데 공부한 날 (0 으로 나누기)
 *        수학 0분 계획, 10:00~10:30 공부 (일시정지 안 누름)
 *        -> { studyMinutes: 30, achievementRate: 0, firstStartAt: (10:00), averageSessionMinutes: 30, pauseCount: 0 }
 *
 *   예4) 계획 240분 (수학 120 + 영어 120), 공부 두 번 (10:00~11:00 일시정지 1번, 14:00~16:10 일시정지 2번)
 *        순공 60 + 130 = 190분, 190 ÷ 240 = 79.1...%, 일시정지 1 + 2 = 3번
 *        -> { studyMinutes: 190, achievementRate: 79, firstStartAt: (10:00), averageSessionMinutes: 95, pauseCount: 3 }
 *
 *   예5) 계획 60분인데 90분 공부 (100 을 넘는 경우)
 *        -> { studyMinutes: 90, achievementRate: 100, ... }
 *
 *   예6) 계획 240분인데 239분 공부 (거의 다 채운 경우)
 *        239 ÷ 240 = 99.58...% 이지만 소수점을 버려서
 *        -> achievementRate: 99  (100 은 다 채웠을 때만 나옵니다)
 *
 *   예7) 새벽 4시를 넘긴 세션 — 10월 5일 03:30 ~ 04:30 (60분)
 *        (이 세션에서 일시정지를 2번 눌렀다면)
 *        03:30 은 아직 10월 4일이라서, 60분 전부가 10월 4일 기록입니다.
 *        date '2026-10-04' -> studyMinutes: 60, firstStartAt: (10월 5일 03:30), pauseCount: 2
 *        date '2026-10-05' -> studyMinutes: 0,  firstStartAt: null,             pauseCount: 0
 *
 *   예8) 다른 날 기록이 섞여 있는 경우
 *        date 가 '2026-10-05' 이면 10월 4일 계획과 세션은 모두 무시합니다. (일시정지 횟수도 10월 5일 세션만 셉니다)
 *
 *   예9) 일시정지 횟수가 이상한 기록이 섞인 경우 (규칙 8)
 *        그날 세션 3개의 pauseCount 가 [2, 없음(옛 기록), -1] 이면
 *        -> pauseCount: 2   (없는 값과 음수는 0번으로 칩니다)
 *
 *   예10) 일시정지한 시간을 빼는 경우 (규칙 9) — 계획 60분,
 *        19:00 시작 → 19:20 일시정지 → 20:00 다시 시작 → 20:10 정지 (끝 − 시작 70분, pausedMs 40분, 일시정지 1번)
 *        -> { studyMinutes: 30, achievementRate: 50, firstStartAt: (19:00), averageSessionMinutes: 30, pauseCount: 1 }
 */
export function getDaySummary(
  date: string,
  plans: StudyPlan[],
  sessions: StudySession[],
): DaySummary {
  // 그날의 계획과 그날 시작한 세션만 골라냅니다. 노는 계획·노는 기록은 뺍니다. (규칙 10)
  const dayPlans = plans.filter((plan) => plan.date === date && plan.kind !== 'play')
  const daySessions = sessions.filter(
    (session) => toDayKey(session.startedAt) === date && session.kind !== 'play',
  )

  // 세션 길이를 모두 더하고, 가장 이른 시작 시각을 찾습니다.
  let totalMs = 0
  let firstStartAt: number | null = null
  let pauseCount = 0
  for (const session of daySessions) {
    // 일시정지한 시간을 뺀 순공입니다. 끝이 시작보다 빠른 잘못된 기록은 0 으로 칩니다. (규칙 7, 9)
    totalMs += getStudyMs(session)

    if (firstStartAt === null || session.startedAt < firstStartAt) {
      firstStartAt = session.startedAt
    }

    // 일시정지 횟수를 더합니다. 옛 기록에는 없을 수 있어서 0 이상의 정수일 때만 더합니다. (규칙 8)
    if (Number.isInteger(session.pauseCount) && session.pauseCount > 0) {
      pauseCount += session.pauseCount
    }
  }

  const studyMinutes = Math.round(totalMs / MS_PER_MINUTE)
  const averageSessionMinutes =
    daySessions.length === 0 ? 0 : Math.round(totalMs / daySessions.length / MS_PER_MINUTE)

  // 계획 목표 시간 합계가 0 이하면 나눌 수 없으니 달성률은 0 으로 둡니다. (규칙 6)
  const targetMinutes = dayPlans.reduce((sum, plan) => sum + plan.targetMinutes, 0)
  let achievementRate = 0
  if (targetMinutes > 0) {
    // 100 을 먼저 곱한 뒤 나눕니다. (29 ÷ 100 × 100 이 28.999… 로 나오는 계산 오차를 피하기 위해서입니다)
    achievementRate = Math.min(100, Math.floor((studyMinutes * 100) / targetMinutes))
  }

  return { studyMinutes, achievementRate, firstStartAt, averageSessionMinutes, pauseCount }
}
