import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { GrowthCurveChart } from '@/components/ui/GrowthCurveChart'
import { InsightCard } from '@/components/ui/InsightCard'
import { usePlans } from '@/hooks/usePlans'
import { getDaySummary } from '@/lib/daySummary'
import { EXTRA_MINUTES_PER_DAY, getGrowthCurve } from '@/lib/growthCurve'
import { mockInsights, mockSessions } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import type { StudyPlan, StudySession } from '@/types'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토']

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

interface WeekStats {
  /** 한 주 순공시간 합계(분) */
  studyMinutes: number
  /** 한 주 계획 목표 시간 합계(분). 달성률을 "합계 ÷ 합계" 로 구하려고 따로 들고 있습니다. */
  targetMinutes: number
  /** 한 주 계획 달성률 (0 ~ 100). 계획이 하나도 없으면 0 */
  achievementRate: number
  /** 공부를 시작한 날들의, 자정부터 몇 분 지나서 시작했는지 평균. 기록이 없으면 null */
  averageStartMinutes: number | null
}

/** 월요일 날짜(mondayKey)부터 7일치를 getDaySummary 로 더해서 한 주 통계를 만듭니다. */
function getWeekStats(mondayKey: string, plans: StudyPlan[], sessions: StudySession[]): WeekStats {
  let studyMinutes = 0
  let targetMinutes = 0
  const startMinutesList: number[] = []

  for (let i = 0; i < 7; i++) {
    const dateKey = moveDateKey(mondayKey, i)
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

/** "지난주보다 2시간 10분 ↑" 처럼 차이를 보여줍니다. 지난주 기록이 없으면 비교하지 않습니다. */
function formatMinutesDelta(current: number, previous: number): string | null {
  const diff = current - previous
  if (diff === 0) return null
  const arrow = diff > 0 ? '↑' : '↓'
  return `지난주보다 ${formatMinutes(Math.abs(diff))} ${arrow}`
}

/** "지난주보다 8%p ↑" 처럼 달성률 차이를 보여줍니다. */
function formatRateDelta(current: number, previous: number): string | null {
  const diff = current - previous
  if (diff === 0) return null
  const arrow = diff > 0 ? '↑' : '↓'
  return `지난주보다 ${Math.abs(diff)}%p ${arrow}`
}

/** "지난주보다 25분 빨라짐" 처럼 시작 시각 차이를 보여줍니다. 둘 중 하나라도 기록이 없으면 비교하지 않습니다. */
function formatStartDelta(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) return null
  const diff = current - previous
  if (diff === 0) return null
  return `지난주보다 ${Math.abs(diff)}분 ${diff < 0 ? '빨라짐' : '느려짐'}`
}

export function ReportPage() {
  // 0 = 이번 주, 1 = 지난 주, 2 = 지지난 주 ...
  const [weeksAgo, setWeeksAgo] = useState(0)

  const { allPlans } = usePlans()
  // 타이머가 저장해 둔 공부 기록을 불러옵니다. 없으면 가짜 데이터를 씁니다. (#20 이 아직 머지 전입니다)
  const [sessions] = useState<StudySession[]>(() => loadData('sessions', mockSessions))

  const mondayKey = getMondayKey(weeksAgo)
  const previousMondayKey = getMondayKey(weeksAgo + 1)

  const thisWeek = getWeekStats(mondayKey, allPlans, sessions)
  const previousWeek = getWeekStats(previousMondayKey, allPlans, sessions)

  // 계획도 공부 기록도 하나 없는 주는 "기록 없음" 안내로 바꿉니다.
  const hasRecord = thisWeek.targetMinutes > 0 || thisWeek.studyMinutes > 0

  // 예상 성장 곡선(#71). 보고 있는 주와 상관없이 항상 "지금까지 전체"를 기준으로 계산합니다.
  // D-day 와 시험 이름은 온보딩(#58)에서 받습니다. 온보딩을 아직 안 했으면 둘 다 빈 글자입니다.
  const onboardingAnswers = loadData<Record<string, string>>('onboarding-answers', {})
  const examDateKey = onboardingAnswers.targetExamDate || null
  const examLabel = onboardingAnswers.targetExam || '시험일'
  const growthCurve =
    examDateKey === null
      ? null
      : getGrowthCurve(allPlans, sessions, toDateKey(new Date()), examDateKey)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to="/records" className="text-sm text-slate-500 hover:text-slate-700">
          ‹ 기록
        </Link>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
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
      </div>

      {!hasRecord ? (
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
              {formatMinutesDelta(thisWeek.studyMinutes, previousWeek.studyMinutes) && (
                <p className="text-brand mt-1 text-sm font-medium">
                  {formatMinutesDelta(thisWeek.studyMinutes, previousWeek.studyMinutes)}
                </p>
              )}
            </Card>

            <Card>
              <p className="text-sm text-slate-500">계획 달성률</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{thisWeek.achievementRate}%</p>
              {formatRateDelta(thisWeek.achievementRate, previousWeek.achievementRate) && (
                <p className="text-brand mt-1 text-sm font-medium">
                  {formatRateDelta(thisWeek.achievementRate, previousWeek.achievementRate)}
                </p>
              )}
            </Card>

            <Card>
              <p className="text-sm text-slate-500">첫 시작 평균</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {formatStartTime(thisWeek.averageStartMinutes)}
              </p>
              {formatStartDelta(thisWeek.averageStartMinutes, previousWeek.averageStartMinutes) && (
                <p className="text-brand mt-1 text-sm font-medium">
                  {formatStartDelta(thisWeek.averageStartMinutes, previousWeek.averageStartMinutes)}
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

      {/* 원래 월간 리포트(#86)에 들어갈 내용인데, #86 이 아직 없어서 주간 리포트에 임시로 둡니다. */}
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
    </div>
  )
}
