import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CareModeBanner } from '@/components/ui/CareModeBanner'
import { ExperimentSection } from '@/components/ui/ExperimentSection'
import { InsightCard } from '@/components/ui/InsightCard'
import { PlayBadge } from '@/components/ui/PlayBadge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SubjectBadge } from '@/components/ui/SubjectBadge'
import { usePlans } from '@/hooks/usePlans'
import { useStopwatch } from '@/hooks/useStopwatch'
import { cn } from '@/lib/cn'
import { DEFAULT_TARGET_MINUTES, normalizeTargetMinutes } from '@/lib/countdown'
import { groupSessionsByDate, loadAllSessions, loadStudySessions } from '@/lib/dailyRecords'
import { getDaySummary } from '@/lib/daySummary'
import { formatDday } from '@/lib/exams'
import { getFirstMe, type FirstMe } from '@/lib/firstMe'
import { getInsightsToShow } from '@/lib/insights'
import { getCareLimits } from '@/lib/careLimits'
import { mockSubjects } from '@/lib/mock'
import { getDayProgress, getPlanProgress } from '@/lib/planProgress'
import { loadData } from '@/lib/storage'
import { sortPlansForNow } from '@/lib/timeline'
import { getTimerDisplay, loadTimerMode } from '@/lib/timerDisplay'
import { getTodayCareLevel, getTodayCareReason } from '@/lib/todayCare'
import { getTreeState, type TreeState } from '@/lib/tree'
import type { StudyPlan, StudySession, Subject } from '@/types'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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

/** 분을 "3시간 10분" 처럼 보여줍니다. 60분 미만이면 "분"만 보여줍니다. */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** 공부 기록으로 지금 나무 상태를 계산합니다. */
function calculateTree(): TreeState {
  const days = groupSessionsByDate(loadStudySessions())
  const totalStudyMinutes = days.reduce((sum, day) => sum + day.totalMinutes, 0)
  const today = days.find((day) => day.date === toDateKey(new Date()))

  return getTreeState({
    totalStudyMinutes,
    todayStudyMinutes: today?.totalMinutes ?? 0,
    careLevel: getTodayCareLevel(),
    // TODO(#82 #73 #87): 회고·인사이트·나 사용설명서가 아직 없어서 0 입니다. 생기면 실제 개수로 바꾸세요.
    reflectionCount: 0,
    insightCount: 0,
    manualItemCount: 0,
  })
}

/** 오늘 날짜를 '10월 10일 토요일' 처럼 보여줍니다. */
function formatToday(date: Date): string {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })
}

// Link(주소로 이동하는 글자)를 버튼처럼 보이게 하는 클래스입니다.
// Button 은 <button> 이라서, 다른 화면으로 가는 곳에는 Link 에 이 클래스를 붙여 씁니다.
// h-12 / h-10: 손가락으로 누르기 쉽게 높이를 40px 이상으로 둡니다.
const bigLinkClass =
  'bg-brand hover:bg-brand-dark flex h-12 w-full items-center justify-center rounded-lg text-base font-semibold text-white transition-colors'
const textLinkClass =
  'text-brand inline-flex h-10 items-center text-sm font-medium underline underline-offset-4'

export function HomePage() {
  const navigate = useNavigate()
  const [tree] = useState(calculateTree)
  // 오늘의 관리 강도와, 내가 정한 최대 한도입니다. 화면이 처음 그려질 때 한 번만 읽습니다. (#94)
  const [careLevel] = useState(getTodayCareLevel)
  const [maxCareLevel] = useState(() => getCareLimits().maxCareLevel)

  const { allPlans, getPlans } = usePlans()
  // 타이머가 저장해 둔 공부 기록을 불러옵니다. 없으면 빈 목록입니다. (예시 숫자를 보여주지 않습니다)
  const [sessions] = useState<StudySession[]>(loadStudySessions)
  // 노는 기록까지 들어 있는 전체 기록입니다. 계획별 실제 시간(`12 / 50분`)은 노는 계획에도 보여야 해서 따로 읽습니다. (#238)
  const [allSessions] = useState<StudySession[]>(loadAllSessions)
  // 계획 화면에서 저장한 과목 목록입니다. 과목 태그의 이름과 색을 찾는 데 씁니다.
  const [subjects] = useState<Subject[]>(() => loadData('subjects', mockSubjects))
  // 온보딩에서 내가 적은 시험 날짜와 공부하는 이유입니다. (lib/firstMe.ts)
  const [firstMe] = useState(() =>
    getFirstMe(loadData<unknown>('onboarding-answers', null), new Date()),
  )
  // 인사이트는 가상 데이터를 넣었을 때만 예시로 보여줍니다. (lib/insights.ts)
  const { insights, isExample: isExampleInsight } = getInsightsToShow(sessions)

  const todayKey = toDateKey(new Date())
  const yesterdayKey = moveDateKey(todayKey, -1)

  // 오늘 계획과, 그중 아직 안 끝난 것입니다. 안 끝난 것의 맨 앞이 "지금 할 일" 입니다.
  const todayPlans = getPlans(todayKey)
  // 시작 시각이 된 계획 → 시각을 안 정한 계획 → 아직 시각이 안 된 계획 순서로 줄 세웁니다. (lib/timeline.ts)
  const now = new Date()
  const undonePlans = sortPlansForNow(
    todayPlans.filter((plan) => !plan.done),
    now.getHours() * 60 + now.getMinutes(),
  )

  // 첫 기록 날짜 = 계획과 공부 기록을 통틀어 가장 이른 날짜. 기록이 하나도 없으면 null 입니다.
  const recordDates = [
    ...allPlans.map((plan) => plan.date),
    ...sessions.map((session) => toDateKey(new Date(session.startedAt))),
  ]
  const firstRecordKey = recordDates.length === 0 ? null : [...recordDates].sort()[0]
  const daysSinceFirstRecord = firstRecordKey === null ? 0 : countDays(firstRecordKey, todayKey)
  const isFirstReportReady = firstRecordKey !== null && daysSinceFirstRecord >= FIRST_REPORT_DAYS

  const yesterdaySummary = getDaySummary(yesterdayKey, allPlans, sessions)
  const hasYesterdayRecord = yesterdaySummary.studyMinutes > 0

  return (
    <div className="flex flex-col gap-8">
      <section className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">
            {formatToday(new Date())}
            {firstMe.daysUntilExam !== null &&
              ` · ${firstMe.examName} ${formatDday(firstMe.daysUntilExam)}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            오늘도 같이 시작해 볼까?
          </h1>
        </div>
        {/* 체크인은 꼭 해야 하는 일이 아니라서, 큰 카드 대신 작은 글자로 둡니다. (#243) */}
        <Link to="/check" className={cn(textLinkClass, 'shrink-0 whitespace-nowrap')}>
          자세히 체크인
        </Link>
      </section>

      {/* 열자마자 공부를 시작할 수 있게 "지금 할 일" 을 맨 위에 둡니다. PC 에서는 "처음의 나" 와 나란히 놓입니다. (#243) */}
      {/* sm:items-start: 두 카드의 높이를 억지로 맞추지 않고 내용만큼만 차지하게 합니다. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        <NowCard
          undonePlans={undonePlans}
          hasPlansToday={todayPlans.length > 0}
          allPlans={allPlans}
          subjects={subjects}
          sessions={allSessions}
        />
        <FirstMeCard firstMe={firstMe} />
      </section>

      {/* 지금 관리 모드와 그 이유 (#94) */}
      <CareModeBanner
        level={careLevel}
        reason={getTodayCareReason(careLevel)}
        maxLevel={maxCareLevel}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        <TodayCard plans={todayPlans} subjects={subjects} sessions={allSessions} />

        <Card title="어제 한 줄">
          {hasYesterdayRecord ? (
            <p className="text-base font-semibold text-slate-900">
              어제 순공 {formatMinutes(yesterdaySummary.studyMinutes)}, 계획의{' '}
              {yesterdaySummary.achievementRate}%야.
            </p>
          ) : (
            <p className="text-base font-semibold text-slate-900">오늘부터 시작해 볼까?</p>
          )}

          {/* 첫 리포트(14일)까지 남은 날. 시안처럼 어제 한 줄 아래에 선을 긋고 같은 카드에 둡니다. (#85) */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            {firstRecordKey === null ? (
              <p className="text-sm text-slate-500">
                기록을 시작하면 첫 리포트까지 며칠 남았는지 세어줄게요.
              </p>
            ) : isFirstReportReady ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-slate-600">
                  {FIRST_REPORT_DAYS}일치 기록이 다 쌓였어요!
                </p>
                <Button onClick={() => navigate('/report')}>첫 리포트 보기</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-semibold text-slate-900">
                    첫 리포트까지 D-{FIRST_REPORT_DAYS - daysSinceFirstRecord}
                  </p>
                  <p className="shrink-0 text-sm text-slate-500">
                    {daysSinceFirstRecord} / {FIRST_REPORT_DAYS}일
                  </p>
                </div>
                <ProgressBar value={(daysSinceFirstRecord / FIRST_REPORT_DAYS) * 100} />
                <p className="text-sm text-slate-500">
                  {FIRST_REPORT_DAYS}일 동안 기록이 쌓이면 나만의 패턴을 알려줄게.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* 내 나무 (#68) */}
        <TreeCard tree={tree} />
      </section>

      {/* 이번 주 발견 (#73) */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">이번 주 발견</h2>
        {insights.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            아직 데이터가 모자라요. 기록이 쌓이면 발견이 생겨요.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                sessions={sessions}
                isExample={isExampleInsight}
              />
            ))}
          </div>
        )}
      </section>

      {/* 도전 중인 실험의 진행 상황과, 끝난 실험의 결과·다음 행동 버튼 (#93) */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">실험</h2>
        <ExperimentSection plans={allPlans} sessions={sessions} className="mt-3" />
      </section>
    </div>
  )
}

interface NowCardProps {
  /** 오늘의 안 끝난 계획. 맨 앞이 "지금 할 일" 입니다 */
  undonePlans: StudyPlan[]
  /** 오늘 계획이 하나라도 있는지. (없으면 "계획 세우기", 다 끝냈으면 "다 끝냈어요" 를 보여줍니다) */
  hasPlansToday: boolean
  /** 모든 날짜의 계획. 타이머가 재고 있는 계획을 id 로 찾는 데 씁니다 */
  allPlans: StudyPlan[]
  subjects: Subject[]
  /** 계획별 실제 시간을 구할 기록. 노는 기록까지 들어 있어야 합니다 */
  sessions: StudySession[]
}

/**
 * "지금 할 일" 카드. 홈을 열자마자 한 번 눌러서 공부를 시작하게 해 줍니다. (#243)
 * 타이머가 이미 돌고 있으면 같은 자리에 진행 중인 타이머를 보여줍니다.
 *
 * 스톱워치는 흐르는 동안 1초에 몇 번씩 화면을 다시 그립니다.
 * 홈 전체가 아니라 이 카드만 다시 그려지도록, useStopwatch 를 이 카드 안에서 부릅니다.
 */
function NowCard({ undonePlans, hasPlansToday, allPlans, subjects, sessions }: NowCardProps) {
  const { seconds, isStarted, isRunning } = useStopwatch()
  // 타이머 화면이 저장해 둔 값들입니다. 홈에서는 바꾸지 않고 읽기만 합니다.
  const [mode] = useState(loadTimerMode)
  const [targetMinutes] = useState(() =>
    normalizeTargetMinutes(loadData<unknown>('timer-target', DEFAULT_TARGET_MINUTES)),
  )
  const [timerPlanId] = useState(() => loadData<string | null>('timer-plan', null))
  const [timerSubjectId] = useState(() => loadData<string | null>('timer-subject', null))

  // ① 타이머가 이미 돌고 있을 때 (일시정지 중이어도 여기로 옵니다)
  if (isStarted) {
    const display = getTimerDisplay(mode, seconds, targetMinutes)
    const timerPlan = allPlans.find((plan) => plan.id === timerPlanId)
    const timerSubject = subjects.find((subject) => subject.id === timerSubjectId)

    return (
      <Card className="border-brand border-2">
        <h3 className="text-sm font-medium text-slate-500">
          {isRunning ? '타이머 진행 중' : '타이머 일시정지 중'}
        </h3>
        <div className="mt-2 flex items-center gap-2">
          {timerSubject && (
            <SubjectBadge
              name={timerSubject.name}
              color={timerSubject.color}
              className="shrink-0"
            />
          )}
          {timerPlan?.kind === 'play' && <PlayBadge className="shrink-0" />}
          <p className="min-w-0 text-lg font-semibold break-words text-slate-900">
            {timerPlan ? timerPlan.content : '계획 없이 공부'}
          </p>
        </div>
        {/* tabular-nums: 숫자 폭을 똑같이 맞춰서, 초가 바뀔 때 글자가 좌우로 흔들리지 않게 합니다. */}
        <p className="mt-3 text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
          {display.timeText}
        </p>
        <p className="mt-1 text-sm text-slate-500">{display.label}</p>
        <Link to="/timer" className={cn(bigLinkClass, 'mt-4')}>
          타이머로 가기
        </Link>
      </Card>
    )
  }

  // ② 오늘 할 계획이 남아 있을 때
  const nextPlan = undonePlans[0]
  if (nextPlan) {
    const subject = subjects.find((item) => item.id === nextPlan.subjectId)
    const progress = getPlanProgress(nextPlan, sessions)
    // 그다음에 할 계획은 2개까지만 미리 보여줍니다.
    const laterPlans = undonePlans.slice(1, 3)

    return (
      <Card className="border-brand border-2">
        <h3 className="text-sm font-medium text-slate-500">지금 할 일</h3>
        <div className="mt-2 flex items-center gap-2">
          {subject && (
            <SubjectBadge name={subject.name} color={subject.color} className="shrink-0" />
          )}
          {/* 노는 계획은 과목 대신 회색 "놀기" 태그를 보여줍니다. (#238) */}
          {nextPlan.kind === 'play' && <PlayBadge className="shrink-0" />}
          <p className="min-w-0 text-lg font-semibold break-words text-slate-900">
            {nextPlan.content}
          </p>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {nextPlan.startTime && `${nextPlan.startTime} · `}
          목표 {nextPlan.targetMinutes}분
          {progress.actualMinutes > 0 && ` · 지금까지 ${progress.actualMinutes}분 했어요`}
        </p>
        {/* 주소에 ?plan=계획id 를 붙여 보내면 타이머 화면이 그 계획으로 바로 시작합니다. (#232) */}
        <Link to={`/timer?plan=${nextPlan.id}`} className={cn(bigLinkClass, 'mt-4')}>
          ▶ {progress.actualMinutes > 0 ? '이어서 하기' : '시작'}
        </Link>
        {laterPlans.length > 0 && (
          <p className="mt-3 text-sm break-words text-slate-500">
            다음: {laterPlans.map((plan) => `${plan.content} ${plan.targetMinutes}분`).join(' · ')}
          </p>
        )}
      </Card>
    )
  }

  // ③ 오늘 계획이 없거나, 다 끝냈을 때
  return (
    <Card className="border-brand border-2">
      <h3 className="text-sm font-medium text-slate-500">지금 할 일</h3>
      <p className="mt-2 text-lg font-semibold text-slate-900">
        {hasPlansToday ? '오늘 계획을 다 끝냈어요!' : '오늘 계획이 아직 없어요.'}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {hasPlansToday
          ? '더 하고 싶으면 계획을 하나 더 세워 보세요.'
          : '할 일을 하나만 정해도 여기서 바로 시작할 수 있어요.'}
      </p>
      <Link to="/planner" className={cn(bigLinkClass, 'mt-4')}>
        {hasPlansToday ? '계획 더 세우기' : '오늘 계획 세우기'}
      </Link>
      <Link to="/timer" className={cn(textLinkClass, 'mt-1')}>
        계획 없이 바로 시작
      </Link>
    </Card>
  )
}

interface FirstMeCardProps {
  firstMe: FirstMe
}

/**
 * "처음의 나" 카드. 온보딩에서 내가 직접 적은 시험 날짜와 공부하는 이유를 다시 보여줍니다. (#243)
 * 처음의 마음은 시간이 지나면 흐려지기 때문에, 가장 잘 보이는 홈 위쪽에 둡니다.
 */
function FirstMeCard({ firstMe }: FirstMeCardProps) {
  const hasReason = firstMe.reason !== ''
  const isEmpty = firstMe.daysUntilExam === null && !hasReason

  return (
    <Card>
      <h3 className="text-sm font-medium text-slate-500">처음의 나</h3>

      {firstMe.daysUntilExam !== null && (
        <p className="mt-2 text-2xl font-bold break-words text-slate-900">
          {firstMe.examName} {formatDday(firstMe.daysUntilExam)}
        </p>
      )}

      {hasReason && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <p className="text-base font-semibold break-words text-slate-900">“{firstMe.reason}”</p>
          <p className="mt-1 text-sm text-slate-500">처음에 내가 적은 공부하는 이유</p>
        </div>
      )}

      {isEmpty && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            시험 날짜와 공부하는 이유를 알려주면, 힘들 때 여기서 다시 보여줄게요.
          </p>
          {/* 설문을 이미 끝낸 사람은 /onboarding 이 홈으로 돌려보내서, 아직 안 한 사람에게만 보여줍니다. */}
          {!firstMe.hasAnswers && (
            <Link to="/onboarding" className={cn(textLinkClass, 'mt-1')}>
              내 정보 더 알려주기
            </Link>
          )}
        </>
      )}
    </Card>
  )
}

interface TodayCardProps {
  /** 오늘 계획 전부 (끝낸 것 포함) */
  plans: StudyPlan[]
  subjects: Subject[]
  sessions: StudySession[]
}

/**
 * "오늘 계획" 카드. 끝낸 개수와 `실제 / 목표` 시간을 보여줍니다. (#243)
 * 여기서는 보기만 하고, 체크와 수정은 계획 화면에서 합니다.
 */
function TodayCard({ plans, subjects, sessions }: TodayCardProps) {
  // 끝낸 개수 · 실제 시간 · 목표 시간은 lib/planProgress.ts 가 계산합니다.
  const dayProgress = getDayProgress(plans, sessions)

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-slate-900">오늘 계획</h3>
        {plans.length > 0 && (
          <p className="text-sm text-slate-500">
            {dayProgress.doneCount} / {dayProgress.totalCount} 완료 ·{' '}
            {formatMinutes(dayProgress.actualMinutes)} / {formatMinutes(dayProgress.targetMinutes)}
          </p>
        )}
      </div>

      {plans.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          계획을 세우면 오늘 얼마나 했는지 여기에 보여요.
        </p>
      ) : (
        <>
          <ProgressBar value={dayProgress.percent} className="mt-3" />
          <ul className="mt-2 divide-y divide-slate-100">
            {plans.map((plan) => {
              const subject = subjects.find((item) => item.id === plan.subjectId)
              const progress = getPlanProgress(plan, sessions)

              return (
                <li key={plan.id} className="flex items-center gap-2 py-2.5">
                  {/* 끝낸 계획은 ✓, 아직인 계획은 빈 동그라미입니다. 여기서는 누를 수 없어서 체크박스(네모)로 그리지 않습니다. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                      plan.done ? 'border-brand bg-brand text-white' : 'border-slate-300',
                    )}
                  >
                    {plan.done && '✓'}
                  </span>
                  {subject && (
                    <SubjectBadge name={subject.name} color={subject.color} className="shrink-0" />
                  )}
                  {plan.kind === 'play' && <PlayBadge className="shrink-0" />}
                  <p
                    className={cn(
                      'min-w-0 flex-1 text-sm break-words text-slate-900',
                      plan.done && 'text-slate-400 line-through',
                    )}
                  >
                    {plan.content}
                    {/* sr-only: 화면에는 안 보이고, 화면을 읽어 주는 프로그램만 읽습니다. */}
                    <span className="sr-only">{plan.done ? ' (끝냄)' : ' (아직)'}</span>
                  </p>
                  <p className="shrink-0 text-sm text-slate-500 tabular-nums">
                    {progress.actualMinutes} / {plan.targetMinutes}분
                  </p>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Link to="/planner" className={cn(textLinkClass, 'mt-2')}>
        계획 화면에서 체크·수정하기
      </Link>
    </Card>
  )
}

interface TreeCardProps {
  tree: TreeState
}

/** "내 나무" 카드. 나무 그림 + 잎·열매 개수 + 다음 단계까지 남은 시간 */
function TreeCard({ tree }: TreeCardProps) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">내 나무</h3>
        <p className="text-sm text-slate-500">
          {tree.stageName} · {tree.stage + 1}단계
          {tree.isWilted && <span className="font-semibold text-amber-700"> · 시듦</span>}
        </p>
      </div>

      <div className="mt-3 flex justify-center rounded-lg bg-slate-50 px-4 py-3">
        <TreeDrawing tree={tree} />
      </div>

      {tree.isWilted && (
        <p className="mt-3 text-sm text-amber-700">
          나무가 조금 시들었어. 오늘 공부를 시작하면 바로 다시 살아나.
        </p>
      )}

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>
          <span className="font-semibold text-green-700">잎 {tree.leafCount}</span> · 회고·인사이트
        </span>
        <span>
          <span className="font-semibold text-orange-600">열매 {tree.fruitCount}</span> · 효과가
          확인된 방법
        </span>
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
          <span>다음 단계까지</span>
          <span>
            {tree.isFullGrown ? '다 자랐어!' : `${formatMinutes(tree.minutesToNextStage)} 남음`}
          </span>
        </div>
        <ProgressBar value={tree.progressPercent} />
      </div>
    </Card>
  )
}

// 큰 나무 위에 잎(작은 흰 점)과 열매(주황 동그라미)를 그릴 자리입니다. 개수가 많아도 이 자리까지만 그립니다.
const LEAF_SPOTS = [
  { x: 78, y: 52 },
  { x: 100, y: 34 },
  { x: 122, y: 50 },
  { x: 66, y: 68 },
  { x: 90, y: 60 },
  { x: 114, y: 66 },
  { x: 134, y: 70 },
  { x: 106, y: 44 },
]
const FRUIT_SPOTS = [
  { x: 118, y: 58 },
  { x: 84, y: 72 },
  { x: 100, y: 52 },
  { x: 130, y: 76 },
  { x: 70, y: 58 },
]

interface TreeDrawingProps {
  tree: TreeState
}

/** 나무 그림 (라이브러리 없이 SVG 를 직접 그립니다) */
function TreeDrawing({ tree }: TreeDrawingProps) {
  // 시들면 초록 잎이 누런 갈색으로 바뀝니다. transition-colors 로 색이 천천히 바뀝니다.
  const leafColor = tree.isWilted ? 'fill-amber-600' : 'fill-green-500'
  const darkLeafColor = tree.isWilted ? 'fill-amber-700' : 'fill-green-700'
  const label = `${tree.stageName}${tree.isWilted ? ', 시든 모습' : ''}`

  // 큰 나무가 되어야 잎·열매 점을 그립니다. (씨앗·새싹에는 붙일 자리가 없어서 개수 글자로만 보여줍니다)
  const leafSpots = tree.stage === 3 ? LEAF_SPOTS.slice(0, tree.leafCount) : []
  const fruitSpots = tree.stage === 3 ? FRUIT_SPOTS.slice(0, tree.fruitCount) : []

  return (
    <svg role="img" aria-label={label} viewBox="0 0 200 140" className="h-36 w-full max-w-full">
      {/* 땅 그림자 */}
      <ellipse cx="100" cy="128" rx="60" ry="6" className="fill-slate-200" />

      {/*
        key 가 단계마다 달라서, 단계가 바뀌면 이 묶음이 새로 그려집니다.
        starting: 는 "처음 나타날 때의 모습" 이라, 작고 투명한 상태에서 transition 으로 커지며 나타납니다.
      */}
      <g
        key={tree.stage}
        className="origin-bottom transition duration-700 ease-out [transform-box:fill-box] starting:scale-50 starting:opacity-0"
      >
        {tree.stage === 0 && <ellipse cx="100" cy="122" rx="9" ry="6" className="fill-amber-800" />}

        {tree.stage === 1 && (
          <>
            <rect x="98" y="96" width="4" height="30" rx="2" className="fill-green-800" />
            <ellipse
              cx="88"
              cy="96"
              rx="12"
              ry="6"
              className={cn('transition-colors duration-700', leafColor)}
            />
            <ellipse
              cx="112"
              cy="90"
              rx="12"
              ry="6"
              className={cn('transition-colors duration-700', darkLeafColor)}
            />
          </>
        )}

        {tree.stage === 2 && (
          <>
            <rect x="95" y="80" width="10" height="46" rx="3" className="fill-amber-800" />
            <circle
              cx="100"
              cy="64"
              r="30"
              className={cn('transition-colors duration-700', leafColor)}
            />
          </>
        )}

        {tree.stage === 3 && (
          <>
            <rect x="92" y="76" width="16" height="50" rx="4" className="fill-amber-800" />
            <circle
              cx="74"
              cy="64"
              r="26"
              className={cn('transition-colors duration-700', leafColor)}
            />
            <circle
              cx="126"
              cy="64"
              r="26"
              className={cn('transition-colors duration-700', darkLeafColor)}
            />
            <circle
              cx="100"
              cy="46"
              r="30"
              className={cn('transition-colors duration-700', leafColor)}
            />
            {leafSpots.map((spot) => (
              <ellipse
                key={`leaf-${spot.x}-${spot.y}`}
                cx={spot.x}
                cy={spot.y}
                rx="5"
                ry="3"
                className="fill-white/70"
              />
            ))}
            {fruitSpots.map((spot) => (
              <circle
                key={`fruit-${spot.x}-${spot.y}`}
                cx={spot.x}
                cy={spot.y}
                r="5"
                className="fill-orange-500"
              />
            ))}
          </>
        )}
      </g>
    </svg>
  )
}
