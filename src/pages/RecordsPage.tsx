import { useQueryParam } from '@/hooks/useQueryParam'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AiAnalysisCard } from '@/components/ui/AiAnalysisCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SubjectBadge } from '@/components/ui/SubjectBadge'
import { useCards } from '@/hooks/useCards'
import { usePlans } from '@/hooks/usePlans'
import {
  buildCalendarDay,
  DAY_STATUS_INFO,
  DAY_STATUSES,
  getRecentDateKeys,
  groupSessionsByDayKey,
  summarizeRunRate,
  type CalendarDay,
  type DayStatus,
  type RunRateSummary,
} from '@/lib/calendarDay'
import {
  buildCallSummaries,
  loadCheckInsByDate,
  loadEvaluationsByDate,
  type CallSummary,
} from '@/lib/callSummary'
import { CARD_RESULT_LABELS } from '@/lib/cardResult'
import { careThemes } from '@/lib/careTheme'
import { cn } from '@/lib/cn'
import {
  type DailyRecord,
  formatClock,
  formatMinutes,
  groupSessionsByDate,
  isStudySession,
  sessionMinutes,
  toDateKey,
} from '@/lib/dailyRecords'
import { getTodayKey, isDateKey, isMonthKey, toDayDate, toDayKey } from '@/lib/date'
import { useSubjects } from '@/hooks/useSubjects'
import { EMOTION_OPTIONS, isEmotionTag } from '@/lib/quickCheckIn'
import { loadRoutines } from '@/lib/routines'
import { buildCardIdByPlanId } from '@/lib/sessionRecords'
import { loadData, loadRecord } from '@/lib/storage'
import { formatHoursMinutes, getWeeklyStudy } from '@/lib/weeklyStudy'
import type { CareLevel, CheckIn, EmotionTag, StudyPlan, StudySession, Subject } from '@/types'

const weekdayNames = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' 를 '오늘 · 10월 10일 (토)', '어제 · …', '10월 8일 (수)' 처럼 바꿉니다. */
function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const text = `${month}월 ${day}일 (${weekdayNames[date.getDay()]})`

  // 오늘은 하루의 기준(새벽 4시)으로 정합니다. 새벽 2시면 아직 어제입니다. (lib/date.ts)
  const today = toDayDate(Date.now())
  if (dateKey === toDateKey(today)) return `오늘 · ${text}`

  // new Date(년, 월, 일) 은 일이 범위를 넘어가면 달·해를 알아서 넘겨줍니다. (-1 = 어제)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (dateKey === toDateKey(yesterday)) return `어제 · ${text}`

  return text
}

/** 저장해 둔 공부 기록을 불러옵니다. 없으면 빈 목록입니다. (가짜 데이터로 채우지 않습니다) */
function loadSessions(): StudySession[] {
  const saved = loadData<unknown>('sessions', [])
  // 배열이 아니거나 모양이 틀린 기록은 걸러냅니다.
  const sessions: StudySession[] = Array.isArray(saved) ? saved.filter(isStudySession) : []
  // 노는 기록(kind 가 'play')은 공부 기록이 아니라서 이 화면에 보여주지 않습니다. (#238)
  return sessions.filter((session) => session.kind !== 'play')
}

interface SubjectTagProps {
  subject: Subject | undefined
}

/** 과목 태그. 과목을 지워서 찾을 수 없으면 "삭제된 과목" 으로 보여줍니다. */
function SubjectTag({ subject }: SubjectTagProps) {
  if (!subject) {
    return (
      <span className="inline-block max-w-full truncate rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
        삭제된 과목
      </span>
    )
  }
  return <SubjectBadge name={subject.name} color={subject.color} />
}

export function RecordsPage() {
  const navigate = useNavigate()

  // 공부 기록은 타이머가 저장해 둔 것을 읽기만 합니다. 과목은 계획 화면에서 저장한 목록을 씁니다.
  const [sessions] = useState<StudySession[]>(loadSessions)
  const subjects = useSubjects()

  // 최근 날짜가 맨 앞에 오도록 날짜별로 묶습니다.
  const days = groupSessionsByDate(sessions)

  // 지난 통화 요약: 통화에서 나온 값은 체크인에 저장되므로, 체크인을 날짜별로 꺼내 어제 공부 기록과 합칩니다. (#45)
  const { allPlans } = usePlans()
  const [checkIns] = useState(loadCheckInsByDate)
  const [evaluations] = useState(loadEvaluationsByDate)
  const callSummaries = buildCallSummaries(checkIns, allPlans, sessions, evaluations)

  // 달력과 4주 실행률은 카드 결과(실행 · 지연 · 미실행 · 휴식)로 정합니다. (#410, lib/calendarDay.ts)
  const { cards } = useCards()
  // 지금 시각은 화면을 처음 그릴 때 한 번만 읽습니다. (다시 그릴 때마다 바뀌면 결과가 흔들립니다)
  const [now] = useState(Date.now)
  // 옛 계획으로 잰 기록도 그 카드의 기록으로 보려고 "옛 계획 id → 카드 id" 표를 만듭니다. (lib/sessionRecords.ts)
  const [cardIdByPlanId] = useState(() =>
    buildCardIdByPlanId(loadRecord<StudyPlan[]>('plans'), loadRoutines()),
  )
  const sessionsByDay = groupSessionsByDayKey(sessions)

  /** 그 날짜의 달력 하루 (카드마다 결과를 판정하고 칸의 상태를 정함) */
  function getCalendarDay(dateKey: string): CalendarDay {
    return buildCalendarDay({
      dateKey,
      cards,
      sessions: sessionsByDay.get(dateKey) ?? [],
      cardIdByPlanId,
      now,
    })
  }

  // 최근 4주(오늘 포함 28일)의 실행률. 연속 기록(스트릭) 카드 대신 보여줍니다.
  const recentRunRate = summarizeRunRate(getRecentDateKeys(toDayKey(now)).map(getCalendarDay))

  // 지금 펼쳐 둔 날짜. null 이면 전부 접혀 있습니다. 같은 날짜를 다시 누르면 접힙니다.
  const [openDate, setOpenDate] = useState<string | null>(null)

  function handleToggle(date: string) {
    setOpenDate((current) => (current === date ? null : date))
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">기록·통계</h1>

      {/* AI 분석: 최근 28일 기록을 숫자로 묶고(코드), 서버의 AI 가 말로 풀어 줍니다. (#419) */}
      <AiAnalysisCard />

      {/* 최근 4주 실행률 · 최근 7일 막대그래프 · 주간 리포트 카드. 모바일은 한 줄에 하나, PC 는 두 칸으로 카드를 놓습니다. */}
      {/* items-start: 높이가 다른 카드를 억지로 같은 높이로 늘리지 않습니다. (시안처럼) */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <RunRateCard summary={recentRunRate} />
        <WeeklyBarCard sessions={sessions} />

        <Card title="주간 리포트">
          <p className="text-sm text-slate-600">이번 주를 숫자와 발견으로 정리해서 보여줘요.</p>
          <Button
            className="mt-4 w-full sm:w-auto"
            onClick={() => navigate('/analysis?tab=report')}
          >
            주간 리포트 보기
          </Button>
        </Card>
      </div>

      {/* 시안처럼 PC(lg)에서는 두 칸으로 나눕니다. 다른 기록 카드가 생기면 이 안에 이어서 넣으면 됩니다. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <StudyCalendar getDay={getCalendarDay} records={days} checkIns={checkIns} />

        <Card title="날짜별 기록">
          {days.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              아직 공부 기록이 없어요. 타이머로 공부하면 여기에 쌓여요.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {days.map((day) => {
                const isOpen = openDate === day.date
                const panelId = `records-${day.date}`

                return (
                  <li key={day.date}>
                    {/* 날짜 줄 전체가 버튼입니다. min-h-12(48px)라서 손가락으로 누르기 편합니다. */}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => handleToggle(day.date)}
                      className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 py-3 text-left"
                    >
                      {/* min-w-0: 과목이 많아도 줄이 가로로 튀어나가지 않게 합니다. */}
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-sm font-semibold text-slate-900">
                          {formatDateLabel(day.date)}
                        </span>
                        {/* 접혀 있을 때도 과목별 시간이 보입니다. */}
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {day.subjects.map((record) => (
                            // max-w-full: 과목 이름이 아주 길어도 화면 폭을 넘지 않게 해서, 태그의 '...' 줄임이 작동하게 합니다.
                            <span
                              key={record.subjectId}
                              className="inline-flex max-w-full items-center gap-1"
                            >
                              <SubjectTag
                                subject={subjects.find((item) => item.id === record.subjectId)}
                              />
                              <span className="shrink-0 text-xs text-slate-500">
                                {formatMinutes(record.minutes)}
                              </span>
                            </span>
                          ))}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {formatMinutes(day.totalMinutes)}
                        </span>
                        <span aria-hidden className="text-xs text-slate-400">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </span>
                    </button>

                    {/* 펼치면 그날의 과목별 기록(몇 시부터 몇 시까지, 몇 분)이 나옵니다. */}
                    {isOpen && (
                      <div
                        id={panelId}
                        className="mb-3 flex flex-col gap-3 rounded-lg bg-slate-50 p-3"
                      >
                        {day.subjects.map((record) => (
                          <div key={record.subjectId}>
                            <div className="flex items-center justify-between gap-3">
                              <SubjectTag
                                subject={subjects.find((item) => item.id === record.subjectId)}
                              />
                              <span className="shrink-0 text-sm font-semibold text-slate-900">
                                {formatMinutes(record.minutes)}
                              </span>
                            </div>
                            <ul className="mt-2 flex flex-col gap-1">
                              {record.sessions.map((session) => (
                                <li
                                  // id 에 시작 시각을 붙입니다. 저장된 기록의 id 가 겹쳐도 화면이 경고 없이 둘 다 보여줍니다.
                                  key={`${session.id}-${session.startedAt}`}
                                  className="flex items-center justify-between gap-3 text-sm text-slate-600"
                                >
                                  <span>
                                    {formatClock(session.startedAt)} ~{' '}
                                    {formatClock(session.endedAt)}
                                  </span>
                                  <span>{formatMinutes(sessionMinutes(session))}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <CallSummaryCard summaries={callSummaries} />
    </div>
  )
}

// 처음에 보여줄 통화 요약 개수입니다. 더 있으면 "더 보기" 로 펼칩니다.
const INITIAL_SUMMARY_COUNT = 5

/** 관리 강도 이름(색 점 옆에 적는 글자) */
const careLevelNames = ['회복', '당근', '넛지', '심리적 채찍', '강제적 채찍'] as const

/**
 * 그날의 관리 강도를 색 점 + 이름으로 보여줍니다. 색만으로 구분하지 않고 이름도 함께 적습니다.
 * 강도를 저장해 둔 곳이 아직 없어서, 지금은 보통 null(표시 없음)입니다.
 */
function getCareBadge(level: CareLevel | null): { name: string; dotClass: string } | null {
  if (level === null) return null
  // 4(강제적 채찍)는 집중 모드(#69)가 나오기 전이라 색 테마가 없어서 진한 빨강으로 따로 정합니다.
  if (level === 4) return { name: careLevelNames[4], dotClass: 'bg-red-900' }
  return { name: careThemes[level].name, dotClass: careThemes[level].avatarBackground }
}

interface CareBadgeProps {
  level: CareLevel | null
}

/** 관리 강도 색 점 + 이름. 강도를 모르면 아무것도 그리지 않습니다. */
function CareBadge({ level }: CareBadgeProps) {
  const badge = getCareBadge(level)
  if (badge === null) return null

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
      <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', badge.dotClass)} />
      {badge.name}
    </span>
  )
}

interface CallSummaryCardProps {
  summaries: CallSummary[]
}

/** "지난 통화 요약": 날짜별 목록(최근 것이 위)과, 눌렀을 때 그날 카드를 자세히 보는 팝업 */
function CallSummaryCard({ summaries }: CallSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  // 지금 팝업으로 보고 있는 요약. null 이면 팝업이 닫혀 있습니다.
  const [selected, setSelected] = useState<CallSummary | null>(null)

  const visibleSummaries = isExpanded ? summaries : summaries.slice(0, INITIAL_SUMMARY_COUNT)

  return (
    <Card title="지난 통화 요약">
      {summaries.length === 0 ? (
        <p className="py-6 text-center text-sm break-keep text-slate-500">
          아직 통화 요약이 없어요. 매일 체크인을 하면 여기에 쌓여요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visibleSummaries.map((summary) => (
            <li key={summary.date}>
              {/* 줄 전체가 버튼입니다. min-h-12(48px)라서 손가락으로 누르기 편합니다. */}
              <button
                type="button"
                onClick={() => setSelected(summary)}
                className="flex min-h-12 w-full cursor-pointer flex-col gap-1 py-3 text-left"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  {formatDateLabel(summary.date)}
                  <CareBadge level={summary.careLevel} />
                </span>
                {/* break-words: 긴 문장도 화면 폭을 넘지 않고 줄바꿈됩니다. */}
                <span className="text-sm font-semibold break-words text-slate-900">
                  {summary.headline}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {summaries.length > INITIAL_SUMMARY_COUNT && (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? '접기' : `더 보기 (${summaries.length - INITIAL_SUMMARY_COUNT}개)`}
        </Button>
      )}

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${formatDateLabel(selected.date)} 통화 요약` : undefined}
      >
        {selected && (
          <dl className="flex flex-col gap-3">
            <CareBadge level={selected.careLevel} />
            <SummaryRow label="어제 요약" value={selected.headline} />
            <SummaryRow label="미달 원인" value={selected.missReason} emptyText="고르지 않았어요" />
            <SummaryRow label="AI 한마디" value={selected.aiComment} emptyText="아직 없어요" />
          </dl>
        )}
      </Modal>
    </Card>
  )
}

interface SummaryRowProps {
  label: string
  /** 보여줄 내용. null 이면 emptyText 를 흐린 글씨로 보여줍니다. */
  value: string | null
  emptyText?: string
}

/** 팝업 안의 "이름 / 내용" 한 줄 */
function SummaryRow({ label, value, emptyText }: SummaryRowProps) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn('mt-0.5 text-sm break-words', value ? 'text-slate-900' : 'text-slate-400')}>
        {value ?? emptyText}
      </dd>
    </div>
  )
}

/**
 * 상태별 색. 네 상태를 모두 같은 진하기(100)로 칠해서, 잘 된 날이 더 크게 보이지 않게 합니다.
 * 색만으로 구분하지 않도록 모양(○ △ ✕ −)과 글자를 꼭 같이 씁니다. (lib/calendarDay.ts 의 DAY_STATUS_INFO)
 */
const statusColors: Record<DayStatus, string> = {
  done: 'bg-emerald-100 text-emerald-800',
  late: 'bg-amber-100 text-amber-800',
  missed: 'bg-rose-100 text-rose-800',
  rest: 'bg-sky-100 text-sky-800',
}

interface StatusBadgeProps {
  status: DayStatus
  /** 상태 이름 대신 보일 글자 (예: '늦게 시작했어요'). 없으면 상태 이름 */
  text?: string
}

/** 상태 배지: 색 + 모양 + 글자 */
function StatusBadge({ status, text }: StatusBadgeProps) {
  const info = DAY_STATUS_INFO[status]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        statusColors[status],
      )}
    >
      <span aria-hidden>{info.symbol}</span>
      {text ?? info.label}
    </span>
  )
}

interface RunRateCardProps {
  summary: RunRateSummary
}

/**
 * 최근 4주 실행률 카드. 연속 기록(스트릭) 카드를 대신합니다. (#410)
 * 스트릭은 성공한 날만 기억하게 만들어서, 잘 된 날과 안 된 날을 같은 크기로 같이 보여줍니다.
 */
function RunRateCard({ summary }: RunRateCardProps) {
  const percent = summary.rate === null ? null : Math.round(summary.rate * 100)

  return (
    <Card>
      {/* flex-wrap: 375px 에서 카드 수가 길어지면 제목 아래 줄로 내려갑니다. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-slate-900">최근 4주 실행률</h3>
        {summary.cardCount > 0 && (
          <p className="text-sm text-slate-500">카드 {summary.cardCount}장</p>
        )}
      </div>

      {percent === null ? (
        <p className="mt-3 text-sm break-keep text-slate-500">
          아직 결과가 나온 카드가 없어요. 카드를 하면 계획한 시간 중 실제로 한 비율이 여기에 보여요.
        </p>
      ) : (
        <>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{percent}%</p>
          <ProgressBar value={percent} className="mt-2" />
          <p className="mt-2 text-sm break-keep text-slate-500">
            계획한 시간 중 실제로 한 비율이에요. 휴식한 날은 빼고 셉니다.
          </p>
        </>
      )}

      {/* 상태별 날 수. 네 칸을 같은 크기로 놓습니다. grid-cols-4: 375px 에서도 한 줄 */}
      <ul className="mt-4 grid grid-cols-4 gap-2">
        {DAY_STATUSES.map((status) => (
          <li
            key={status}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg py-2 text-xs font-semibold',
              statusColors[status],
            )}
          >
            <span>
              <span aria-hidden>{DAY_STATUS_INFO[status].symbol}</span>{' '}
              {DAY_STATUS_INFO[status].label}
            </span>
            <span className="text-sm tabular-nums">{summary.dayCounts[status]}일</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

interface WeeklyBarCardProps {
  sessions: StudySession[]
}

/** 최근 7일 공부 시간을 막대그래프로 보여주는 카드. 차트 라이브러리 없이 div + Tailwind 로 만듭니다. (#41) */
function WeeklyBarCard({ sessions }: WeeklyBarCardProps) {
  const { days, totalMinutes } = getWeeklyStudy(sessions)

  return (
    <Card>
      {/* flex-wrap: 375px 에서 합계가 길어지면 제목 아래 줄로 내려갑니다. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-slate-900">최근 7일 공부 시간</h3>
        <p className="text-sm text-slate-500">
          합계 {totalMinutes === 0 ? '0분' : formatMinutes(totalMinutes)}
        </p>
      </div>

      {/* grid-cols-7: 폭이 좁아도 막대 7개를 같은 폭으로 한 줄에 놓습니다. (가로 스크롤 없음) */}
      {/* pt-6: 가장 높은 막대 위에 붙는 시간 글자가 제목과 겹치지 않게 자리를 비워 둡니다. */}
      <ul className="mt-4 grid grid-cols-7 gap-2 pt-6">
        {days.map((day) => (
          <li key={day.date} className="flex flex-col items-center gap-2">
            {/* 화면에 보이는 막대·글자는 스크린리더가 따로따로 읽으면 알아듣기 어려워서, 하루를 한 문장으로 읽어 줍니다. */}
            <span className="sr-only">
              {weekdayNames[day.weekday]}요일{day.isToday ? '(오늘)' : ''}{' '}
              {day.minutes === 0 ? '공부 기록 없음' : formatMinutes(day.minutes)}
            </span>

            {/* 막대가 서는 자리. 높이 160px 이고, 막대 높이는 이 안에서의 비율(%)입니다. 넓은 화면에서는 막대가 너무 뚱뚱해지지 않게 40px 까지만. */}
            <div aria-hidden className="relative h-40 w-full max-w-10">
              {/* style 을 쓰는 이유: 높이가 계산해서 나온 비율(%)이라 Tailwind 클래스(h-1/2 같은)로 미리 적어 둘 수 없습니다. (이슈 #41 의 인라인 style 예외) */}
              {/* min-h-0.5: 공부한 날은 아주 짧아도 막대가 2px 은 보이게 합니다. 0분인 날은 막대가 없습니다. */}
              <div
                className={cn(
                  'absolute inset-x-0 bottom-0 rounded-t-md',
                  // 오늘은 아직 끝나지 않은 날이라 연한 색으로 구분합니다.
                  day.isToday ? 'bg-indigo-300' : 'bg-brand',
                  day.minutes > 0 && 'min-h-0.5',
                )}
                style={{ height: `${day.percent}%` }}
              >
                {/* bottom-full: 막대의 바로 위에 붙입니다. tabular-nums: 숫자 폭을 같게 해서 글자가 흔들리지 않게 합니다. */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1 text-xs whitespace-nowrap text-slate-600 tabular-nums">
                  {formatHoursMinutes(day.minutes)}
                </span>
              </div>
            </div>

            <span
              aria-hidden
              className={cn('text-sm', day.isToday ? 'text-brand font-bold' : 'text-slate-600')}
            >
              {weekdayNames[day.weekday]}
            </span>
          </li>
        ))}
      </ul>

      {/* break-keep: 375px 에서 한글이 단어 중간("중이/에요")에서 끊기지 않게 합니다. */}
      <p className="mt-4 text-sm break-keep text-slate-500">
        {totalMinutes === 0
          ? '최근 7일 동안 공부 기록이 없어요. 타이머로 공부하면 막대가 생겨요.'
          : '연한 막대가 오늘이에요. 오늘은 아직 진행 중이에요.'}
      </p>
    </Card>
  )
}

interface StudyCalendarProps {
  /** 그 날짜의 달력 하루 (카드 결과로 정한 상태) */
  getDay: (dateKey: string) => CalendarDay
  /** 날짜별 공부 기록. 그날 순공 시간을 보여줄 때 씁니다 */
  records: DailyRecord[]
  /** 날짜별 체크인. 그날 고른 감정 태그를 보여줄 때 씁니다 (#387) */
  checkIns: Record<string, CheckIn>
}

/**
 * 한 달 달력. 날마다 실행 · 지연 · 미실행 · 휴식을 같은 크기의 칸으로 칠하고,
 * 날짜를 누르면 그날 카드 결과와 사유, 감정 태그를 아래에 보여줍니다. (#410)
 */
function StudyCalendar({ getDay, records, checkIns }: StudyCalendarProps) {
  const todayKey = getTodayKey()

  // 고른 날짜와 보고 있는 달은 주소에 둡니다. (/analysis?date=2026-10-01 , /analysis?month=2026-09)
  // 새로고침해도 보던 날이 그대로이고, 주소를 보내면 같은 날의 기록이 열립니다.
  // replace: 날짜를 여러 번 눌러도 뒤로 가기 한 번이면 기록 화면을 떠납니다.
  const [dateParam, setDateParam] = useQueryParam('date', todayKey, { replace: true })
  // 주소는 누구나 고칠 수 있어서, 진짜 날짜가 아니면 오늘로 봅니다.
  const pickedDate = isDateKey(dateParam) ? dateParam : todayKey

  // 보고 있는 달 'YYYY-MM'. 주소에 없으면 고른 날짜가 들어 있는 달입니다. ('2026-10-01' 의 앞 7글자 = '2026-10')
  const [monthParam, setMonthParam] = useQueryParam('month', pickedDate.slice(0, 7), {
    replace: true,
  })
  const monthKey = isMonthKey(monthParam) ? monthParam : pickedDate.slice(0, 7)
  // month 는 0(1월) ~ 11(12월) 입니다. (Date 의 규칙과 같습니다)
  const view = { year: Number(monthKey.slice(0, 4)), month: Number(monthKey.slice(5, 7)) - 1 }

  // 고른 날짜가 지금 보고 있는 달에 있을 때만 "고른 날" 로 보여줍니다. 다른 달로 넘기면 아무 날도 고르지 않은 모양이 됩니다.
  const selectedDate = pickedDate.startsWith(monthKey) ? pickedDate : null

  // 날짜로 그날 공부 기록을 바로 찾을 수 있게 Map 으로 바꿔 둡니다.
  const recordByDate = new Map(records.map((record) => [record.date, record]))

  // 그 달 1일의 요일(0=일요일) 만큼 앞을 빈칸으로 채웁니다.
  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  // 다음 달의 0일 = 이번 달의 마지막 날입니다.
  const lastDay = new Date(view.year, view.month + 1, 0).getDate()

  // 빈칸은 null, 날짜는 'YYYY-MM-DD' 로 칸 목록을 만듭니다.
  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= lastDay; day++) {
    cells.push(toDateKey(new Date(view.year, view.month, day)))
  }

  /** step 이 -1 이면 이전 달, 1 이면 다음 달로 갑니다. */
  function handleMoveMonth(step: number) {
    // new Date 가 13월·0월 같은 값을 알아서 다음 해·이전 해로 넘겨줍니다.
    const next = new Date(view.year, view.month + step, 1)
    // 'YYYY-MM' 모양으로 주소에 적습니다. 고른 날짜는 그대로 두지만, 다른 달이라 화면에서는 고르지 않은 모양이 됩니다.
    setMonthParam(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  function handleSelectDate(date: string) {
    setDateParam(date)
  }

  // 고른 날의 감정 태그. 저장된 값이 깨져 있어도 멈추지 않게 아는 태그만 남깁니다.
  const selectedEmotions = selectedDate
    ? (checkIns[selectedDate]?.emotions ?? []).filter(isEmotionTag)
    : []

  return (
    // p-3: 375px 화면에서 달력 칸(7칸)이 40px 보다 작아지지 않게 모바일에서는 안쪽 여백을 줄입니다.
    <Card className="p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          {view.year}년 {view.month + 1}월
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => handleMoveMonth(-1)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            ◀
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => handleMoveMonth(1)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 요일 줄 */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {weekdayNames.map((name) => (
          <span key={name} className="py-1 text-center text-xs text-slate-500">
            {name}
          </span>
        ))}
      </div>

      {/* 날짜 칸. aspect-square 로 칸 폭만큼 높이를 맞춰서, 화면이 좁아지면 칸도 같이 작아집니다. 네 상태 모두 같은 크기입니다. */}
      <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((date, index) => {
          if (date === null) return <span key={`blank-${index}`} aria-hidden />

          const status = getDay(date).status
          const day = Number(date.slice(8))
          const label = `${view.month + 1}월 ${day}일, ${status ? DAY_STATUS_INFO[status].label : '카드 결과 없음'}`

          return (
            <button
              key={date}
              type="button"
              aria-label={label}
              aria-pressed={selectedDate === date}
              onClick={() => handleSelectDate(date)}
              className={cn(
                'flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-semibold transition-colors',
                status
                  ? cn(statusColors[status], 'hover:opacity-80')
                  : 'text-slate-400 hover:bg-slate-100',
                // 오늘은 진한 테두리로 표시합니다.
                date === todayKey && 'border-2 border-slate-900',
                // 누른 날짜는 바깥쪽 고리로 표시합니다.
                selectedDate === date && 'ring-brand ring-2 ring-offset-2',
              )}
            >
              <span>{day}</span>
              {/* 둘째 줄: 모바일은 모양(○ △ ✕ −), 넓은 화면은 글자. 상태가 없는 날도 자리를 비워 둬서 숫자 위치가 같습니다. */}
              <span aria-hidden className="h-3 text-xs leading-none font-medium">
                {status && (
                  <>
                    <span className="sm:hidden">{DAY_STATUS_INFO[status].symbol}</span>
                    <span className="hidden sm:inline">{DAY_STATUS_INFO[status].label}</span>
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* 색 · 모양 설명 */}
      <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
        {DAY_STATUSES.map((status) => (
          <li key={status} className="flex items-center gap-1 text-xs text-slate-600">
            <span
              aria-hidden
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-sm leading-none',
                statusColors[status],
              )}
            >
              {DAY_STATUS_INFO[status].symbol}
            </span>
            {DAY_STATUS_INFO[status].label}
          </li>
        ))}
      </ul>

      {/* 누른 날짜의 카드 결과. aria-live: 화면 낭독기가 바뀐 내용을 읽어줍니다. */}
      <div aria-live="polite">
        {selectedDate && (
          <CalendarDayDetail
            day={getDay(selectedDate)}
            studyMinutes={recordByDate.get(selectedDate)?.totalMinutes}
            emotions={selectedEmotions}
          />
        )}
      </div>
    </Card>
  )
}

interface CalendarDayDetailProps {
  day: CalendarDay
  /** 그날 순공 시간(분). 공부 기록이 없으면 undefined */
  studyMinutes: number | undefined
  /** 그날 고른 감정 태그 */
  emotions: EmotionTag[]
}

/** 달력에서 누른 날: 상태 · 감정 태그 · 순공 · 카드마다 결과와 사유 */
function CalendarDayDetail({ day, studyMinutes, emotions }: CalendarDayDetailProps) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{formatDateLabel(day.dateKey)}</span>
        {day.status && <StatusBadge status={day.status} />}
      </div>

      {/* 하루 첫 한 줄에서 고른 감정 태그 (#387). 안 골랐으면 줄을 비웁니다. */}
      {emotions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">감정</span>
          {emotions.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
            >
              {EMOTION_OPTIONS.find((option) => option.tag === tag)?.label}
            </span>
          ))}
        </div>
      )}

      {studyMinutes !== undefined && (
        <p className="text-xs text-slate-500">이날 순공 {formatMinutes(studyMinutes)}</p>
      )}

      {day.cards.length === 0 ? (
        <p className="text-sm break-keep text-slate-500">
          {day.pendingCount > 0
            ? '카드 시간이 끝나면 결과가 보여요.'
            : '이날은 결과를 볼 카드가 없어요.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {day.cards.map((item) => (
            <li key={item.card.id} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              {/* 카드 이름과 결과. 좁은 화면에서는 결과가 아래 줄로 내려갑니다. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-sm font-semibold break-words text-slate-900">
                  {item.card.title}
                </span>
                <StatusBadge status={item.status} text={CARD_RESULT_LABELS[item.result]} />
              </div>
              {/* 휴식한 카드는 집계에서 빠지므로 실행률을 보여주지 않습니다. */}
              {item.status !== 'rest' && (
                <p className="mt-1 text-xs text-slate-500">
                  {item.card.startTime ?? '시간 미정'} · {formatMinutes(item.card.durationMinutes)}{' '}
                  · 실행률 {Math.round(item.runRate * 100)}% · 체크리스트 {item.checkedCount}/
                  {item.card.checklist.length}
                </p>
              )}
              {item.reasons.length > 0 && (
                <p className="mt-1 text-sm break-keep text-slate-700">{item.reasons.join(' · ')}</p>
              )}
            </li>
          ))}
          {day.pendingCount > 0 && (
            <li className="text-xs text-slate-500">
              아직 결과가 나오지 않은 카드 {day.pendingCount}장
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
