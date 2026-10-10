import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SubjectBadge } from '@/components/ui/SubjectBadge'
import { useStopwatch } from '@/hooks/useStopwatch'
import { cn } from '@/lib/cn'
import { mockSubjects } from '@/lib/mock'
import { loadData, saveData } from '@/lib/storage'
import type { Subject } from '@/types'

// 초 단위 숫자를 '01:23:45' 형태로 바꿔줍니다.
function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (value: number) => value.toString().padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function TimerPage() {
  const { seconds, isRunning, isStarted, start, pause, stop } = useStopwatch()

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

  // 시작한 뒤 '정지'를 누르기 전까지는 공부 중입니다. 일시정지 중에도 같은 공부가 이어지는 것이라 포함합니다.
  const isStudying = isStarted

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
    </div>
  )
}
