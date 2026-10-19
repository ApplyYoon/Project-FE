import { RedirectWithQuery } from '@/components/layout/RedirectWithQuery'
import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CareModeBanner } from '@/components/ui/CareModeBanner'
import { ChipButton } from '@/components/ui/ChipButton'
import { MissionBar } from '@/components/ui/MissionBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCards } from '@/hooks/useCards'
import { useGoals } from '@/hooks/useGoals'
import { useIsServerData } from '@/hooks/useIsServerData'
import { useQueryParam } from '@/hooks/useQueryParam'
import { loadCardMarks } from '@/lib/cardMarks'
import { getCareLimits } from '@/lib/careLimits'
import { localCheckCall, type StudiedInfo } from '@/lib/checkCall'
import { cn } from '@/lib/cn'
import { runDailyCareStage } from '@/lib/dailyCareRun'
import { loadDailyMissions } from '@/lib/dailyMission'
import { loadAllSessions } from '@/lib/dailyRecords'
import { getTodayKey, toDayDate } from '@/lib/date'
import { formatDday, getDaysUntil } from '@/lib/exams'
import { getUpcomingMyEvents } from '@/lib/myEvents'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { loadRestDays } from '@/lib/restDays'
import { filterForGrade, gradeNumberOf, groupEventPeriods } from '@/lib/schoolEvents'
import {
  isContestNotice,
  matchesFocusName,
  schoolNoticesQuery,
  type SchoolNotice,
} from '@/lib/schoolNotices'
import { loadSchoolClass, schoolTodayQuery, type SchoolClass } from '@/lib/schoolToday'
import {
  clearSettingChanges,
  describeSettingChange,
  loadSettingChanges,
  revertSettingChange,
} from '@/lib/settingChanges'
import type { SettingChange } from '@/lib/settingsMapping'
import { loadStudyFocus } from '@/lib/studyFocus'
import { COACH_PATH, PLAN_CHAT_PATH } from '@/lib/chatRooms'
import {
  getTodayCardsState,
  type TodayCardItem,
  type TodayCardsState,
  type TodayCardStatus,
} from '@/lib/todayCards'
import { getTodayCareLevel, getTodayCareReason } from '@/lib/todayCare'
import type { Card as CardModel, StudySession } from '@/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

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

/** 오늘 날짜를 '10월 10일 토요일' 처럼 보여줍니다. (새벽 4시 전이면 어제 날짜를 넘겨받습니다) */
function formatToday(date: Date): string {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })
}

// Link(주소로 이동하는 글자)를 버튼처럼 보이게 하는 클래스입니다.
// Button 은 <button> 이라서, 다른 화면으로 가는 곳에는 Link 에 이 클래스를 붙여 씁니다.
// h-12 / h-10: 손가락으로 누르기 쉽게 높이를 40px 이상으로 둡니다.
const textLinkClass =
  'text-brand inline-flex h-10 items-center text-sm font-medium underline underline-offset-4'

/**
 * 홈 탭(첫 화면 "/")입니다. (2026-10-18 '오늘' 탭(/today)에서 이름 · 주소를 바꿔 첫 탭으로 올림)
 * 사용자: "일단 홈 정도도 필요하지 않나", "달력 위치도 좀 바꾸거나", "홈 화면 수정도 좀 하자"
 *
 *   ① 인사 + 오늘의 미션 한 줄 (누르면 코치 화면으로)
 *   ② 오늘 계획: 오늘 카드를 시간 순서로 + [시작]. 카드가 없으면 [코치와 오늘 계획 짜기] · [사진으로 만들기]
 *   ③ 오늘 시간표 · 급식 (모바일은 위아래, PC 는 나란히)
 *   ④ 다가오는 일정: 학교 일정 + 내 일정을 날짜 순서로, D-day 와 함께
 *   ⑤ 학교 공지: 학교 홈페이지의 가정통신문 · 공지사항 제목, 대회 글은 🏆 (2026-10-19)
 *   맨 아래: 지금 관리 모드와 이유 · AI 가 바꾼 설정 알림
 *
 * 숲은 기록 탭 맨 위로, 오늘 한 줄은 빠졌습니다. 알림 · 통화는 코치 화면 머리에, 설정은 헤더(PC 메뉴 · 모바일 오른쪽 위 톱니)에 있습니다.
 */
export function HomePage() {
  const { search } = useLocation()
  // 예전 미션 알림은 첫 화면(/?mission=morning)을 열었습니다. 지금은 코치가 미션을 말해서 코치 화면으로 넘깁니다. (?mission= 값은 그대로)
  if (new URLSearchParams(search).has('mission')) return <RedirectWithQuery to={COACH_PATH} />
  return <HomeView />
}

function HomeView() {
  const navigate = useNavigate()
  const todayKey = getTodayKey()
  // 화면을 연 시각. 그리는 동안 Date.now() 를 여러 번 부르지 않게 한 번만 잡습니다.
  const [now] = useState(() => Date.now())

  // 하루 1번 관리 단계를 판정해 저장합니다. ("통화가 없으면 다음 날 첫 진입 때", 기획서 5.4 · lib/dailyCareRun.ts)
  // 판정이 저장된 뒤에 오늘 단계를 읽어야 해서, 관리 모드보다 먼저 부릅니다. 오늘 이미 판정했으면 그대로 씁니다.
  const [careLevel] = useState(() => {
    runDailyCareStage(todayKey, now)
    return getTodayCareLevel()
  })
  const [maxCareLevel] = useState(() => getCareLimits().maxCareLevel)
  // 오늘의 미션 (컨디션 · 오늘 계획 · 첫 공부). 이미 있는 기록으로 끝났는지 봅니다. (lib/dailyMission.ts)
  const [missions] = useState(() => loadDailyMissions(todayKey))

  const { cards } = useCards()
  const { activeGoals } = useGoals()
  // 노는 기록까지 들어 있는 전체 기록 (오늘 한 카드를 찾을 때)
  const [allSessions] = useState<StudySession[]>(loadAllSessions)
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

  // 오늘 공부를 하나 끝냈으면 확인 통화 입구를 보여 줍니다. (이 기기 기록으로 봄 — 통화 화면이 서버에 다시 확인, lib/checkCall.ts)
  const checkCall = localCheckCall(allSessions, cards, todayKey)

  // AI 가 바꾼 설정 기록 (#385). [되돌리기] · [확인] 을 누르면 줄어듭니다. (lib/settingChanges.ts)
  const [settingChanges, setSettingChanges] = useState(loadSettingChanges)

  // 머리글에 보여 줄 가장 가까운 목표의 D-day
  const nearestGoal = [...activeGoals].sort((a, b) => a.dDay.localeCompare(b.dDay))[0]

  function handleRevertSetting(change: SettingChange) {
    setSettingChanges(revertSettingChange(change.key))
  }

  function handleDismissSettings() {
    clearSettingChanges()
    setSettingChanges([])
  }

  return (
    // 모바일은 바탕을 연회색으로 칠하고(-mx-4 -mt-3 -mb-6 으로 Layout 의 여백까지 덮음), 내용은 흰 묶음으로 올립니다.
    <div className="-mx-4 -mt-3 -mb-6 flex flex-col gap-4 bg-slate-100 px-4 pt-3 pb-6 sm:mx-0 sm:my-0 sm:gap-6 sm:rounded-3xl sm:p-6">
      {/* ① 인사 + 오늘의 미션 */}
      <section className="flex flex-col gap-3">
        <div className="min-w-0 px-1">
          <p className="text-[15px] text-slate-500">
            {formatToday(toDayDate(new Date(now)))}
            {nearestGoal && ` · ${nearestGoal.title} ${formatDday(getDaysUntil(nearestGoal.dDay))}`}
          </p>
          <h1 className="mt-1 text-[26px] leading-snug font-bold tracking-tight text-slate-900">
            오늘도 같이 시작해 볼까?
          </h1>
        </div>
        {/* 미션은 코치가 채팅에서 같이 해 줘서, 누르면 코치 화면으로 갑니다. */}
        <MissionBar missions={missions} onOpen={() => navigate(COACH_PATH)} />
      </section>

      {/* ② 오늘 계획 */}
      <TodayPlanSection
        state={todayCards}
        onStart={(card) => navigate(`/timer?card=${encodeURIComponent(card.id)}`)}
        // ?plan=today: 코치 화면이 열리자마자 오늘 계획을 짜 줍니다. (계획 핑퐁)
        onPlanWithCoach={() => navigate(`${PLAN_CHAT_PATH}?plan=today`)}
        onPhoto={() => navigate('/cards/photo')}
      />

      {/* 오늘 공부를 끝냈으면: 코치한테 말로 설명하는 확인 통화 (2026-10-18) */}
      {checkCall.studied && <CheckCallEntry studied={checkCall.studied} />}

      {/* ③ 오늘 시간표 · 급식 → ④ 다가오는 일정 (2026-10-18, BE GET /school/today) */}
      <SchoolTodaySection todayKey={todayKey} />

      {/* ⑤ 학교 공지 (2026-10-19, BE GET /school/notices). 시간표 · 급식과 따로 받아서, 공지가 늦어도 위 칸은 먼저 뜹니다. */}
      <SchoolNoticesSection todayKey={todayKey} />

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
    </div>
  )
}

// 흰 묶음 카드 (토스 형식: 테두리 · 그림자 없이 둥근 흰 바탕)
const sectionCardClass = 'rounded-3xl bg-white p-5'

interface CheckCallEntryProps {
  /** 오늘 가장 최근에 끝낸 공부 */
  studied: StudiedInfo
}

/** 확인 통화 입구 한 줄. 누르면 통화 화면(/call)이 문을 서버에 확인하고 전화를 받게 합니다. */
function CheckCallEntry({ studied }: CheckCallEntryProps) {
  return (
    <Link
      to="/call"
      className={cn(sectionCardClass, 'flex items-center gap-3 active:scale-[0.99]')}
    >
      <span aria-hidden className={rowIconClass}>
        📞
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-slate-900">
          코치한테 3분 설명해 볼래?
        </span>
        <span className="block text-sm break-keep text-slate-500">
          방금 한 {studied.title ? `'${studied.title}'` : '공부'}({studied.minutes}분)을 말로
          설명하면 코치가 확인해 줘
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-slate-400">
        ›
      </span>
    </Link>
  )
}

// 동그란 배경의 이모지 자리 (목록 줄 왼쪽)
const rowIconClass =
  'flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg'

/** 오늘 계획 한 줄의 상태별 이모지와 글자 */
const PLAN_STATUS_INFO: Record<TodayCardStatus, { icon: string; label: string }> = {
  current: { icon: '▶️', label: '지금' },
  waiting: { icon: '📖', label: '' },
  unhandled: { icon: '⏰', label: '시간 지남' },
  done: { icon: '✅', label: '끝' },
  // 미루기 · 실패로 처리했거나, 오늘을 쉰 날로 처리한 카드
  skipped: { icon: '⏭️', label: '넘김' },
}

/** 카드 시작 시각과 길이 한 줄. 예: '19:00 · 60분' / 시각이 없으면 '시간 미정 · 60분' */
function cardTimeText(card: CardModel): string {
  return `${card.startTime ?? '시간 미정'} · ${card.durationMinutes}분`
}

interface TodayPlanSectionProps {
  state: TodayCardsState
  /** 카드로 시작 — 타이머가 그 카드로 엽니다 (/timer?card=…) */
  onStart: (card: CardModel) => void
  /** 카드가 없을 때: 코치와 오늘 계획 짜기 */
  onPlanWithCoach: () => void
  /** 카드가 없을 때: 시험 범위 사진으로 카드 만들기 */
  onPhoto: () => void
}

/**
 * ② 오늘 계획 (「4.2」). 오늘 카드를 시작 시각 순서로 보여 주고, 아직 할 카드에는 [시작] 을 붙입니다.
 * 지금 할 카드의 [시작] 은 진한 색, 아직 시간이 안 된 카드는 연한 색입니다. (미리 시작해도 됩니다)
 * 카드가 없으면 계획을 만드는 두 길(코치와 짜기 · 사진으로 만들기)을 보여 줍니다.
 */
function TodayPlanSection({ state, onStart, onPlanWithCoach, onPhoto }: TodayPlanSectionProps) {
  return (
    <section className={sectionCardClass}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold text-slate-900">오늘 계획</h2>
        {state.total > 0 && (
          <p className="text-sm text-slate-500">
            {state.doneCount}/{state.total} 끝
          </p>
        )}
      </div>

      {state.items.length === 0 ? (
        <>
          <p className="mt-1 text-[15px] break-keep text-slate-500">
            아직 오늘 계획이 없어요. 코치와 같이 짜거나, 시험 범위 사진으로 만들어 봐요.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:flex-1" onClick={onPlanWithCoach}>
              💬 코치와 오늘 계획 짜기
            </Button>
            <Button variant="secondary" className="w-full sm:flex-1" onClick={onPhoto}>
              📸 사진으로 만들기
            </Button>
          </div>
        </>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {state.items.map((item) => (
            <PlanRow key={item.card.id} item={item} onStart={onStart} />
          ))}
        </ul>
      )}

      {state.unhandled.length > 0 && (
        <Link
          to="/timer"
          className="mt-3 flex min-h-10 items-center rounded-xl bg-amber-50 px-3 text-sm break-keep text-amber-900"
        >
          시간이 끝난 카드 {state.unhandled.length}개 — 타이머에서 미루거나 실패로 남겨요 ›
        </Link>
      )}

      {/* 카드 탭이 아래 탭에서 빠져서(2026-10-18), 카드 · 목표 관리는 여기서 들어갑니다. */}
      <div className="mt-2 flex justify-end">
        <Link to="/cards" className={textLinkClass}>
          카드 · 목표 모두 보기 ›
        </Link>
      </div>
    </section>
  )
}

interface PlanRowProps {
  item: TodayCardItem
  onStart: (card: CardModel) => void
}

/** 오늘 계획 한 줄: 상태 이모지 · 카드 이름 · 시각과 길이 · 오른쪽에 [시작] 또는 상태 글자 */
function PlanRow({ item, onStart }: PlanRowProps) {
  const { card, status } = item
  const info = PLAN_STATUS_INFO[status]
  // 지금 할 카드와 아직 시간이 안 된 카드만 시작할 수 있습니다.
  const canStart = status === 'current' || status === 'waiting'
  // 끝냈거나 넘긴 카드는 흐리게 보여 줍니다.
  const isFinished = status === 'done' || status === 'skipped'
  return (
    <li className="flex min-h-14 items-center gap-3">
      <span aria-hidden className={rowIconClass}>
        {info.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[15px] font-semibold',
            isFinished ? 'text-slate-400' : 'text-slate-900',
          )}
        >
          {card.title}
        </span>
        <span className="block text-sm text-slate-500">
          {cardTimeText(card)}
          {info.label && (
            <span
              className={cn(
                'font-semibold',
                status === 'current' && 'text-brand',
                status === 'unhandled' && 'text-amber-700',
                status === 'done' && 'text-emerald-700',
              )}
            >
              {' · '}
              {info.label}
            </span>
          )}
        </span>
      </span>
      {canStart && (
        <button
          type="button"
          onClick={() => onStart(card)}
          aria-label={`${card.title} 시작`}
          className={cn(
            'h-10 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold transition active:scale-[0.98]',
            status === 'current'
              ? 'bg-brand hover:bg-brand-dark text-white'
              : 'bg-slate-100 text-slate-900 hover:bg-slate-200',
          )}
        >
          ▷ 시작
        </button>
      )}
    </li>
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

interface SchoolTodaySectionProps {
  todayKey: string
}

/**
 * ③ 오늘 시간표 · 급식과 ④ 다가오는 일정입니다. 서버에서 받는 동안은 스켈레톤, 못 받으면 안내를 보여 줍니다. (AsyncBoundary)
 * 홈은 시간표를 보여 주기만 합니다. 학년 · 반은 설정의 계정 묶음에서 정합니다. (2026-10-19 "반 저장도 설정에서 해, 홈에선 시간표만")
 * 반을 아직 안 정했으면 시간표 자리에 설정으로 가는 링크가 나옵니다. 반은 이 기기에만 저장합니다. (lib/schoolToday.ts)
 */
function SchoolTodaySection({ todayKey }: SchoolTodaySectionProps) {
  const isServerData = useIsServerData()
  // 설정에서 정한 반. 홈에서는 바꾸지 않아서 처음에 한 번만 읽습니다.
  const [schoolClass] = useState(loadSchoolClass)

  return (
    <AsyncBoundary
      pendingFallback={<SchoolTodaySkeleton />}
      errorMessage="학교 정보를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
      resetKeys={[schoolClass?.grade, schoolClass?.classNo]}
    >
      <SchoolTodayView todayKey={todayKey} isServerData={isServerData} schoolClass={schoolClass} />
    </AsyncBoundary>
  )
}

function SchoolTodaySkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">학교 정보를 불러오는 중이에요</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
      <Skeleton className="h-28 w-full rounded-3xl" />
    </div>
  )
}

interface SchoolTodayViewProps {
  todayKey: string
  isServerData: boolean
  schoolClass: SchoolClass | null
}

function SchoolTodayView({ todayKey, isServerData, schoolClass }: SchoolTodayViewProps) {
  const { data } = useSuspenseQuery(schoolTodayQuery(schoolClass, isServerData, todayKey))
  // 내 일정(대회 등, 코치 채팅에서 날짜를 알려 주면 생김 · lib/myEvents.ts)도 학교 일정과 같은 목록에 보여 줍니다.
  const [myEvents] = useState(() => getUpcomingMyEvents(todayKey, 60))
  const myRows: UpcomingRow[] = myEvents.map((event) => ({
    key: `mine-${event.name}`,
    name: event.name,
    start: event.date,
    end: event.date,
    kind: 'mine',
    dDay: event.dDay,
  }))

  if (data.school === null) {
    return (
      <div className="flex flex-col gap-4">
        <section className={sectionCardClass}>
          <h2 className="text-[17px] font-bold text-slate-900">오늘 학교</h2>
          <p className="mt-1 text-[15px] break-keep text-slate-500">
            가입할 때 학교를 고르면 시간표 · 급식 · 학교 일정이 여기에 떠요.
          </p>
        </section>
        {myRows.length > 0 && <UpcomingSection rows={myRows} />}
      </div>
    )
  }

  // 시연 예시는 반을 안 골라도 시간표를 보여 줍니다. (서버 없이 바로 시연되게)
  const needsClass = !data.isDemo && schoolClass === null
  // 같은 이름이 이어지는 날(시험 3일 등)은 한 줄로 묶고, 내 학년 행사만 남깁니다.
  const periods = groupEventPeriods(
    filterForGrade(
      data.events.map((event) => ({ ...event, content: null })),
      schoolClass?.grade ?? gradeNumberOf(loadOnboardingAnswers()?.grade),
    ),
  )
  // 학교 일정과 내 일정을 남은 날 순서로 합쳐 5개까지 보여 줍니다.
  const rows: UpcomingRow[] = [
    ...periods.map((period): UpcomingRow => ({
      key: `school-${period.start}-${period.name}`,
      name: period.name,
      start: period.start,
      end: period.end,
      kind: period.exam ? 'exam' : 'school',
      dDay: countDays(todayKey, period.start) - 1,
    })),
    ...myRows,
  ]
    .sort((a, b) => a.dDay - b.dDay)
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-4">
      {data.isDemo && (
        <p className="self-start rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
          시연용 예시 — 테스트 로그인이라 서버 대신 정해 둔 학교 정보를 보여 줘요
        </p>
      )}

      {/* ③ 시간표 · 급식: 모바일은 위아래, PC 는 나란히. items-start: 높이가 다른 칸을 억지로 늘리지 않습니다. */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <section className={sectionCardClass}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-bold text-slate-900">오늘 시간표</h2>
            {/* 어느 반 시간표인지 글자로만 보여 줍니다. 반은 설정에서 바꿉니다. */}
            {schoolClass && !data.isDemo && (
              <p className="shrink-0 text-sm font-medium text-slate-500">
                {schoolClass.grade}학년 {schoolClass.classNo}반
              </p>
            )}
          </div>

          {needsClass ? (
            <>
              <p className="mt-1 text-[15px] break-keep text-slate-500">
                설정에서 학년 · 반을 정하면 오늘 시간표가 여기에 떠요.
              </p>
              <Link to="/settings" className={textLinkClass}>
                설정에서 반 정하기 ›
              </Link>
            </>
          ) : data.timetable === null || data.timetable.length === 0 ? (
            <p className="mt-2 text-[15px] text-slate-500">오늘은 수업이 없어요.</p>
          ) : (
            <>
              {/* 자리를 덜 차지하게 두 칸으로 놓습니다. 교시 번호가 있어서 순서는 번호로 읽습니다. (1 2 / 3 4 / …) */}
              <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
                {data.timetable.map((period) => (
                  <li key={period.period} className="flex min-h-9 min-w-0 items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {period.period}
                    </span>
                    <span className="min-w-0 truncate text-[15px] text-slate-900">
                      {period.subject}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs break-keep text-slate-500">
                반 시간표 기준이에요. 선택과목은 다를 수 있어요.
                {data.timetablePartial && ' 지금은 5교시까지만 보여요.'}
              </p>
            </>
          )}
        </section>

        <section className={sectionCardClass}>
          <h2 className="text-[17px] font-bold text-slate-900">급식</h2>
          {data.meals.length === 0 ? (
            <p className="mt-2 text-[15px] text-slate-500">오늘 · 내일 급식 정보가 없어요.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {data.meals.map((meal) => (
                <li key={`${meal.date}-${meal.kind}`} className="flex min-h-14 items-center gap-3">
                  <span aria-hidden className={rowIconClass}>
                    🍚
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900">
                      {meal.date === todayKey ? '오늘' : '내일'} {meal.kind}
                    </span>
                    <span className="line-clamp-2 block text-sm break-keep text-slate-500">
                      {meal.dishes.join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ④ 다가오는 일정 */}
      <UpcomingSection rows={rows} />
    </div>
  )
}

/** "다가오는 일정" 한 줄: 학교 일정(시험 · 행사) 또는 내 일정 */
interface UpcomingRow {
  key: string
  name: string
  start: string
  end: string
  kind: 'exam' | 'school' | 'mine'
  /** 오늘부터 며칠 남았는지 (오늘이면 0) */
  dDay: number
}

/** 다가오는 일정 목록. 시험 · 내 일정은 D-day 를 brand 색으로 강조합니다. */
function UpcomingSection({ rows }: { rows: UpcomingRow[] }) {
  return (
    <section className={sectionCardClass}>
      <h2 className="text-[17px] font-bold text-slate-900">다가오는 일정</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-[15px] text-slate-500">30일 안에 일정이 없어요.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.key} className="flex min-h-14 items-center gap-3">
              <span aria-hidden className={rowIconClass}>
                {row.kind === 'exam' ? '📝' : row.kind === 'mine' ? '⭐' : '📅'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-slate-900">
                  {row.name}
                </span>
                <span className="block text-sm text-slate-500">
                  {formatMonthDay(row.start)}
                  {row.end !== row.start && ` ~ ${formatMonthDay(row.end)}`}
                  {row.kind === 'mine' && ' · 내 일정'}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-base font-bold',
                  row.kind === 'school' ? 'text-slate-700' : 'text-brand',
                )}
              >
                {row.dDay === 0 ? '오늘' : `D-${row.dDay}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 홈에서 처음에 보여 줄 공지 개수. 더 있으면 [n개 더 보기] 를 붙입니다. */
const NOTICE_PREVIEW_COUNT = 5

interface SchoolNoticesSectionProps {
  todayKey: string
}

/**
 * ⑤ 학교 공지. 서버가 학교 홈페이지에서 하루 한 번 받아 둔 가정통신문 · 공지사항 제목입니다. (lib/schoolNotices.ts)
 * 사용자: "학교 공지도 보여주게 해야 되는데", "내가 참여할 대회? 관심있는 대회?" (2026-10-19)
 * NEIS 공개 API 에는 공지가 없어서 서버가 홈페이지를 직접 읽습니다.
 */
function SchoolNoticesSection({ todayKey }: SchoolNoticesSectionProps) {
  return (
    <AsyncBoundary
      pendingFallback={
        <div role="status">
          <span className="sr-only">학교 공지를 불러오는 중이에요</span>
          <Skeleton className="h-40 w-full rounded-3xl" />
        </div>
      }
      errorMessage="학교 공지를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
    >
      <SchoolNoticesView todayKey={todayKey} />
    </AsyncBoundary>
  )
}

/** 화면에 그릴 공지 한 줄 (대회 글인지 · 내가 준비하는 대회인지를 붙임) */
interface NoticeRow extends SchoolNotice {
  isContest: boolean
  isMine: boolean
}

interface SchoolNoticesViewProps {
  todayKey: string
}

function SchoolNoticesView({ todayKey }: SchoolNoticesViewProps) {
  const isServerData = useIsServerData()
  const { data } = useSuspenseQuery(schoolNoticesQuery(isServerData, todayKey))
  // [전체] · [🏆 대회] 중 무엇을 보는지, 더 보기를 펼쳤는지는 주소에 둡니다. (/?notice=contest&noticeMore=open)
  const [noticeParam, setNoticeParam] = useQueryParam('notice', 'all', { replace: true })
  const [moreParam, setMoreParam] = useQueryParam('noticeMore', 'closed', { replace: true })
  // "내가 준비하는 것" 을 대회·자격증으로 골랐으면 그 이름(예: 정보올림피아드)이 들어간 글을 맨 위로 올립니다. (lib/studyFocus.ts)
  const [focusName] = useState(() => {
    const focus = loadStudyFocus()
    return focus?.kind === 'CONTEST' ? focus.name : null
  })

  // 학교를 안 골랐으면 위의 "오늘 학교" 칸이 이미 안내해서, 여기서는 그리지 않습니다.
  if (data.school === null) return null

  const rows: NoticeRow[] = data.notices.map((notice) => {
    const isMine = matchesFocusName(notice.title, focusName)
    // 내가 준비하는 대회·자격증 글은 제목에 '대회' 가 없어도 대회 글로 봅니다. (예: '컴퓨터활용능력 시험 안내')
    return { ...notice, isContest: isMine || isContestNotice(notice.title), isMine }
  })
  // 내 대회 글을 먼저, 나머지는 서버가 준 순서(최근 글 먼저) 그대로 둡니다.
  const sortedRows = [...rows.filter((row) => row.isMine), ...rows.filter((row) => !row.isMine)]
  const contestCount = rows.filter((row) => row.isContest).length
  // 주소는 누구나 고칠 수 있어서, 'contest' 이면서 대회 글이 하나라도 있을 때만 대회 글만 보여 줍니다.
  const isContestOnly = noticeParam === 'contest' && contestCount > 0
  const visibleRows = isContestOnly ? sortedRows.filter((row) => row.isContest) : sortedRows
  const isMoreOpen = moreParam === 'open'
  const shownRows = isMoreOpen ? visibleRows : visibleRows.slice(0, NOTICE_PREVIEW_COUNT)

  return (
    <section className={sectionCardClass}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold text-slate-900">학교 공지</h2>
        {data.isDemo && (
          <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
            시연용 예시
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-1 text-[15px] break-keep text-slate-500">
          {data.fetchedAt === null
            ? '아직 학교 홈페이지에서 공지를 못 가져왔어요. 홈페이지 모양이 달라서 못 읽는 학교일 수도 있어요.'
            : '최근 30일 동안 올라온 공지가 없어요.'}
        </p>
      ) : (
        <>
          {/* 대회 글이 있을 때만 고르는 버튼을 보여 줍니다. (flex-wrap: 좁은 화면에서 넘치면 다음 줄로) */}
          {contestCount > 0 && (
            <div role="group" aria-label="공지 고르기" className="mt-3 flex flex-wrap gap-2">
              <ChipButton selected={!isContestOnly} onClick={() => setNoticeParam('all')}>
                {`전체 ${rows.length}`}
              </ChipButton>
              <ChipButton selected={isContestOnly} onClick={() => setNoticeParam('contest')}>
                {`🏆 대회 ${contestCount}`}
              </ChipButton>
            </div>
          )}

          <ul className="mt-2 flex flex-col gap-1">
            {shownRows.map((row, index) => (
              <NoticeRowItem key={`${row.kind}-${row.date}-${row.title}-${index}`} row={row} />
            ))}
          </ul>

          {visibleRows.length > NOTICE_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setMoreParam(isMoreOpen ? 'closed' : 'open')}
              className="mt-1 h-10 w-full cursor-pointer rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              {isMoreOpen ? '접기' : `${visibleRows.length - NOTICE_PREVIEW_COUNT}개 더 보기`}
            </button>
          )}
        </>
      )}

      <p className="mt-2 text-xs break-keep text-slate-500">
        학교 홈페이지에서 하루 한 번 제목만 가져와요.
      </p>
    </section>
  )
}

interface NoticeRowItemProps {
  row: NoticeRow
}

/** 공지 한 줄: 이모지 · 제목 · 날짜와 게시판. 주소가 있으면 누를 때 학교 홈페이지 글이 새 창으로 열립니다. */
function NoticeRowItem({ row }: NoticeRowItemProps) {
  const icon = row.isContest ? '🏆' : row.kind === '가정통신문' ? '📄' : '📢'
  const content = (
    <>
      <span aria-hidden className={rowIconClass}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[15px] font-semibold break-keep text-slate-900">
          {row.title}
        </span>
        <span className="block text-sm text-slate-500">
          {formatMonthDay(row.date)} · {row.kind}
          {row.isMine && <span className="text-brand font-medium"> · 내가 준비하는 대회</span>}
        </span>
      </span>
      {row.url && (
        <span aria-hidden className="shrink-0 text-slate-400">
          ›
        </span>
      )}
    </>
  )

  return (
    <li>
      {row.url ? (
        // 학교 홈페이지는 우리 앱 밖이라 새 창으로 엽니다. noopener: 열린 창이 우리 화면을 건드리지 못하게 합니다.
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center gap-3 rounded-xl active:bg-slate-50"
        >
          {content}
        </a>
      ) : (
        <div className="flex min-h-14 items-center gap-3">{content}</div>
      )}
    </li>
  )
}

/** 'YYYY-MM-DD' → '11월 2일' */
function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}
