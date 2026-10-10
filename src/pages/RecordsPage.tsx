import { Card } from '@/components/ui/Card'
import { SubjectBadge } from '@/components/ui/SubjectBadge'
import { cn } from '@/lib/cn'
import {
  formatClock,
  formatMinutes,
  groupSessionsByDate,
  isStudySession,
  sessionMinutes,
  toDateKey,
} from '@/lib/dailyRecords'
import { mockSubjects } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import { getStudyStreak, hasStudiedToday } from '@/lib/streak'
import { formatHoursMinutes, getWeeklyStudy } from '@/lib/weeklyStudy'
import type { StudySession, Subject } from '@/types'
import { useState } from 'react'

const weekdayNames = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' 를 '오늘 · 10월 10일 (토)', '어제 · …', '10월 8일 (수)' 처럼 바꿉니다. */
function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const text = `${month}월 ${day}일 (${weekdayNames[date.getDay()]})`

  const today = new Date()
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
  return Array.isArray(saved) ? saved.filter(isStudySession) : []
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
  // 공부 기록은 타이머가 저장해 둔 것을 읽기만 합니다. 과목은 계획 화면에서 저장한 목록을 씁니다.
  const [sessions] = useState<StudySession[]>(loadSessions)
  const [subjects] = useState<Subject[]>(() => loadData('subjects', mockSubjects))

  // 최근 날짜가 맨 앞에 오도록 날짜별로 묶습니다.
  const days = groupSessionsByDate(sessions)

  // 지금 펼쳐 둔 날짜. null 이면 전부 접혀 있습니다. 같은 날짜를 다시 누르면 접힙니다.
  const [openDate, setOpenDate] = useState<string | null>(null)

  function handleToggle(date: string) {
    setOpenDate((current) => (current === date ? null : date))
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">기록·통계</h1>
      {/* 연속 공부일 카드와 최근 7일 막대그래프. 모바일은 한 줄에 하나, PC 는 두 칸으로 카드를 놓습니다. */}
      {/* items-start: 높이가 다른 두 카드를 억지로 같은 높이로 늘리지 않습니다. (시안처럼) */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <StreakCard sessions={sessions} />
        <WeeklyBarCard sessions={sessions} />
      </div>

      {/* 시안처럼 PC(lg)에서는 두 칸으로 나눕니다. 다른 기록 카드가 생기면 이 안에 이어서 넣으면 됩니다. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
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
    </div>
  )
}

interface StreakCardProps {
  sessions: StudySession[]
}

/** "🔥 5일째 연속 공부 중" 을 보여주는 카드 */
function StreakCard({ sessions }: StreakCardProps) {
  const streak = getStudyStreak(sessions)
  const studiedToday = hasStudiedToday(sessions)

  // 상황에 따라 아래 작은 글씨를 바꿉니다.
  let message = '오늘 공부하면 1일째가 돼요'
  if (streak > 0 && studiedToday) {
    message = '오늘도 공부 완료! 내일도 이어가요'
  } else if (streak > 0) {
    message = `오늘도 하면 ${streak + 1}일째`
  }

  return (
    <Card className="flex items-center gap-4">
      <div
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-2xl"
      >
        🔥
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 sm:text-2xl">
          {streak > 0 ? `${streak}일째 연속 공부 중` : '아직 연속 기록이 없어요'}
        </p>
        <p className="mt-1 text-sm text-slate-500">{message}</p>
      </div>
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
