import type { StudyPlan, StudySession } from '@/types'
import { getDaySummary } from './daySummary'

/** 그래프 한 점 — 그 날짜까지의 누적 순공시간(분) */
export interface GrowthPoint {
  date: string
  cumulativeMinutes: number
}

/** 예상 성장 곡선 계산 결과 */
export interface GrowthCurve {
  /** 그래프를 그릴 만큼 기록이 쌓였는지 (7일 미만이면 false) */
  hasEnoughData: boolean
  /** 실제 기록 (첫 기록 날짜 ~ 오늘, 누적) */
  actual: GrowthPoint[]
  /** 지금 페이스로 시험일까지 쭉 갔을 때 (오늘, 시험일 두 점) */
  currentPace: GrowthPoint[]
  /** 하루 EXTRA_MINUTES_PER_DAY 분 더 했을 때 (오늘, 시험일 두 점) */
  withExtra: GrowthPoint[]
  /** 지금 페이스면 시험일까지 누적 몇 분일지 */
  currentPaceTotalMinutes: number
  /** 하루 더 하면 시험일까지 누적 몇 분일지 */
  withExtraTotalMinutes: number
  /** "4주 전의 나" 와 비교할 수 있는지 (기록이 28일 미만이면 false) */
  hasFourWeekComparison: boolean
  /** 최근 7일 평균이 4주 전 7일 평균보다 하루 몇 분 늘었는지 (줄었으면 음수) */
  dailyMinutesChangeFromFourWeeksAgo: number
}

/** 하루 추가로 더 공부한다고 가정하는 시간(분) */
export const EXTRA_MINUTES_PER_DAY = 20

const RECENT_DAYS_FOR_PACE = 14 // "지금 페이스"를 구할 때 보는 최근 날 수
const MIN_DAYS_TO_SHOW = 7 // 이 날수 미만이면 그래프 대신 안내 문구
const MIN_DAYS_FOR_COMPARISON = 28 // "4주 전의 나" 문장을 보여줄 최소 날 수
const WEEK_DAYS = 7

const EMPTY_RESULT: GrowthCurve = {
  hasEnoughData: false,
  actual: [],
  currentPace: [],
  withExtra: [],
  currentPaceTotalMinutes: 0,
  withExtraTotalMinutes: 0,
  hasFourWeekComparison: false,
  dailyMinutesChangeFromFourWeeksAgo: 0,
}

/** Date 를 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString() 은 영국 시간 기준이라 쓰지 않습니다) */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' 날짜에서 days 일 만큼 이동한 날짜를 돌려줍니다. */
function moveDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return toDateKey(new Date(year, month - 1, day + days))
}

/** fromKey 부터 toKey 까지 며칠째인지 셉니다. (같은 날이면 1일째) */
function countDays(fromKey: string, toKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromKey.split('-').map(Number)
  const [toYear, toMonth, toDay] = toKey.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  const diffMs =
    new Date(toYear, toMonth - 1, toDay).getTime() -
    new Date(fromYear, fromMonth - 1, fromDay).getTime()
  return Math.round(diffMs / msPerDay) + 1
}

/**
 * D-day(examDateKey)까지 누적 공부 시간을 "지금까지 / 지금 페이스 / 하루 20분 더" 세 시나리오로 계산합니다. (#71)
 *
 * ■ 정해 둔 규칙
 * 1. "첫 기록 날짜"는 계획·공부 기록을 통틀어 가장 이른 날짜입니다.
 * 2. "지금 페이스"는 최근 14일(기록이 그보다 적으면 있는 만큼)의 하루 평균 순공시간입니다.
 * 3. 남은 날(시험일까지)은 오늘을 뺀 날수입니다. 시험일이 이미 지났으면 0으로 봅니다.
 * 4. 기록이 7일 미만이면 과장해서 보여주지 않으려고 그래프 자체를 숨깁니다. (hasEnoughData: false)
 * 5. 기록이 28일(4주) 미만이면 "4주 전의 나" 비교 문장을 숨깁니다. (hasFourWeekComparison: false)
 * 6. 4주 비교는 "최근 7일 평균"과 "4주 전 7일 평균"의 하루 평균 차이입니다.
 *
 * ■ 예시 (입력 → 결과)
 *
 *   예1) 기록이 5일치뿐인 경우 -> hasEnoughData: false (나머지 값은 비어 있음)
 *
 *   예2) 10일치 기록, 하루 평균 60분, 시험일이 10일 뒤인 경우
 *        -> currentPaceTotalMinutes = 지금까지 누적 + 60분 × 10일
 *        -> withExtraTotalMinutes = 지금까지 누적 + 80분 × 10일
 *
 *   예3) 기록이 20일치뿐인 경우 (28일 미만) -> hasFourWeekComparison: false
 */
export function getGrowthCurve(
  plans: StudyPlan[],
  sessions: StudySession[],
  todayKey: string,
  examDateKey: string,
): GrowthCurve {
  const recordDates = [
    ...plans.map((plan) => plan.date),
    ...sessions.map((session) => toDateKey(new Date(session.startedAt))),
  ]
  if (recordDates.length === 0) return EMPTY_RESULT

  const firstRecordKey = [...recordDates].sort()[0]
  const totalDays = countDays(firstRecordKey, todayKey)
  if (totalDays < MIN_DAYS_TO_SHOW) return EMPTY_RESULT

  // 첫 기록 날짜부터 오늘까지, 하루씩 순공시간을 더해서 누적선을 만듭니다.
  const dailyMinutes: number[] = []
  const actual: GrowthPoint[] = []
  let cumulativeMinutes = 0
  for (let i = 0; i < totalDays; i++) {
    const dateKey = moveDateKey(firstRecordKey, i)
    const summary = getDaySummary(dateKey, plans, sessions)
    dailyMinutes.push(summary.studyMinutes)
    cumulativeMinutes += summary.studyMinutes
    actual.push({ date: dateKey, cumulativeMinutes })
  }

  // 최근 14일(또는 있는 만큼) 평균 하루 순공시간 = "지금 페이스"
  const recentDaysCount = Math.min(RECENT_DAYS_FOR_PACE, totalDays)
  const recentMinutesSum = dailyMinutes
    .slice(totalDays - recentDaysCount)
    .reduce((sum, minutes) => sum + minutes, 0)
  const averageDailyMinutes = recentMinutesSum / recentDaysCount

  // 시험일까지 남은 날 (오늘은 빼고 셉니다. 시험일이 지났으면 0일)
  const daysUntilExam = Math.max(0, countDays(todayKey, examDateKey) - 1)

  const currentPaceTotalMinutes = Math.round(
    cumulativeMinutes + averageDailyMinutes * daysUntilExam,
  )
  const withExtraTotalMinutes = Math.round(
    cumulativeMinutes + (averageDailyMinutes + EXTRA_MINUTES_PER_DAY) * daysUntilExam,
  )

  const currentPace: GrowthPoint[] = [
    { date: todayKey, cumulativeMinutes },
    { date: examDateKey, cumulativeMinutes: currentPaceTotalMinutes },
  ]
  const withExtra: GrowthPoint[] = [
    { date: todayKey, cumulativeMinutes },
    { date: examDateKey, cumulativeMinutes: withExtraTotalMinutes },
  ]

  // 4주(28일) 미만이면 비교할 "4주 전"이 없으므로 비교 문장을 숨깁니다.
  const hasFourWeekComparison = totalDays >= MIN_DAYS_FOR_COMPARISON
  let dailyMinutesChangeFromFourWeeksAgo = 0
  if (hasFourWeekComparison) {
    const recentWeekAverage =
      dailyMinutes.slice(totalDays - WEEK_DAYS).reduce((sum, minutes) => sum + minutes, 0) /
      WEEK_DAYS
    const fourWeeksAgoStart = totalDays - MIN_DAYS_FOR_COMPARISON
    const fourWeeksAgoWeekAverage =
      dailyMinutes
        .slice(fourWeeksAgoStart, fourWeeksAgoStart + WEEK_DAYS)
        .reduce((sum, minutes) => sum + minutes, 0) / WEEK_DAYS
    dailyMinutesChangeFromFourWeeksAgo = Math.round(recentWeekAverage - fourWeeksAgoWeekAverage)
  }

  return {
    hasEnoughData: true,
    actual,
    currentPace,
    withExtra,
    currentPaceTotalMinutes,
    withExtraTotalMinutes,
    hasFourWeekComparison,
    dailyMinutesChangeFromFourWeeksAgo,
  }
}
