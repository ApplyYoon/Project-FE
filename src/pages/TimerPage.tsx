import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SubjectBadge } from '@/components/ui/SubjectBadge'
import { useStopwatch } from '@/hooks/useStopwatch'
import { useStudySessions } from '@/hooks/useStudySessions'
import { playAlarm } from '@/lib/alarm'
import { cn } from '@/lib/cn'
import { mockSubjects } from '@/lib/mock'
import { BREAK_MINUTES, STUDY_MINUTES, getPomodoroStatus } from '@/lib/pomodoro'
import { loadData, saveData } from '@/lib/storage'
import type { PomodoroPhase, StudySession, Subject, SubjectColor } from '@/types'

// 1분 미만은 실수로 누른 것으로 보고 기록을 저장하지 않습니다.
const MIN_SAVE_SECONDS = 60

// normal: 일반(흐른 시간이 늘어남), pomodoro: 뽀모도로(남은 시간이 줄어듦)
type TimerMode = 'normal' | 'pomodoro'

const modeOptions: { mode: TimerMode; label: string }[] = [
  { mode: 'normal', label: '일반' },
  { mode: 'pomodoro', label: '뽀모도로' },
]

// 초 단위 숫자를 '01:23:45' 형태로 바꿔줍니다.
function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (value: number) => value.toString().padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

// 오늘 하루 공부한 시간(분)을 '2시간 14분' / '40분' 형태로 바꿔줍니다.
function formatTotalMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes}분`
  return `${hours}시간 ${minutes}분`
}

/** 그 기록이 오늘 시작한 기록인지 확인합니다. */
function isToday(session: StudySession) {
  return new Date(session.startedAt).toDateString() === new Date().toDateString()
}

export function TimerPage() {
  // startedAt·pauseCount 는 새로고침해도 이어져야 해서 useStopwatch 안에서 같이 저장합니다.
  const { seconds, isRunning, isStarted, startedAt, pauseCount, start, pause, stop } =
    useStopwatch()
  const { sessions, addSession } = useStudySessions()

  // 계획 화면에서 저장한 과목 목록을 그대로 불러옵니다. (저장된 게 없으면 가짜 데이터)
  const [subjects] = useState<Subject[]>(() => loadData('subjects', mockSubjects))
  // 고른 과목도 저장해 둡니다. 새로고침했는데 과목만 사라지면 "공부 중인데 무슨 과목인지 모르는" 상태가 되기 때문입니다.
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(() =>
    loadData<string | null>('timer-subject', null),
  )

  useEffect(() => {
    saveData('timer-subject', selectedSubjectId)
  }, [selectedSubjectId])

  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId)

  // 일반 모드인지 뽀모도로 모드인지. 새로고침해도 유지되도록 저장합니다.
  const [mode, setMode] = useState<TimerMode>(() =>
    loadData<unknown>('timer-mode', 'normal') === 'pomodoro' ? 'pomodoro' : 'normal',
  )

  useEffect(() => {
    saveData('timer-mode', mode)
  }, [mode])

  const isPomodoro = mode === 'pomodoro'
  // 뽀모도로는 스톱워치가 센 "흐른 시간"으로 지금이 공부인지 휴식인지 계산합니다.
  const pomodoro = getPomodoroStatus(seconds)
  const isBreak = isPomodoro && pomodoro.phase === 'break'
  // 뽀모도로는 남은 시간이 줄어드는 모양으로, 일반은 흐른 시간이 늘어나는 모양으로 보여줍니다.
  const displaySeconds = isPomodoro ? pomodoro.remainingSeconds : seconds

  // 구간이 막 끝났을 때 화면에 띄울 안내입니다. (방금 끝난 게 공부인지 휴식인지 기억해 둡니다)
  const [endedPhase, setEndedPhase] = useState<PomodoroPhase | null>(null)
  // 직전에 확인한 구간 번호. 이 번호와 비교해서 "구간이 바뀌었는지" 알아냅니다.
  const lastPhaseNumber = useRef(pomodoro.phaseNumber)

  useEffect(() => {
    // 구간 번호가 커졌을 때만 = 구간이 방금 끝났을 때만 알립니다.
    // (정지하면 번호가 0 으로 줄어들고, 새로고침 직후에는 번호가 그대로라서 알리지 않습니다.)
    if (isPomodoro && pomodoro.phaseNumber > lastPhaseNumber.current) {
      // 지금이 공부 구간이면 방금 끝난 건 휴식이고, 휴식 구간이면 방금 끝난 건 공부입니다.
      setEndedPhase(pomodoro.phase === 'study' ? 'break' : 'study')
      playAlarm()
    }
    lastPhaseNumber.current = pomodoro.phaseNumber
  }, [isPomodoro, pomodoro.phase, pomodoro.phaseNumber])

  // 시작한 뒤 '정지'를 누르기 전까지는 공부 중입니다. 일시정지 중에도 같은 공부가 이어지는 것이라 포함합니다.
  // (뽀모도로의 휴식 구간도 같은 공부 흐름 안에 있어서 포함합니다.)
  const isStudying = isStarted

  // 오늘 저장된 기록만 모아서 분 단위로 더합니다.
  const todayTotalMinutes = Math.floor(
    sessions
      .filter(isToday)
      .reduce((sum, session) => sum + (session.endedAt - session.startedAt), 0) / 60000,
  )

  // 버튼 아래에 보여줄 안내 문구
  let helpMessage = '준비됐으면 시작을 눌러 주세요.'
  if (!selectedSubject) helpMessage = '공부할 과목을 먼저 골라 주세요.'
  else if (isStudying)
    helpMessage = '공부 중에는 과목과 모드를 바꿀 수 없어요. 바꾸려면 정지를 눌러 주세요.'

  function handleSelectSubject(subjectId: string) {
    // 공부 중에는 과목을 바꾸지 못하게 막습니다. (버튼도 disabled 지만 한 번 더 확인)
    if (isStudying) return
    setSelectedSubjectId(subjectId)
  }

  function handleChangeMode(nextMode: TimerMode) {
    // 공부 중에 모드를 바꾸면 시간이 뒤섞이므로 막습니다. (버튼도 disabled 지만 한 번 더 확인)
    if (isStudying) return
    setMode(nextMode)
  }

  function handleStop() {
    // 1분 미만 공부는 실수로 누른 것으로 보고 저장하지 않습니다.
    if (selectedSubject && startedAt !== null && seconds >= MIN_SAVE_SECONDS) {
      addSession({
        id: `session-${Date.now()}`,
        subjectId: selectedSubject.id,
        startedAt,
        endedAt: Date.now(),
        pauseCount,
      })
    }

    // 정지하면 구간 끝 안내도 함께 지웁니다.
    setEndedPhase(null)
    stop()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">타이머</h1>
        <p className="mt-2 text-slate-600">과목을 고르고 시작하면 공부 시간이 쌓여요.</p>
      </div>

      <Card className="flex flex-col items-center gap-6 py-8 sm:py-10">
        {/* 일반 ↔ 뽀모도로 전환. 공부 중에는 바꿀 수 없습니다. */}
        <div className="flex w-full max-w-xs flex-col gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {modeOptions.map((option) => {
              const isSelected = option.mode === mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isStudying}
                  onClick={() => handleChangeMode(option.mode)}
                  className={cn(
                    'h-10 rounded-md text-sm font-medium transition-colors',
                    'cursor-pointer disabled:cursor-not-allowed',
                    isSelected
                      ? 'text-brand bg-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200 disabled:opacity-50',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          {isPomodoro && (
            <p className="text-center text-sm text-slate-500">
              {STUDY_MINUTES}분 공부 → {BREAK_MINUTES}분 휴식을 반복해요.
            </p>
          )}
        </div>

        {subjects.length === 0 ? (
          <p className="text-sm text-slate-500">
            과목이 없어요. 계획 화면의 &apos;내 과목&apos;에서 먼저 추가해 주세요.
          </p>
        ) : (
          <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-4">
            {subjects.map((subject) => {
              const isSelected = subject.id === selectedSubjectId
              return (
                <button
                  key={subject.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isStudying}
                  onClick={() => handleSelectSubject(subject.id)}
                  className={cn(
                    'h-10 truncate rounded-lg border px-2 text-sm font-medium transition-colors',
                    'cursor-pointer disabled:cursor-not-allowed',
                    isSelected
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
                  )}
                >
                  {subject.name}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* 고른 과목을 타이머 위에 태그로 보여줍니다. */}
          {selectedSubject && (
            <SubjectBadge
              name={selectedSubject.name}
              color={selectedSubject.color}
              className="px-3 py-1 text-sm"
            />
          )}
          {isRunning && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                isBreak ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600',
              )}
            >
              <span
                className={cn('h-2 w-2 rounded-full', isBreak ? 'bg-sky-500' : 'bg-emerald-500')}
              />
              {isBreak ? '휴식 중' : '공부 중'}
            </span>
          )}
        </div>

        {/* 뽀모도로에서 구간이 끝나면 나오는 안내. 소리·진동은 playAlarm 이 따로 냅니다. */}
        {isPomodoro && endedPhase && (
          <div
            role="status"
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800"
          >
            <p>
              {endedPhase === 'study'
                ? `공부 구간이 끝났어요! ${BREAK_MINUTES}분 쉬어 가요.`
                : `휴식이 끝났어요! 다시 ${STUDY_MINUTES}분 집중해 볼까요?`}
            </p>
            <button
              type="button"
              onClick={() => setEndedPhase(null)}
              className="h-10 shrink-0 cursor-pointer rounded-md px-3 hover:bg-amber-100"
            >
              확인
            </button>
          </div>
        )}

        {/* tabular-nums: 숫자가 바뀌어도 폭이 흔들리지 않게 고정 폭으로 보여줍니다. */}
        <p className="font-mono text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
          {formatTime(displaySeconds)}
        </p>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {isRunning ? (
            <Button variant="secondary" size="lg" className="w-full sm:w-40" onClick={pause}>
              일시정지
            </Button>
          ) : (
            // 과목을 안 고르면 시작 버튼을 누를 수 없습니다.
            <Button
              size="lg"
              className="w-full sm:w-40"
              disabled={!selectedSubject}
              onClick={start}
            >
              시작
            </Button>
          )}
          <Button variant="danger" size="lg" className="w-full sm:w-40" onClick={handleStop}>
            정지
          </Button>
        </div>

        <p className="text-center text-sm text-slate-500">{helpMessage}</p>
      </Card>

      <Card title="오늘 총 공부 시간">
        <p className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {formatTotalMinutes(todayTotalMinutes)}
        </p>
      </Card>

      <WeeklySubjectRatio subjects={subjects} sessions={sessions} />
    </div>
  )
}

/* ---------- 이번 주 과목별 공부 시간 비율 (#44) ---------- */

// 막대 색. SubjectBadge 처럼 완성된 클래스 이름을 적어 둡니다. (`bg-${color}-500` 은 Tailwind 가 못 알아봅니다)
const barColorStyles: Record<SubjectColor, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
}

// 분 단위 숫자를 '2시간 14분', '40분' 처럼 바꿔줍니다.
function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

// 이번 주 월요일 0시 0분을 밀리초 숫자로 돌려줍니다.
function getThisMondayStart() {
  const date = new Date()
  // getDay(): 일요일 0, 월요일 1 ... 토요일 6. 월요일에서 며칠 지났는지 계산합니다. (일요일은 6일)
  const daysFromMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysFromMonday)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

interface WeeklySubjectRatioProps {
  subjects: Subject[]
  sessions: StudySession[]
}

function WeeklySubjectRatio({ subjects, sessions }: WeeklySubjectRatioProps) {
  const mondayStart = getThisMondayStart()
  const thisWeekSessions = sessions.filter((session) => session.startedAt >= mondayStart)

  // 과목마다 이번 주에 공부한 시간(분)을 더합니다.
  const rows = subjects
    .map((subject) => {
      let minutes = 0
      for (const session of thisWeekSessions) {
        if (session.subjectId === subject.id) {
          minutes += Math.round((session.endedAt - session.startedAt) / 60000)
        }
      }
      return { subject, minutes }
    })
    .filter((row) => row.minutes > 0)
    // 많이 공부한 과목이 위로 오게 정렬합니다.
    .sort((a, b) => b.minutes - a.minutes)

  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0)

  return (
    <Card title="이번 주 과목별 공부 시간">
      {totalMinutes === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          이번 주 공부 기록이 아직 없어요. 타이머로 공부를 시작해 보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ subject, minutes }) => {
            const percent = Math.round((minutes / totalMinutes) * 100)
            return (
              // 모바일: [과목 태그 + 시간] 한 줄, 그 아래 막대 / PC: [태그 | 막대 | 시간] 한 줄
              <li
                key={subject.id}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
              >
                {/* sm:contents: PC 에서는 이 div 상자를 없는 셈 치고, 안의 태그·시간을 li 에 바로 놓습니다. */}
                <div className="flex items-center justify-between gap-2 sm:contents">
                  <SubjectBadge
                    name={subject.name}
                    color={subject.color}
                    className="max-w-24 sm:w-16 sm:shrink-0"
                  />
                  <span className="shrink-0 text-sm text-slate-600 tabular-nums sm:order-last sm:w-32 sm:text-right">
                    {percent}% · {formatMinutes(minutes)}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn('h-full rounded-full', barColorStyles[subject.color])}
                    // 너비가 숫자에 따라 바뀌어서 Tailwind 클래스로 만들 수 없어 인라인 style 을 씁니다.
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
