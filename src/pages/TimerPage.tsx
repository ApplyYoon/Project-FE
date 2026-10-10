import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SubjectBadge } from '@/components/ui/SubjectBadge'
import { useStopwatch } from '@/hooks/useStopwatch'
import { cn } from '@/lib/cn'
import { mockSessions, mockSubjects } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import type { StudySession, Subject, SubjectColor } from '@/types'

// 초 단위 숫자를 '01:23:45' 형태로 바꿔줍니다.
function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (value: number) => value.toString().padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function TimerPage() {
  const { seconds, isRunning, start, pause, stop } = useStopwatch()

  // 계획 화면에서 저장한 과목 목록을 그대로 불러옵니다. (저장된 게 없으면 가짜 데이터)
  const [subjects] = useState<Subject[]>(() => loadData('subjects', mockSubjects))
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)

  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId)

  // 시작한 뒤 '정지'를 누르기 전까지는 공부 중입니다. 일시정지 중에도 같은 공부가 이어지는 것이라 포함합니다.
  const isStudying = isRunning || seconds > 0

  // 버튼 아래에 보여줄 안내 문구
  let helpMessage = '준비됐으면 시작을 눌러 주세요.'
  if (!selectedSubject) helpMessage = '공부할 과목을 먼저 골라 주세요.'
  else if (isStudying)
    helpMessage = '공부 중에는 과목을 바꿀 수 없어요. 바꾸려면 정지를 눌러 주세요.'

  function handleSelectSubject(subjectId: string) {
    // 공부 중에는 과목을 바꾸지 못하게 막습니다. (버튼도 disabled 지만 한 번 더 확인)
    if (isStudying) return
    setSelectedSubjectId(subjectId)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">타이머</h1>
        <p className="mt-2 text-slate-600">과목을 고르고 시작하면 공부 시간이 쌓여요.</p>
      </div>

      <Card className="flex flex-col items-center gap-6 py-8 sm:py-10">
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              공부 중
            </span>
          )}
        </div>

        {/* tabular-nums: 숫자가 바뀌어도 폭이 흔들리지 않게 고정 폭으로 보여줍니다. */}
        <p className="font-mono text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
          {formatTime(seconds)}
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
          <Button variant="danger" size="lg" className="w-full sm:w-40" onClick={stop}>
            정지
          </Button>
        </div>

        <p className="text-center text-sm text-slate-500">{helpMessage}</p>
      </Card>

      <WeeklySubjectRatio subjects={subjects} />
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
}

function WeeklySubjectRatio({ subjects }: WeeklySubjectRatioProps) {
  // 저장된 공부 기록을 불러옵니다. (#20 에서 저장 기능이 생기기 전까지는 가짜 데이터)
  const [sessions] = useState<StudySession[]>(() => loadData('sessions', mockSessions))

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
