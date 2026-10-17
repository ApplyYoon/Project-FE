/**
 * 옛 계획 기록(계획 + 타이머 기록)에서 "연속 미달 일수" 를 계산합니다. (알림의 "3일 연속 미달", lib/appAlertCheck.ts)
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 * (예전에 같이 있던 목표 조정 제안(#67)과 개선안 대응(#205)은 #417 에서 지웠습니다)
 */
import { moveDateKey, toDayKey } from '@/lib/date'
import { getDaySummary } from '@/lib/daySummary'
import type { StudyPlan, StudySession } from '@/types'

// 연속 미달을 셀 때 최대로 거슬러 올라갈 일수입니다. (무한히 돌지 않게 하는 안전장치)
const MAX_MISS_LOOKBACK_DAYS = 30

/** 기준 날짜에서 n 일 전의 날짜('YYYY-MM-DD')를 돌려줍니다. */
function daysAgoKey(today: Date, n: number): string {
  // 오늘은 하루의 기준(새벽 4시)으로 정합니다. (lib/date.ts)
  return moveDateKey(toDayKey(today), -n)
}

/**
 * 어제부터 거슬러 올라가며, 계획을 못 채운 날이 연속으로 며칠인지 셉니다.
 *
 *   - 계획이 있었고 달성률이 100% 미만인 날 → 못 채운 날 (계속 셉니다)
 *   - 계획이 없던 날, 또는 100% 채운 날 → 여기서 멈춥니다
 *
 *   예) 어제 50%, 그저께 80%, 3일 전 100% → 2
 *   예) 어제 계획 없음 → 0
 */
export function countConsecutiveMissDays(
  plans: StudyPlan[],
  sessions: StudySession[],
  today: Date = new Date(),
): number {
  let missDays = 0

  for (let n = 1; n <= MAX_MISS_LOOKBACK_DAYS; n += 1) {
    const date = daysAgoKey(today, n)
    const hasPlan = plans.some((plan) => plan.date === date)
    if (!hasPlan) break

    const { achievementRate } = getDaySummary(date, plans, sessions)
    // null 은 달성률을 계산할 수 없는 날(목표 시간이 0)이라, 계획이 없던 날처럼 여기서 멈춥니다.
    if (achievementRate === null || achievementRate >= 100) break

    missDays += 1
  }

  return missDays
}
