import type { StudyPlan, StudySession } from '@/types'

/** 하루 기록으로 계산한 기본 지표입니다. */
export interface DaySummary {
  /** 순공시간 (분). 그날 시작한 세션의 길이를 모두 더한 값 */
  studyMinutes: number
  /** 계획 달성률 (0 ~ 100 정수). 순공시간 ÷ 그날 계획 목표 시간의 합계 */
  achievementRate: number
  /** 그날 가장 먼저 공부를 시작한 시각 (Date.now() 값). 공부 기록이 없으면 null */
  firstStartAt: number | null
  /** 세션 하나의 평균 길이 (분). 공부 기록이 없으면 0 */
  averageSessionMinutes: number
}

const MS_PER_MINUTE = 60 * 1000

/** Date 를 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString 은 한국 시간이 아니라서 쓰지 않습니다) */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 하루치 계획과 공부 기록으로 그날의 기본 지표를 계산합니다.
 * (숫자는 코드가 계산하고, AI 는 그 숫자를 해석만 합니다.)
 *
 * date 는 계산할 날짜입니다. 'YYYY-MM-DD' 모양이고, plans 와 sessions 는 여러 날짜가
 * 섞여 있어도 됩니다. 이 함수가 date 에 해당하는 것만 골라서 계산합니다.
 *
 * ■ 정해 둔 규칙 (BE 도 똑같이 만들어야 같은 결과가 나옵니다)
 *
 * 1. 날짜는 한국 시간 기준입니다. 하루는 00:00 에 바뀝니다.
 * 2. 자정을 넘긴 세션은 "시작한 날"의 기록으로 셉니다.
 *    세션 전체 시간을 시작한 날에 넣고, 다음 날에는 0분으로 칩니다.
 *    (공부 연속일을 세는 getStudyStreak 도 시작한 날 기준이라 서로 맞습니다.)
 * 3. 순공시간(분)은 세션 길이(밀리초)를 모두 더한 뒤 마지막에 한 번만 반올림합니다.
 *    세션마다 반올림하지 않습니다.
 * 4. 평균 세션 길이(분)도 (전체 길이 ÷ 세션 수) 를 마지막에 한 번만 반올림합니다.
 * 5. 달성률 = 순공시간 ÷ 계획 목표 시간 합계 × 100, 소수점은 버립니다.
 *    100 을 넘으면 100 으로 맞춥니다. 반올림하지 않는 이유는, 99.6% 가 100% 로 보이면
 *    "다 못 채운 날" 인데도 못 채웠다고 안 물어보게 되기 때문입니다.
 * 6. 계획 목표 시간 합계가 0 (계획이 없거나 전부 0분) 이면 나눌 수 없으므로 달성률은 0 입니다.
 *    공부를 했어도 0 입니다.
 * 7. 끝 시각이 시작 시각보다 빠른 잘못된 세션은 길이를 0분으로 칩니다.
 *
 * ■ 예시 (입력 → 결과)
 *
 *   예1) 계획도 기록도 없는 날
 *        plans = [], sessions = []
 *        -> { studyMinutes: 0, achievementRate: 0, firstStartAt: null, averageSessionMinutes: 0 }
 *
 *   예2) 계획만 있고 공부는 안 한 날 (수학 60분 계획, 기록 없음)
 *        -> { studyMinutes: 0, achievementRate: 0, firstStartAt: null, averageSessionMinutes: 0 }
 *
 *   예3) 계획 목표가 0분인데 공부한 날 (0 으로 나누기)
 *        수학 0분 계획, 10:00~10:30 공부
 *        -> { studyMinutes: 30, achievementRate: 0, firstStartAt: (10:00), averageSessionMinutes: 30 }
 *
 *   예4) 계획 240분 (수학 120 + 영어 120), 공부 두 번 (10:00~11:00, 14:00~16:10)
 *        순공 60 + 130 = 190분, 190 ÷ 240 = 79.1...%
 *        -> { studyMinutes: 190, achievementRate: 79, firstStartAt: (10:00), averageSessionMinutes: 95 }
 *
 *   예5) 계획 60분인데 90분 공부 (100 을 넘는 경우)
 *        -> { studyMinutes: 90, achievementRate: 100, ... }
 *
 *   예6) 계획 240분인데 239분 공부 (거의 다 채운 경우)
 *        239 ÷ 240 = 99.58...% 이지만 소수점을 버려서
 *        -> achievementRate: 99  (100 은 다 채웠을 때만 나옵니다)
 *
 *   예7) 자정을 넘긴 세션 — 10월 4일 23:30 ~ 10월 5일 00:30 (60분)
 *        date '2026-10-04' -> studyMinutes: 60, firstStartAt: (10월 4일 23:30)
 *        date '2026-10-05' -> studyMinutes: 0,  firstStartAt: null
 *
 *   예8) 다른 날 기록이 섞여 있는 경우
 *        date 가 '2026-10-05' 이면 10월 4일 계획과 세션은 모두 무시합니다.
 *
 * (일시정지 횟수 pauseCount 합계는 #78 이 머지된 뒤에 이 결과에 추가합니다.)
 */
export function getDaySummary(
  date: string,
  plans: StudyPlan[],
  sessions: StudySession[],
): DaySummary {
  // 그날의 계획과 그날 시작한 세션만 골라냅니다.
  const dayPlans = plans.filter((plan) => plan.date === date)
  const daySessions = sessions.filter((session) => toDateKey(new Date(session.startedAt)) === date)

  // 세션 길이를 모두 더하고, 가장 이른 시작 시각을 찾습니다.
  let totalMs = 0
  let firstStartAt: number | null = null
  for (const session of daySessions) {
    // 끝이 시작보다 빠른 잘못된 기록은 0 으로 칩니다. (규칙 7)
    totalMs += Math.max(0, session.endedAt - session.startedAt)

    if (firstStartAt === null || session.startedAt < firstStartAt) {
      firstStartAt = session.startedAt
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

  return { studyMinutes, achievementRate, firstStartAt, averageSessionMinutes }
}
