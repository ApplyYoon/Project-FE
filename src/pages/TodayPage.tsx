import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CareModeBanner } from '@/components/ui/CareModeBanner'
import { MyHypothesesCard } from '@/components/ui/MyHypothesesCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SettingsLink } from '@/components/ui/SettingsLink'
import { useCards } from '@/hooks/useCards'
import { useGoals } from '@/hooks/useGoals'
import { loadManualItems } from '@/hooks/useManualItems'
import { usePlans } from '@/hooks/usePlans'
import { buildJudgedCardDays } from '@/lib/cardDays'
import { loadCardMarks } from '@/lib/cardMarks'
import { createInstantCardNow } from '@/lib/cardSession'
import { getCareLimits } from '@/lib/careLimits'
import { cn } from '@/lib/cn'
import { runDailyCareStage } from '@/lib/dailyCareRun'
import { dailyCoachQuery, getYesterdayLine, type YesterdayLine } from '@/lib/dailyCoach'
import { loadAllSessions, loadStudySessions } from '@/lib/dailyRecords'
import { getTodayKey, toDayDate, toDayKey } from '@/lib/date'
import { getDaySummary } from '@/lib/daySummary'
import { formatDday, getDaysUntil } from '@/lib/exams'
import type { ForestState, ForestTree } from '@/lib/forest'
import { loadForestState } from '@/lib/forestData'
import { FIRST_CHECK_DAYS, checkHypotheses, getHypothesisDay } from '@/lib/hypothesisCheck'
import { loadMyHypotheses } from '@/lib/myHypotheses'
import { getCardDayMarkInfo, loadRestDays } from '@/lib/restDays'
import {
  clearSettingChanges,
  describeSettingChange,
  loadSettingChanges,
  revertSettingChange,
} from '@/lib/settingChanges'
import type { SettingChange } from '@/lib/settingsMapping'
import { getTodayCardsState, type TodayCardsState } from '@/lib/todayCards'
import { getTodayCareLevel, getTodayCareReason } from '@/lib/todayCare'
import type { Card as CardModel, StudySession } from '@/types'
import { useSuspenseQuery } from '@tanstack/react-query'
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

/** 오늘 날짜를 '10월 10일 토요일' 처럼 보여줍니다. (새벽 4시 전이면 어제 날짜를 넘겨받습니다) */
function formatToday(date: Date): string {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })
}

// Link(주소로 이동하는 글자)를 버튼처럼 보이게 하는 클래스입니다.
// Button 은 <button> 이라서, 다른 화면으로 가는 곳에는 Link 에 이 클래스를 붙여 씁니다.
// h-12 / h-10: 손가락으로 누르기 쉽게 높이를 40px 이상으로 둡니다.
const textLinkClass =
  'text-brand inline-flex h-10 items-center text-sm font-medium underline underline-offset-4'

/** [지금 시작] 으로 만드는 즉석 카드의 길이 (분). 타이머 대기 화면의 기본값과 같습니다 */
const INSTANT_CARD_MINUTES = 50

/**
 * 오늘 탭(/today)입니다. 예전 홈 화면(기획서 「4.2 홈」, #405)이 그대로 옮겨 왔습니다.
 * 2026-10-18 에 첫 화면("/")이 AI 코치 채팅이 되면서, 홈에 있던 것은 여기서 봅니다.
 * (학교 시간표 · 급식 · 학사일정은 다음 PR 에서 이 화면 맨 위에 더합니다)
 *
 *   맨 위: 하루 첫 컨디션·감정 태그(Layout 의 DailyTagBar) · 오른쪽 위 설정 아이콘
 *   숲 → 지금/다음 카드와 [시작] · [지금 시작] → 오늘 한 줄 → 지금 관리 모드와 이유 → AI 가 바꾼 설정 알림
 *   내 가설 3일째·7일째에는 기록과 비교한 첫 확인을 띄웁니다.
 *
 * 처음의 나 · 이번 주 목표 · 주간 팩트 · 인사이트 · 개선안(실험) 카드는 홈에서 빠지고 분석 탭에서 봅니다.
 */
export function TodayPage() {
  const navigate = useNavigate()
  const todayKey = getTodayKey()
  const yesterdayKey = moveDateKey(todayKey, -1)
  // 화면을 연 시각. 그리는 동안 Date.now() 를 여러 번 부르지 않게 한 번만 잡습니다.
  const [now] = useState(() => Date.now())

  // 하루 1번 관리 단계를 판정해 저장합니다. ("통화가 없으면 다음 날 첫 진입 때", 기획서 5.4 · lib/dailyCareRun.ts)
  // 판정이 저장된 뒤에 오늘 단계를 읽어야 해서, 관리 모드 · 숲보다 먼저 부릅니다. 오늘 이미 판정했으면 그대로 씁니다.
  const [careLevel] = useState(() => {
    runDailyCareStage(todayKey, now)
    return getTodayCareLevel()
  })
  const [maxCareLevel] = useState(() => getCareLimits().maxCareLevel)
  // 숲 (#404). 재발 신호가 있을 때만 시들고, 회복 모드에서는 시들지 않습니다. (lib/forest.ts · lib/forestData.ts)
  const [forest] = useState(() => loadForestState(todayKey, now, loadManualItems().length))

  const { cards, addCard } = useCards()
  const { activeGoals } = useGoals()
  // 노는 기록까지 들어 있는 전체 기록 (오늘 한 카드 · 내 가설 확인) · 공부 기록만 (오늘 한 줄)
  const [allSessions] = useState<StudySession[]>(loadAllSessions)
  const [sessions] = useState<StudySession[]>(loadStudySessions)
  const [marks] = useState(loadCardMarks)
  const [restDays] = useState(loadRestDays)
  const todayCards = getTodayCardsState({
    cards,
    sessions: allSessions,
    marks,
    isRestDay: restDays.some((day) => day.date === todayKey),
    todayKey,
    now,
  })

  // AI 가 바꾼 설정 기록 (#385). [되돌리기] · [확인] 을 누르면 줄어듭니다. (lib/settingChanges.ts)
  const [settingChanges, setSettingChanges] = useState(loadSettingChanges)

  // 내 가설을 적은 지 3일째 · 7일째에만 기록과 비교한 첫 확인을 보여 줍니다. (기획서 4.6, lib/hypothesisCheck.ts)
  const [hypotheses] = useState(loadMyHypotheses)
  const hypothesisDay = hypotheses ? getHypothesisDay(hypotheses, todayKey) : 0
  const showHypotheses = hypotheses !== undefined && FIRST_CHECK_DAYS.includes(hypothesisDay)

  // 오늘 한 줄의 재료 (어제 기록). 옛 계획도 함께 봅니다. (lib/dailyCoach.ts)
  const { allPlans } = usePlans()
  const recordDates = [
    ...allPlans.map((plan) => plan.date),
    ...sessions.map((session) => toDayKey(session.startedAt)),
  ]
  const firstRecordKey = recordDates.length === 0 ? null : [...recordDates].sort()[0]
  const daysSinceFirstRecord = firstRecordKey === null ? 0 : countDays(firstRecordKey, todayKey)
  const isFirstReportReady = firstRecordKey !== null && daysSinceFirstRecord >= FIRST_REPORT_DAYS
  const yesterdaySummary = getDaySummary(yesterdayKey, allPlans, sessions)
  // 어제 공부 계획이 있었는지. (노는 계획과 0분짜리 계획은 세지 않습니다)
  const hasYesterdayPlan = allPlans.some(
    (plan) => plan.date === yesterdayKey && plan.kind !== 'play' && plan.targetMinutes > 0,
  )
  // 머리글에 보여 줄 가장 가까운 목표의 D-day
  const nearestGoal = [...activeGoals].sort((a, b) => a.dDay.localeCompare(b.dDay))[0]

  /** 카드 없이 지금 시작 — '언제 = 지금' 인 즉석 카드를 만들고 그 카드로 타이머를 엽니다. (「4.2」) */
  function handleStartNow() {
    const card = createInstantCardNow(todayKey, INSTANT_CARD_MINUTES)
    // addCard 는 바로 저장해서, 곧바로 타이머로 옮겨 가도 카드가 남습니다.
    addCard(card)
    navigate(`/timer?card=${encodeURIComponent(card.id)}`)
  }

  function handleRevertSetting(change: SettingChange) {
    setSettingChanges(revertSettingChange(change.key))
  }

  function handleDismissSettings() {
    clearSettingChanges()
    setSettingChanges([])
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">
            {formatToday(toDayDate(new Date(now)))}
            {nearestGoal && ` · ${nearestGoal.title} ${formatDday(getDaysUntil(nearestGoal.dDay))}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            오늘도 같이 시작해 볼까?
          </h1>
        </div>
        {/* 설정은 아래 탭에 없어서 오른쪽 위 아이콘으로 갑니다. (기획서 3장, #386) */}
        <SettingsLink className="-mt-2 -mr-2" />
      </section>

      {/* 숲과 지금 할 카드. PC 에서는 나란히, 모바일에서는 기획서 순서대로 숲 → 카드 */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        {/* 내 숲 (#404): 가운데 전체 나무 + 둘레의 목표 나무 */}
        <ForestCard forest={forest} />
        <div className="flex flex-col gap-1">
          <NowCardsCard
            state={todayCards}
            todayKey={todayKey}
            onStart={(card) => navigate(`/timer?card=${encodeURIComponent(card.id)}`)}
            onStartNow={handleStartNow}
          />
          {/* 카드 탭이 아래 탭에서 빠져서(2026-10-18), 카드 · 목표 관리는 여기서 들어갑니다. */}
          <Link to="/cards" className={cn(textLinkClass, 'self-end')}>
            카드 · 목표 모두 보기 ›
          </Link>
        </div>
      </section>

      <Card title="오늘 한 줄">
        {/* 숫자는 코드가 계산하고, 그 숫자를 말로 푸는 일만 AI 에게 맡깁니다. 문장 아래에 근거가 된 숫자를 같이 보여 줍니다. (lib/dailyCoach.ts) */}
        <YesterdayLineView
          dateKey={yesterdayKey}
          line={getYesterdayLine(yesterdaySummary, hasYesterdayPlan)}
        />

        {/* 첫 리포트(14일)까지 남은 날 (#85) */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          {firstRecordKey === null ? (
            <p className="text-sm text-slate-500">
              기록을 시작하면 첫 리포트까지 며칠 남았는지 세어줄게요.
            </p>
          ) : isFirstReportReady ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-600">{FIRST_REPORT_DAYS}일치 기록이 다 쌓였어요!</p>
              <Button onClick={() => navigate('/analysis?tab=report')}>첫 리포트 보기</Button>
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
            </div>
          )}
        </div>
      </Card>

      {/* 지금 관리 모드와 그 이유 — 하루 1번 판정한 결과입니다 (#384 규칙, lib/dailyCareRun.ts) */}
      <CareModeBanner
        level={careLevel}
        reason={getTodayCareReason(careLevel)}
        maxLevel={maxCareLevel}
      />

      {/* AI 가 설정을 바꿨으면 알림 줄 + [되돌리기] (#385) */}
      {settingChanges.length > 0 && (
        <SettingChangeNotice
          changes={settingChanges}
          onRevert={handleRevertSetting}
          onDismiss={handleDismissSettings}
        />
      )}

      {showHypotheses && hypotheses && (
        <MyHypothesesCard
          checks={checkHypotheses(hypotheses, {
            cards,
            sessions: allSessions,
            judgedDays: buildJudgedCardDays(
              cards,
              allSessions,
              toDayKey(hypotheses.savedAt),
              todayKey,
              now,
              (cardId, dateKey) => getCardDayMarkInfo(cardId, dateKey, restDays, marks),
            ),
            todayKey,
          })}
          day={hypothesisDay}
        />
      )}
    </div>
  )
}

interface NowCardsCardProps {
  state: TodayCardsState
  todayKey: string
  /** 카드로 시작 — 타이머가 그 카드로 엽니다 (/timer?card=…) */
  onStart: (card: CardModel) => void
  /** 카드 없이 지금 시작 (즉석 카드) */
  onStartNow: () => void
}

/** 카드 시작 시각과 길이 한 줄. 예: '19:00 · 60분' / 시각이 없으면 '시간 미정 · 60분' */
function cardTimeText(card: CardModel): string {
  return `${card.startTime ?? '시간 미정'} · ${card.durationMinutes}분`
}

/**
 * 지금/다음 카드와 [시작] (「4.2」). 지금 할 카드가 있으면 크게, 없으면 다음 카드를 보여 줍니다.
 * 아래에 [지금 시작] — 카드 없이 시작하면 즉석 카드가 생겨서 모든 세션이 카드에 붙습니다.
 */
function NowCardsCard({ state, todayKey, onStart, onStartNow }: NowCardsCardProps) {
  const main = state.current ?? state.next
  const label = state.current ? '지금 할 카드' : '다음 카드'
  return (
    <Card className={cn(state.current && 'border-brand border-2')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{main ? label : '오늘 카드'}</p>
        {state.total > 0 && (
          <p className="text-sm text-slate-500">
            오늘 {state.doneCount}/{state.total}
          </p>
        )}
      </div>

      {main ? (
        <>
          <p className="mt-1 truncate text-lg font-bold text-slate-900">{main.title}</p>
          <p className="text-sm text-slate-600">
            {cardTimeText(main)} · 할 일 {main.checklist.length}개
          </p>
          <button
            type="button"
            onClick={() => onStart(main)}
            className={cn(
              'mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-lg text-base font-semibold transition-colors',
              state.current
                ? 'bg-brand hover:bg-brand-dark text-white'
                : 'bg-slate-100 text-slate-900 hover:bg-slate-200',
            )}
          >
            ▷ {state.current ? '시작' : '지금 미리 시작'}
          </button>
          {state.current && state.next && (
            <p className="mt-2 truncate text-sm text-slate-500">
              다음: {state.next.title} ({cardTimeText(state.next)})
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {state.total === 0 ? '오늘은 카드가 없어요.' : '오늘 남은 카드가 없어요.'}
          </p>
          <Link to={`/cards/new?date=${todayKey}`} className={cn(textLinkClass, 'mt-1')}>
            카드 만들기
          </Link>
        </>
      )}

      {state.unhandled.length > 0 && (
        <Link
          to="/timer"
          className="mt-3 flex min-h-10 items-center rounded-lg bg-amber-50 px-3 text-sm break-keep text-amber-900"
        >
          시간이 끝난 카드 {state.unhandled.length}개 — 타이머에서 미루거나 실패로 남겨요 ›
        </Link>
      )}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <Button variant="secondary" className="w-full" onClick={onStartNow}>
          카드 없이 지금 시작 ({INSTANT_CARD_MINUTES}분)
        </Button>
        <p className="mt-1.5 text-xs break-keep text-slate-500">
          제목과 할 일은 끝날 때 한 줄로 적어요.
        </p>
      </div>
    </Card>
  )
}

interface SettingChangeNoticeProps {
  changes: SettingChange[]
  onRevert: (change: SettingChange) => void
  onDismiss: () => void
}

/** AI 가 바꾼 설정 알림 줄 + [되돌리기] (「4.2」 · 「4.8」, #385). 되돌린 설정은 잠겨서 AI 가 다시 바꾸지 않습니다. */
function SettingChangeNotice({ changes, onRevert, onDismiss }: SettingChangeNoticeProps) {
  return (
    <Card className="border-sky-200 bg-sky-50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-sky-900">AI 가 설정을 맞췄어요</p>
        <button
          type="button"
          onClick={onDismiss}
          className="h-10 shrink-0 cursor-pointer rounded-md px-3 text-sm font-medium text-sky-900 hover:bg-sky-100"
        >
          확인
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-3">
        {changes.map((change) => {
          const { title, to } = describeSettingChange(change)
          return (
            <li key={change.key} className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm break-keep">
                <p className="font-medium text-slate-900">
                  {title}: {to}
                </p>
                <p className="text-slate-600">{change.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => onRevert(change)}
                className="h-10 shrink-0 cursor-pointer rounded-md border border-sky-300 bg-white px-3 text-sm font-medium text-sky-900 hover:bg-sky-100"
              >
                되돌리기
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

interface ForestCardProps {
  forest: ForestState
}

/** 목표 나무 아래에 보여 줄 상태 글자 */
function goalTreeStatus(tree: ForestTree): string {
  if (tree.isFinished) return '끝난 목표'
  if (tree.isWilted) return `${tree.stageName} · 시듦`
  return tree.stageName
}

/**
 * "내 숲" 카드 (#404). 가운데 전체 나무 그림 + 잎·열매 개수 + 다음 단계까지 남은 시간,
 * 그 아래 목표 나무들(진행 중인 목표 먼저, 끝난 목표는 흐리게). 목표가 없으면 전체 나무만 보입니다.
 */
function ForestCard({ forest }: ForestCardProps) {
  const { main } = forest
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">내 숲</h3>
        <p className="text-sm text-slate-500">
          {main.stageName} · {main.stage + 1}단계
          {main.isWilted && <span className="font-semibold text-amber-700"> · 시듦</span>}
        </p>
      </div>

      <div className="mt-3 flex justify-center rounded-lg bg-slate-50 px-4 py-3">
        <TreeDrawing tree={main} />
      </div>

      {main.isWilted && (
        <p className="mt-3 text-sm break-keep text-amber-700">
          미루거나 못 한 카드가 이어져서 조금 시들었어. 다시 카드를 하면 살아나.
        </p>
      )}

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>
          <span className="font-semibold text-green-700">잎 {main.leafCount}</span> · 회고·인사이트
        </span>
        <span>
          <span className="font-semibold text-orange-600">열매 {main.fruitCount}</span> · 효과가
          확인된 방법
        </span>
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
          <span>다음 단계까지</span>
          <span>
            {main.isFullGrown ? '다 자랐어!' : `${formatMinutes(main.minutesToNextStage)} 남음`}
          </span>
        </div>
        <ProgressBar value={main.progressPercent} />
      </div>

      {forest.goals.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">목표 나무</p>
          {/* 375px 에서도 3그루가 한 줄에 들어가고, 지난 목표가 늘면 다음 줄로 내려갑니다. (가로 스크롤 없음) */}
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {forest.goals.map((tree) => (
              <li
                key={tree.goalId}
                className={cn(
                  'flex min-w-0 flex-col items-center rounded-lg bg-slate-50 px-1 py-2',
                  tree.isFinished && 'opacity-60',
                )}
              >
                <TreeDrawing tree={tree} className="h-16" />
                <p className="mt-1 w-full truncate text-center text-xs font-medium text-slate-800">
                  {tree.title}
                </p>
                <p
                  className={cn(
                    'text-center text-xs',
                    tree.isWilted ? 'text-amber-700' : 'text-slate-500',
                  )}
                >
                  {goalTreeStatus(tree)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
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
  /** 그릴 나무 (전체 나무 · 목표 나무 모두 같은 모양으로 그립니다) */
  tree: Pick<ForestTree, 'stage' | 'stageName' | 'isWilted' | 'leafCount' | 'fruitCount'>
  /** 그림 높이. 기본은 h-36(전체 나무), 목표 나무는 더 작게 넘깁니다 */
  className?: string
}

/** 나무 그림 (라이브러리 없이 SVG 를 직접 그립니다) */
function TreeDrawing({ tree, className }: TreeDrawingProps) {
  // 시들면 초록 잎이 누런 갈색으로 바뀝니다. transition-colors 로 색이 천천히 바뀝니다.
  const leafColor = tree.isWilted ? 'fill-amber-600' : 'fill-green-500'
  const darkLeafColor = tree.isWilted ? 'fill-amber-700' : 'fill-green-700'
  const label = `${tree.stageName}${tree.isWilted ? ', 시든 모습' : ''}`

  // 큰 나무가 되어야 잎·열매 점을 그립니다. (씨앗·새싹에는 붙일 자리가 없어서 개수 글자로만 보여줍니다)
  const leafSpots = tree.stage === 3 ? LEAF_SPOTS.slice(0, tree.leafCount) : []
  const fruitSpots = tree.stage === 3 ? FRUIT_SPOTS.slice(0, tree.fruitCount) : []

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 200 140"
      className={cn('h-36 w-full max-w-full', className)}
    >
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

interface YesterdayLineViewProps {
  /** 어제 날짜 ('YYYY-MM-DD'). 날이 바뀌면 새로 물어보려고 받습니다. */
  dateKey: string
  /** 기본 문장과 AI 에게 건넬 숫자 (lib/dailyCoach.ts 의 getYesterdayLine) */
  line: YesterdayLine
}

/**
 * 홈의 "어제 한 줄" 입니다.
 *   어제 기록이 없음      -> 기본 문장만 ("오늘부터 시작해 볼까?"). 말로 풀 숫자가 없어서 AI 에게 묻지 않습니다.
 *   서버가 문장을 줌      -> AI 가 쓴 문장 + "AI 가 쓴 글" 표시 + 근거가 된 숫자 한 줄
 *   서버가 없거나 못 받음 -> 숫자를 끼워 만든 기본 문장
 */
function YesterdayLineView({ dateKey, line }: YesterdayLineViewProps) {
  // 설정에서 정한 관리 강도 한도와 독설 허용 수위. 서버가 이 한도 안에서 말투를 정합니다. 처음 그릴 때 한 번만 읽습니다.
  const [limits] = useState(getCareLimits)
  const fallback = <p className="text-base font-semibold text-slate-900">{line.sentence}</p>

  if (line.evidence.length === 0) return fallback

  return (
    // 홈은 열자마자 보여야 하는 화면이라, 서버 답을 기다리는 동안 스켈레톤 대신 기본 문장을 먼저 보여줍니다.
    <AsyncBoundary pendingFallback={fallback} resetKeys={[dateKey]}>
      <YesterdayAiLine
        dateKey={dateKey}
        fallbackSentence={line.sentence}
        // 서버에는 계산된 숫자와 내가 정한 한도만 보냅니다. 계획 내용·과목 이름 같은 원문은 보내지 않습니다.
        request={{
          numbers: line.evidence,
          maxCareLevel: limits.maxCareLevel,
          maxHarshness: limits.maxHarshness,
        }}
      />
    </AsyncBoundary>
  )
}

interface YesterdayAiLineProps {
  dateKey: string
  /** 서버가 문장을 주지 못했을 때 보여줄 기본 문장 */
  fallbackSentence: string
  /** 서버에 보낼 값 */
  request: Parameters<typeof dailyCoachQuery>[1]
}

/**
 * 서버에 "어제 한 줄" 을 물어보고 보여줍니다. useSuspenseQuery 가 기다리는 동안에는 바깥의 AsyncBoundary 가 기본 문장을 보여줍니다.
 * 서버가 없거나 실패하면 data 가 null 로 와서(에러가 아닙니다) 기본 문장을 그대로 보여줍니다.
 */
function YesterdayAiLine({ dateKey, fallbackSentence, request }: YesterdayAiLineProps) {
  const { data: aiSentence } = useSuspenseQuery(dailyCoachQuery(dateKey, request))

  if (aiSentence === null) {
    return <p className="text-base font-semibold text-slate-900">{fallbackSentence}</p>
  }

  return (
    <div>
      <p className="text-base font-semibold break-keep text-slate-900">{aiSentence}</p>
      {/* 누가 쓴 글인지 꼭 밝힙니다. AI 가 쓴 글은 틀릴 수 있어서, 바로 아래에 근거가 된 숫자(기본 문장)를 같이 보여줍니다. */}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span className="bg-brand-light text-brand rounded px-1.5 py-0.5 text-xs font-medium">
          AI 가 쓴 글
        </span>
        <span className="break-keep">{fallbackSentence}</span>
      </p>
    </div>
  )
}
