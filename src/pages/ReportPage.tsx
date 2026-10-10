import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { GrowthCurveChart } from '@/components/ui/GrowthCurveChart'
import { InsightCard } from '@/components/ui/InsightCard'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { usePlans } from '@/hooks/usePlans'
import { cn } from '@/lib/cn'
import { getDaySummary } from '@/lib/daySummary'
import { EXTRA_MINUTES_PER_DAY, getGrowthCurve } from '@/lib/growthCurve'
import { mockInsights, mockSessions } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import { REVIEW_MAX_LENGTH, findWeeklyReview, saveWeeklyReview } from '@/lib/weeklyReview'
import type { StudyPlan, StudySession, WeeklyReview } from '@/types'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토']
// 월간 리포트는 6주차(42일)부터 볼 수 있습니다. (#86)
const MIN_DAYS_FOR_MONTHLY = 42

// 며칠 동안 기록이 쌓여야 첫 리포트를 보여줄지 (#85)
const FIRST_REPORT_DAYS = 14

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

/** weeksAgo 번째 이전 주의 월요일 날짜를 돌려줍니다. (0 = 이번 주) */
function getMondayKey(weeksAgo: number): string {
  const date = new Date()
  // getDay(): 일요일 0, 월요일 1 ... 토요일 6. 월요일에서 며칠 지났는지 계산합니다. (일요일은 6일 지난 것으로 봅니다)
  const daysFromMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysFromMonday - weeksAgo * 7)
  return toDateKey(date)
}

/** 'YYYY-MM-DD' 를 "10월 5일 (일)" 처럼 보여줍니다. */
function formatShortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return `${month}월 ${day}일 (${WEEKDAY_SHORT[date.getDay()]})`
}

/** 'YYYY-MM-DD' 를 "10월 5일" 처럼 요일 없이 보여줍니다. (월간 리포트 날짜 범위용) */
function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}

/** 분을 "3시간 10분" 처럼 보여줍니다. 60분 미만이면 "분"만 보여줍니다. */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** 자정부터 몇 분 지났는지(0~1439)를 "19:25" 처럼 보여줍니다. 기록이 없으면 '-' 입니다. */
function formatStartTime(minutesFromMidnight: number | null): string {
  if (minutesFromMidnight === null) return '-'
  const hour = Math.floor(minutesFromMidnight / 60)
  const minute = minutesFromMidnight % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

interface RangeStats {
  /** 기간 순공시간 합계(분) */
  studyMinutes: number
  /** 기간 계획 목표 시간 합계(분). 달성률을 "합계 ÷ 합계" 로 구하려고 따로 들고 있습니다. */
  targetMinutes: number
  /** 기간 계획 달성률 (0 ~ 100). 계획이 하나도 없으면 0 */
  achievementRate: number
  /** 공부를 시작한 날들의, 자정부터 몇 분 지나서 시작했는지 평균. 기록이 없으면 null */
  averageStartMinutes: number | null
}

/** startKey 부터 days 일치를 getDaySummary 로 더해서 기간 통계를 만듭니다. (주간·월간이 같이 씁니다) */
function getRangeStats(
  startKey: string,
  days: number,
  plans: StudyPlan[],
  sessions: StudySession[],
): RangeStats {
  let studyMinutes = 0
  let targetMinutes = 0
  const startMinutesList: number[] = []

  for (let i = 0; i < days; i++) {
    const dateKey = moveDateKey(startKey, i)
    const summary = getDaySummary(dateKey, plans, sessions)
    studyMinutes += summary.studyMinutes
    targetMinutes += plans
      .filter((plan) => plan.date === dateKey)
      .reduce((sum, plan) => sum + plan.targetMinutes, 0)

    if (summary.firstStartAt !== null) {
      const start = new Date(summary.firstStartAt)
      startMinutesList.push(start.getHours() * 60 + start.getMinutes())
    }
  }

  // 순공시간 ÷ 목표 시간을 "날짜별로 평균" 내지 않고 "합계 ÷ 합계" 로 구합니다. (하루 계산과 같은 방식)
  const achievementRate =
    targetMinutes > 0 ? Math.min(100, Math.floor((studyMinutes * 100) / targetMinutes)) : 0

  const averageStartMinutes =
    startMinutesList.length === 0
      ? null
      : Math.round(
          startMinutesList.reduce((sum, minutes) => sum + minutes, 0) / startMinutesList.length,
        )

  return { studyMinutes, targetMinutes, achievementRate, averageStartMinutes }
}

/** 월요일 날짜(mondayKey)부터 7일치 통계. (주간 리포트용) */
function getWeekStats(mondayKey: string, plans: StudyPlan[], sessions: StudySession[]): RangeStats {
  return getRangeStats(mondayKey, 7, plans, sessions)
}

/** "지난주보다 2시간 10분 ↑" 처럼 차이를 보여줍니다. periodLabel 로 "지난주"/"지난달"을 고릅니다. */
function formatMinutesDelta(current: number, previous: number, periodLabel: string): string | null {
  const diff = current - previous
  if (diff === 0) return null
  const arrow = diff > 0 ? '↑' : '↓'
  return `${periodLabel}보다 ${formatMinutes(Math.abs(diff))} ${arrow}`
}

/** "지난주보다 8%p ↑" 처럼 달성률 차이를 보여줍니다. */
function formatRateDelta(current: number, previous: number, periodLabel: string): string | null {
  const diff = current - previous
  if (diff === 0) return null
  const arrow = diff > 0 ? '↑' : '↓'
  return `${periodLabel}보다 ${Math.abs(diff)}%p ${arrow}`
}

/** "지난주보다 25분 빨라짐" 처럼 시작 시각 차이를 보여줍니다. 둘 중 하나라도 기록이 없으면 비교하지 않습니다. */
function formatStartDelta(
  current: number | null,
  previous: number | null,
  periodLabel: string,
): string | null {
  if (current === null || previous === null) return null
  const diff = current - previous
  if (diff === 0) return null
  return `${periodLabel}보다 ${Math.abs(diff)}분 ${diff < 0 ? '빨라짐' : '느려짐'}`
}

/** 계획·공부 기록을 통틀어 가장 이른 날짜부터 todayKey 까지 며칠째인지 셉니다. 기록이 없으면 0. */
function countRecordDays(plans: StudyPlan[], sessions: StudySession[], todayKey: string): number {
  const recordDates = [
    ...plans.map((plan) => plan.date),
    ...sessions.map((session) => toDateKey(new Date(session.startedAt))),
  ]
  if (recordDates.length === 0) return 0
  const firstRecordKey = [...recordDates].sort()[0]
  return countDays(firstRecordKey, todayKey)
}

export function ReportPage() {
  const [view, setView] = useState<'weekly' | 'monthly'>('weekly')

  const { allPlans } = usePlans()
  // 타이머가 저장해 둔 공부 기록을 불러옵니다. 없으면 가짜 데이터를 씁니다. (#20 이 아직 머지 전입니다)
  const [sessions] = useState<StudySession[]>(() => loadData('sessions', mockSessions))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to="/records" className="text-sm text-slate-500 hover:text-slate-700">
          ‹ 기록
        </Link>

        {/* 주간 / 월간 탭. 같은 /report 주소에서 바꿔 봅니다. (#86) */}
        <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            aria-pressed={view === 'weekly'}
            onClick={() => setView('weekly')}
            className={cn(
              'h-9 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors',
              view === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            주간
          </button>
          <button
            type="button"
            aria-pressed={view === 'monthly'}
            onClick={() => setView('monthly')}
            className={cn(
              'h-9 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors',
              view === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            월간
          </button>
        </div>
      </div>

      {view === 'weekly' ? (
        <WeeklyReport allPlans={allPlans} sessions={sessions} />
      ) : (
        <MonthlyReport allPlans={allPlans} sessions={sessions} />
      )}
    </div>
  )
}

interface ReportSectionProps {
  allPlans: StudyPlan[]
  sessions: StudySession[]
}

/** 주간 리포트 (#72) */
function WeeklyReport({ allPlans, sessions }: ReportSectionProps) {
  // 0 = 이번 주, 1 = 지난 주, 2 = 지지난 주 ...
  const [weeksAgo, setWeeksAgo] = useState(0)

  const mondayKey = getMondayKey(weeksAgo)
  const previousMondayKey = getMondayKey(weeksAgo + 1)

  const thisWeek = getWeekStats(mondayKey, allPlans, sessions)
  const previousWeek = getWeekStats(previousMondayKey, allPlans, sessions)

  // 계획도 공부 기록도 하나 없는 주는 "기록 없음" 안내로 바꿉니다.
  const hasRecord = thisWeek.targetMinutes > 0 || thisWeek.studyMinutes > 0

  // 첫 기록 날짜 = 계획과 공부 기록을 통틀어 가장 이른 날짜. 기록이 하나도 없으면 null 입니다.
  const recordDates = [
    ...allPlans.map((plan) => plan.date),
    ...sessions.map((session) => toDateKey(new Date(session.startedAt))),
  ]
  const firstRecordKey = recordDates.length === 0 ? null : [...recordDates].sort()[0]
  const daysSinceFirstRecord =
    firstRecordKey === null ? 0 : countDays(firstRecordKey, toDateKey(new Date()))
  // 이번 주를 보는 중이고, 아직 14일치 기록이 안 쌓였으면 리포트 대신 카운트다운을 보여줍니다.
  // (예전 주로 넘겨 보는 중이면 그 주의 기록을 그대로 보여줍니다)
  const isBeforeFirstReport =
    weeksAgo === 0 && firstRecordKey !== null && daysSinceFirstRecord < FIRST_REPORT_DAYS

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">주간 리포트</h1>
          <p className="mt-1 text-slate-600">
            {formatShortDate(mondayKey)} ~ {formatShortDate(moveDateKey(mondayKey, 6))}
          </p>
        </div>

        <div className="flex gap-1">
          <Button
            variant="secondary"
            aria-label="지난 주로 이동"
            className="w-10 shrink-0 px-0"
            onClick={() => setWeeksAgo((prev) => prev + 1)}
          >
            ‹
          </Button>
          <Button
            variant="secondary"
            aria-label="다음 주로 이동"
            disabled={weeksAgo === 0}
            className="w-10 shrink-0 px-0"
            onClick={() => setWeeksAgo((prev) => Math.max(0, prev - 1))}
          >
            ›
          </Button>
        </div>
      </div>

      {isBeforeFirstReport ? (
        <Card>
          <p className="text-sm text-slate-600">
            아직 기록이 {FIRST_REPORT_DAYS}일이 안 돼서, 리포트 대신 카운트다운을 보여줘요.
          </p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-lg font-semibold text-slate-900">
              첫 리포트까지 D-{FIRST_REPORT_DAYS - daysSinceFirstRecord}
            </p>
            <p className="shrink-0 text-sm text-slate-500">
              {daysSinceFirstRecord} / {FIRST_REPORT_DAYS}일
            </p>
          </div>
          <ProgressBar value={(daysSinceFirstRecord / FIRST_REPORT_DAYS) * 100} className="mt-2" />
        </Card>
      ) : !hasRecord ? (
        <Card>
          <p className="py-6 text-center text-sm text-slate-500">
            이 주는 계획도 공부 기록도 없어요.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-slate-500">순공시간</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {formatMinutes(thisWeek.studyMinutes)}
              </p>
              {formatMinutesDelta(thisWeek.studyMinutes, previousWeek.studyMinutes, '지난주') && (
                <p className="text-brand mt-1 text-sm font-medium">
                  {formatMinutesDelta(thisWeek.studyMinutes, previousWeek.studyMinutes, '지난주')}
                </p>
              )}
            </Card>

            <Card>
              <p className="text-sm text-slate-500">계획 달성률</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{thisWeek.achievementRate}%</p>
              {formatRateDelta(
                thisWeek.achievementRate,
                previousWeek.achievementRate,
                '지난주',
              ) && (
                <p className="text-brand mt-1 text-sm font-medium">
                  {formatRateDelta(
                    thisWeek.achievementRate,
                    previousWeek.achievementRate,
                    '지난주',
                  )}
                </p>
              )}
            </Card>

            <Card>
              <p className="text-sm text-slate-500">첫 시작 평균</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {formatStartTime(thisWeek.averageStartMinutes)}
              </p>
              {formatStartDelta(
                thisWeek.averageStartMinutes,
                previousWeek.averageStartMinutes,
                '지난주',
              ) && (
                <p className="text-brand mt-1 text-sm font-medium">
                  {formatStartDelta(
                    thisWeek.averageStartMinutes,
                    previousWeek.averageStartMinutes,
                    '지난주',
                  )}
                </p>
              )}
            </Card>
          </div>

          <section>
            <h2 className="text-lg font-bold text-slate-900">이번 주 발견</h2>
            {mockInsights.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                아직 데이터가 모자라요. 기록이 쌓이면 발견이 생겨요.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {mockInsights.slice(0, 2).map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* 지난 실험 결과(#93) · 도전 중인 실험(#65)이 아직 없어서 자리만 만들어 둡니다. */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">실험</h2>
        <p className="mt-2 text-sm text-slate-500">
          지난 실험 결과와 도전 중인 실험은 #65·#93 이 끝나면 여기 보여요.
        </p>
      </section>

      {/* 새 개선안 고르기(#64)가 아직 없어서 자리만 만들어 둡니다. */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">다음 주 개선안</h2>
        <p className="mt-2 text-sm text-slate-500">새 개선안 고르기는 #64 가 끝나면 여기 보여요.</p>
      </section>

      {/* 주간 회고 (#82). 위에서 고른 주의 회고를 보여줍니다. ‹ › 로 지난 주를 고르면 지난 회고를 다시 볼 수 있습니다. */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">주간 회고</h2>
        <p className="mt-1 text-sm text-slate-500">3문항이면 끝나. 쓰기 싫은 주는 건너뛰어도 돼.</p>
        {/* key 가 주마다 달라서, 주를 바꾸면 입력하던 내용이 그 주의 회고로 새로 채워집니다. */}
        <WeeklyReviewCard key={mondayKey} weekStart={mondayKey} />
      </section>
    </>
  )
}

/** 월간 리포트 (#86). 4주를 한 달로 봅니다 (예: 9/8~10/5 · 4주). */
function MonthlyReport({ allPlans, sessions }: ReportSectionProps) {
  // 0 = 가장 최근 4주, 1 = 그 전 4주 ...
  const [monthWeeksAgo, setMonthWeeksAgo] = useState(0)

  const todayKey = toDateKey(new Date())
  const recordDays = countRecordDays(allPlans, sessions, todayKey)

  if (recordDays < MIN_DAYS_FOR_MONTHLY) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-slate-500">
          월간 리포트는 6주차부터 볼 수 있어요.
        </p>
      </Card>
    )
  }

  // 이번 블록의 가장 최근 주(월요일)부터, 4주 전 주(월요일)까지.
  const latestMondayKey = getMondayKey(monthWeeksAgo * 4)
  const earliestMondayKey = getMondayKey(monthWeeksAgo * 4 + 3)
  const blockEndKey = moveDateKey(latestMondayKey, 6)

  const thisMonth = getRangeStats(earliestMondayKey, 28, allPlans, sessions)
  const previousMonthStart = getMondayKey(monthWeeksAgo * 4 + 7)
  const previousMonth = getRangeStats(previousMonthStart, 28, allPlans, sessions)

  // 1주(가장 오래된 주) ~ 4주(가장 최근 주) 순서로 보여줍니다.
  const weekBlocks = [1, 2, 3, 4].map((weekIndex) => {
    const weeksAgoForThisWeek = monthWeeksAgo * 4 + (4 - weekIndex)
    const weekStats = getWeekStats(getMondayKey(weeksAgoForThisWeek), allPlans, sessions)
    return { weekIndex, studyMinutes: weekStats.studyMinutes }
  })
  const maxWeekMinutes = Math.max(1, ...weekBlocks.map((week) => week.studyMinutes))

  // 월 이름은 이 4주가 끝나는 날(가장 최근 주의 일요일) 기준입니다.
  const [, blockEndMonth] = blockEndKey.split('-').map(Number)

  // 예상 성장 곡선(#71). "지금까지 전체" 기준이라 보고 있는 4주 구간과 상관없이 항상 같은 값입니다.
  // D-day 와 시험 이름은 온보딩(#58)에서 받습니다. 온보딩을 아직 안 했으면 둘 다 빈 글자입니다.
  const onboardingAnswers = loadData<Record<string, string>>('onboarding-answers', {})
  const examDateKey = onboardingAnswers.targetExamDate || null
  const examLabel = onboardingAnswers.targetExam || '시험일'
  const growthCurve =
    examDateKey === null ? null : getGrowthCurve(allPlans, sessions, todayKey, examDateKey)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {blockEndMonth}월 리포트
          </h1>
          <p className="mt-1 text-slate-600">
            {formatMonthDay(earliestMondayKey)} ~ {formatMonthDay(blockEndKey)} · 4주
          </p>
        </div>

        <div className="flex gap-1">
          <Button
            variant="secondary"
            aria-label="지난달로 이동"
            className="w-10 shrink-0 px-0"
            onClick={() => setMonthWeeksAgo((prev) => prev + 4)}
          >
            ‹
          </Button>
          <Button
            variant="secondary"
            aria-label="다음달로 이동"
            disabled={monthWeeksAgo === 0}
            className="w-10 shrink-0 px-0"
            onClick={() => setMonthWeeksAgo((prev) => Math.max(0, prev - 4))}
          >
            ›
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">이번 달 순공</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatMinutes(thisMonth.studyMinutes)}
          </p>
          {formatMinutesDelta(thisMonth.studyMinutes, previousMonth.studyMinutes, '지난달') && (
            <p className="text-brand mt-1 text-sm font-medium">
              {formatMinutesDelta(thisMonth.studyMinutes, previousMonth.studyMinutes, '지난달')}
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm text-slate-500">평균 달성률</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{thisMonth.achievementRate}%</p>
          {formatRateDelta(thisMonth.achievementRate, previousMonth.achievementRate, '지난달') && (
            <p className="text-brand mt-1 text-sm font-medium">
              {formatRateDelta(thisMonth.achievementRate, previousMonth.achievementRate, '지난달')}
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm text-slate-500">평균 첫 시작</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {formatStartTime(thisMonth.averageStartMinutes)}
          </p>
          {formatStartDelta(
            thisMonth.averageStartMinutes,
            previousMonth.averageStartMinutes,
            '지난달',
          ) && (
            <p className="text-brand mt-1 text-sm font-medium">
              {formatStartDelta(
                thisMonth.averageStartMinutes,
                previousMonth.averageStartMinutes,
                '지난달',
              )}
            </p>
          )}
        </Card>
      </div>

      <Card title="주별 순공">
        <ul className="flex flex-col gap-3">
          {weekBlocks.map((week) => (
            <li key={week.weekIndex} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-sm text-slate-500">{week.weekIndex}주</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="bg-brand h-full rounded-full"
                  // 막대 너비가 숫자(공부 시간)에 따라 계속 바뀌어서 Tailwind 클래스로 만들 수 없어 인라인 style 을 씁니다.
                  style={{ width: `${Math.round((week.studyMinutes / maxWeekMinutes) * 100)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-sm font-medium text-slate-700">
                {formatMinutes(week.studyMinutes)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <section>
        <h2 className="text-lg font-bold text-slate-900">예상 성장 곡선</h2>
        {examDateKey === null ? (
          <p className="mt-3 text-sm text-slate-500">
            온보딩에서 목표 시험 날짜를 정하면 보여드릴게요.{' '}
            <Link to="/onboarding" className="text-brand font-semibold hover:underline">
              온보딩 하러 가기
            </Link>
          </p>
        ) : !growthCurve?.hasEnoughData ? (
          <p className="mt-3 text-sm text-slate-500">기록이 더 쌓이면 보여드릴게요.</p>
        ) : (
          <Card className="mt-3">
            <GrowthCurveChart curve={growthCurve} examLabel={examLabel} />
            <p className="mt-4 text-base font-semibold text-slate-900">
              지금 페이스면 {examLabel}까지 누적{' '}
              {formatMinutes(growthCurve.currentPaceTotalMinutes)}, 하루 {EXTRA_MINUTES_PER_DAY}분
              더하면 {formatMinutes(growthCurve.withExtraTotalMinutes)}야.
            </p>
            {growthCurve.hasFourWeekComparison && (
              <p className="mt-1 text-sm text-slate-500">
                4주 전보다 하루 평균 {Math.abs(growthCurve.dailyMinutesChangeFromFourWeeksAgo)}분{' '}
                {growthCurve.dailyMinutesChangeFromFourWeeksAgo >= 0 ? '늘었어.' : '줄었어.'}
              </p>
            )}
          </Card>
        )}
      </section>

      {/* 실험 결과 판정(#93)이 아직 없어서 자리만 만들어 둡니다. */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">이번 달 판정된 실험</h2>
        <p className="mt-2 text-sm text-slate-500">실험 결과 판정은 #93 이 끝나면 여기 보여요.</p>
      </section>
    </>
  )
}

type ReviewField = 'best' | 'regret' | 'change'
type ReviewAnswers = Record<ReviewField, string>

// 회고 질문 3개. 질문을 바꾸고 싶으면 여기만 고치면 됩니다.
const reviewQuestions: { field: ReviewField; label: string; placeholder: string }[] = [
  {
    field: 'best',
    label: '① 이번 주 가장 잘한 것은?',
    placeholder: '예) 3일 연속 7시 전에 시작했다',
  },
  { field: 'regret', label: '② 가장 아쉬운 것은?', placeholder: '예) 주말에 폰을 너무 오래 봤다' },
  {
    field: 'change',
    label: '③ 다음 주에 바꿀 한 가지는?',
    placeholder: '예) 공부할 땐 폰을 다른 방에 둔다',
  },
]

const emptyAnswers: ReviewAnswers = { best: '', regret: '', change: '' }

interface WeeklyReviewCardProps {
  /** 회고를 쓸 주의 월요일 날짜 'YYYY-MM-DD' */
  weekStart: string
}

/**
 * 주간 회고 카드. 상태가 세 가지입니다.
 * - 아직 안 씀 → 입력 칸 + 저장하기 / 건너뛰기
 * - 저장함 → 쓴 답을 보여주고 "고치기"
 * - 건너뜀 → 건너뛰었다는 안내 + "지금 쓰기"
 */
function WeeklyReviewCard({ weekStart }: WeeklyReviewCardProps) {
  // 이 주에 저장된 회고. 없으면 undefined
  const [saved, setSaved] = useState<WeeklyReview | undefined>(() => findWeeklyReview(weekStart))
  // 아직 저장한 게 없으면 처음부터 입력 칸을 보여줍니다.
  const [isEditing, setIsEditing] = useState(saved === undefined)
  const [answers, setAnswers] = useState<ReviewAnswers>(() =>
    saved && !saved.skipped
      ? { best: saved.best, regret: saved.regret, change: saved.change }
      : emptyAnswers,
  )

  // 세 칸이 모두 비어 있으면 저장할 게 없어서 저장 버튼을 막습니다. (안 쓸 거면 건너뛰기)
  const hasAnyAnswer = Object.values(answers).some((answer) => answer.trim() !== '')

  /** 회고를 저장하고 화면을 "저장함/건너뜀" 모습으로 바꿉니다. */
  function save(nextAnswers: ReviewAnswers, skipped: boolean) {
    const review: WeeklyReview = { weekStart, ...nextAnswers, skipped, savedAt: Date.now() }
    saveWeeklyReview(review)
    // 저장 함수가 다듬은 값(앞뒤 공백 제거 등)을 그대로 보여주려고 다시 읽습니다.
    setSaved(findWeeklyReview(weekStart))
    setIsEditing(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 의 기본 동작(페이지 새로고침)을 막습니다.
    event.preventDefault()
    if (!hasAnyAnswer) return
    save(answers, false)
  }

  function handleSkip() {
    save(emptyAnswers, true)
    setAnswers(emptyAnswers)
  }

  function handleEdit() {
    setIsEditing(true)
  }

  function handleCancel() {
    // 고치던 내용을 버리고 저장된 답으로 되돌립니다.
    if (saved && !saved.skipped) {
      setAnswers({ best: saved.best, regret: saved.regret, change: saved.change })
    } else {
      setAnswers(emptyAnswers)
    }
    setIsEditing(false)
  }

  if (!isEditing && saved?.skipped) {
    return (
      <Card className="mt-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">이 주는 회고를 건너뛰었어요.</p>
          <Button variant="secondary" onClick={handleEdit} className="self-start sm:self-auto">
            지금 쓰기
          </Button>
        </div>
      </Card>
    )
  }

  if (!isEditing && saved) {
    return (
      <Card className="mt-3">
        <dl className="flex flex-col gap-4">
          {reviewQuestions.map((question) => (
            <div key={question.field}>
              <dt className="text-sm font-semibold text-slate-900">{question.label}</dt>
              <dd
                className={cn(
                  'mt-1 text-sm break-words',
                  saved[question.field] ? 'text-slate-700' : 'text-slate-400',
                )}
              >
                {saved[question.field] || '안 썼어요'}
              </dd>
            </div>
          ))}
        </dl>
        <Button variant="secondary" onClick={handleEdit} className="mt-4">
          고치기
        </Button>
      </Card>
    )
  }

  return (
    <Card className="mt-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {reviewQuestions.map((question) => (
          <div key={question.field} className="flex flex-col gap-1">
            <Input
              id={`review-${question.field}`}
              label={question.label}
              placeholder={question.placeholder}
              maxLength={REVIEW_MAX_LENGTH}
              value={answers[question.field]}
              onChange={(event) =>
                setAnswers((prev) => ({ ...prev, [question.field]: event.target.value }))
              }
            />
            <p className="text-right text-xs text-slate-400 tabular-nums">
              {answers[question.field].length} / {REVIEW_MAX_LENGTH}
            </p>
          </div>
        ))}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {/* 이미 저장한 회고를 고치는 중이면 "취소", 처음 쓰는 중이면 "건너뛰기" 를 보여줍니다. */}
          {saved ? (
            <Button variant="ghost" onClick={handleCancel}>
              취소
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleSkip}>
              건너뛰기
            </Button>
          )}
          <Button type="submit" disabled={!hasAnyAnswer}>
            저장하기
          </Button>
        </div>
      </form>
    </Card>
  )
}
