import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useFixedBlocks } from '@/hooks/useFixedBlocks'
import { cn } from '@/lib/cn'
import { FIXED_BLOCK_TITLE_MAX_LENGTH, validateFixedBlock } from '@/lib/fixedBlocks'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { WEEKDAY_ORDER, formatWeekdays, getWeekdayName } from '@/lib/routines'
import { getSleepWindow } from '@/lib/scheduleCheck'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

/**
 * 고정 일정 입력 화면 (최종 기획서 「4.3 카드」, #393) — /cards/fixed
 * 학교·학원처럼 요일마다 정해진 시간을 넣습니다. 카드가 아니라서 타이머가 없고,
 * 카드를 저장할 때 10분 버퍼를 확인하는 데 씁니다.
 */
export function FixedBlocksPage() {
  const { blocks, addBlock, deleteBlock } = useFixedBlocks()
  // 수면 보호 시간은 온보딩에서 답한 취침 · 기상 시각으로 만듭니다. (화면을 열 때 한 번만 읽습니다)
  const [sleepWindow] = useState(() => {
    const answers = loadOnboardingAnswers()
    return getSleepWindow(answers?.sleepTime, answers?.wakeUpTime)
  })

  const [title, setTitle] = useState('')
  const [repeatDays, setRepeatDays] = useState<number[]>([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  // 추가를 한 번 눌러 본 뒤부터 틀린 칸을 빨갛게 보여 줍니다.
  const [triedAdd, setTriedAdd] = useState(false)

  const errors = validateFixedBlock({ title, repeatDays, startTime, endTime })
  const shownErrors = triedAdd ? errors : {}

  function handleToggleWeekday(weekday: number) {
    setRepeatDays((prev) =>
      prev.includes(weekday) ? prev.filter((day) => day !== weekday) : [...prev, weekday],
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTriedAdd(true)
    if (Object.keys(errors).length > 0) return

    addBlock({
      id: `fixed-${Date.now()}`,
      title: title.trim(),
      repeatDays: [...repeatDays].sort((a, b) => a - b),
      startTime,
      endTime,
      createdAt: Date.now(),
    })
    // 다음 일정을 바로 넣을 수 있게 폼을 비웁니다.
    setTitle('')
    setRepeatDays([])
    setStartTime('')
    setEndTime('')
    setTriedAdd(false)
  }

  // 시작 시각 순서로 보여 줍니다.
  const sortedBlocks = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link to="/cards" className="inline-flex h-10 items-center text-sm text-slate-500">
          ← 카드
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">고정 일정</h1>
        <p className="mt-2 text-sm break-keep text-slate-600">
          학교·학원처럼 요일마다 정해진 시간이에요. 카드가 아니라서 타이머가 없고, 의지력·순공
          계산에도 들어가지 않아요.
        </p>
      </div>

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm break-keep text-slate-600">
        수면 보호 시간 <strong className="text-slate-900">{sleepWindow.label}</strong> · 이 시간에는
        카드를 넣을 수 없어요. (최소 6시간)
      </p>

      <Card title="내 고정 일정">
        {sortedBlocks.length === 0 ? (
          <p className="text-sm text-slate-500">
            아직 없어요. 아래에서 학교·학원 시간을 넣어 주세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedBlocks.map((block) => (
              // 고정 일정은 회색 블록으로 보여 줍니다. (「4.3」 타임라인 규칙)
              <li
                key={block.id}
                className="flex min-h-10 items-center gap-3 rounded-lg bg-slate-100 py-1 pr-1 pl-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-700">{block.title}</span>
                  <span className="block text-xs text-slate-500">
                    {formatWeekdays(block.repeatDays)} · {block.startTime}~{block.endTime}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => deleteBlock(block.id)}
                  aria-label={`${block.title} 지우기`}
                  className="w-10 shrink-0 px-0 text-slate-400"
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="고정 일정 넣기">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <Input
            id="fixed-title"
            label="무슨 일정인가요?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={FIXED_BLOCK_TITLE_MAX_LENGTH}
            placeholder="예: 수학 학원"
            error={shownErrors.title}
          />

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">요일</p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_ORDER.map((weekday) => (
                <button
                  key={weekday}
                  type="button"
                  aria-pressed={repeatDays.includes(weekday)}
                  onClick={() => handleToggleWeekday(weekday)}
                  className={cn(
                    'h-10 cursor-pointer rounded-lg border text-sm font-medium transition-colors',
                    repeatDays.includes(weekday)
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300',
                  )}
                >
                  {getWeekdayName(weekday)}
                </button>
              ))}
            </div>
            {shownErrors.repeatDays && (
              <p className="text-xs text-red-600">{shownErrors.repeatDays}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="fixed-start"
                type="time"
                label="시작"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
              <Input
                id="fixed-end"
                type="time"
                label="끝"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
            {shownErrors.time && <p className="text-xs text-red-600">{shownErrors.time}</p>}
          </div>

          <Button type="submit" className="w-full sm:w-auto sm:self-end">
            + 고정 일정 넣기
          </Button>
        </form>
      </Card>

      <p className="text-xs break-keep text-slate-500">
        구글 캘린더에서 가져오기는 다음 버전에 생겨요.
      </p>
    </div>
  )
}
