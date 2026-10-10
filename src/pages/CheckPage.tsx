import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useCheckIns } from '@/hooks/useCheckIns'
import { usePlans } from '@/hooks/usePlans'
import { cn } from '@/lib/cn'
import { moveDateKey, toDateKey } from '@/lib/date'
import { mockSessions } from '@/lib/mock'
import type { CheckIn } from '@/types'
import { useState } from 'react'

/** 컨디션 버튼에 쓰는 숫자 (1 최악 ~ 5 최고) */
const CONDITION_OPTIONS = [1, 2, 3, 4, 5]

/** 기분 버튼. 이모지 + 한국어 설명으로 보여줍니다. */
const MOOD_OPTIONS = [
  { value: 1, emoji: '😞', label: '많이 처짐' },
  { value: 2, emoji: '🙁', label: '처짐' },
  { value: 3, emoji: '😐', label: '보통' },
  { value: 4, emoji: '🙂', label: '좋음' },
  { value: 5, emoji: '😄', label: '아주 좋음' },
]

/** 오늘 예상 순공시간 버튼. 분 단위로 저장합니다. */
const EXPECTED_MINUTES_OPTIONS = [
  { minutes: 60, label: '1시간' },
  { minutes: 120, label: '2시간' },
  { minutes: 180, label: '3시간' },
  { minutes: 240, label: '4시간' },
  { minutes: 300, label: '5시간+' },
]

/** 체크인을 시작할 때 버튼이 기본으로 가리킬 값 (가운데 값으로 시작해서 그대로 눌러도 30초 안에 끝나게 합니다) */
const DEFAULT_CONDITION = 3
const DEFAULT_MOOD = 3
const DEFAULT_EXPECTED_MINUTES = 120

/*
 * 컨디션·기분·예상시간 버튼의 공통 모양입니다. (TimerPage 의 과목 선택 버튼과 같은 느낌으로 맞췄습니다)
 * 고를 때 살짝 커지고(scale) 그림자가 생겨서, 눌렀다는 게 손끝으로 느껴지게 했습니다.
 */
const CHIP_BASE =
  'flex min-h-10 min-w-0 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold shadow-sm transition-all duration-150 active:scale-95'
const CHIP_SELECTED = 'border-brand bg-brand-light text-brand scale-105 shadow-md'
const CHIP_UNSELECTED =
  'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md'

/** 분을 "3시간 10분" 처럼 보여줍니다. 60분 미만이면 "분"만, 딱 떨어지면 "시간"만 보여줍니다. */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** 어제 달성률에 맞춰 짧은 응원 한마디를 보여줍니다. (계획이 없던 날은 달성률 대신 안내만 합니다) */
function getEncouragement(targetMinutes: number, rate: number): string {
  if (targetMinutes === 0) return '어제는 계획이 없었어요. 오늘부터 다시 시작해 봐요 🙂'
  if (rate >= 100) return '어제 계획을 다 채웠어요! 최고예요 🎉'
  if (rate >= 70) return '거의 다 왔어요, 잘하고 있어요 👏'
  if (rate >= 40) return '절반 넘게 해냈어요, 오늘은 조금만 더 해봐요 💪'
  return '오늘은 다르게 가 봐요, 할 수 있어요 🌱'
}

export function CheckPage() {
  const todayKey = toDateKey(new Date())
  const yesterdayKey = moveDateKey(todayKey, -1)

  const { getCheckIn, saveCheckIn } = useCheckIns()
  const { getPlans } = usePlans()

  const existingCheckIn = getCheckIn(todayKey)
  const isCheckedInToday = existingCheckIn !== undefined

  // 이미 체크인한 날이면 그 값을 보여 줘서 고칠 수 있게 하고, 처음이면 가운데 기본값으로 시작합니다.
  const [condition, setCondition] = useState(existingCheckIn?.condition ?? DEFAULT_CONDITION)
  const [mood, setMood] = useState(existingCheckIn?.mood ?? DEFAULT_MOOD)
  const [expectedMinutes, setExpectedMinutes] = useState(
    existingCheckIn?.expectedMinutes ?? DEFAULT_EXPECTED_MINUTES,
  )

  // 어제 계획 달성률 = 어제 실제로 공부한 시간 ÷ 어제 계획한 목표 시간
  const yesterdayPlans = getPlans(yesterdayKey)
  const targetMinutes = yesterdayPlans.reduce((sum, plan) => sum + plan.targetMinutes, 0)

  // 실제 공부 기록 저장(#20)은 아직 develop 에 머지되지 않아서, 지금은 예시 기록(mockSessions)으로 계산합니다.
  // #20 이 머지되면 이 부분을 실제 기록을 불러오는 코드로 바꿔야 합니다.
  const actualMinutes = Math.round(
    mockSessions
      .filter((session) => toDateKey(new Date(session.startedAt)) === yesterdayKey)
      .reduce((sum, session) => sum + (session.endedAt - session.startedAt) / 60000, 0),
  )

  const achievementRate = targetMinutes === 0 ? 0 : (actualMinutes / targetMinutes) * 100

  function handleSubmit() {
    const checkIn: CheckIn = {
      date: todayKey,
      condition,
      mood,
      expectedMinutes,
    }
    saveCheckIn(checkIn)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">매일 체크인</h1>
          {isCheckedInToday && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-600">
              ✓ 오늘 체크인 완료
            </span>
          )}
        </div>
        <p className="mt-2 text-slate-600">
          버튼만 누르면 30초 안에 끝나요. 전화를 못 받은 날은 여기서 해요.
        </p>
      </div>

      <Card title="어제 요약" className="rounded-2xl">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-sm text-slate-500">순공시간</p>
            <p className="text-xl font-bold text-slate-900">{formatMinutes(actualMinutes)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">계획 달성률</p>
            <p className="text-xl font-bold text-slate-900">{Math.round(achievementRate)}%</p>
          </div>
        </div>

        <ProgressBar value={achievementRate} className="mt-4" />

        <p className="mt-2 text-sm text-slate-500">
          계획 {formatMinutes(targetMinutes)} 중 {formatMinutes(actualMinutes)}
        </p>
        <p className="mt-3 text-sm font-medium text-slate-600">
          {getEncouragement(targetMinutes, achievementRate)}
        </p>
      </Card>

      <Card title="오늘 컨디션은?" className="rounded-2xl">
        <div className="grid grid-cols-5 gap-2">
          {CONDITION_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={condition === value}
              onClick={() => setCondition(value)}
              className={cn(CHIP_BASE, condition === value ? CHIP_SELECTED : CHIP_UNSELECTED)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-sm text-slate-500">
          <span>최악</span>
          <span>최고</span>
        </div>
      </Card>

      <Card title="기분은 어때?" className="rounded-2xl">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {MOOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mood === option.value}
              aria-label={option.label}
              onClick={() => setMood(option.value)}
              className={cn(
                CHIP_BASE,
                'min-h-16 flex-col gap-1 px-1 py-2 text-center text-xs',
                mood === option.value ? CHIP_SELECTED : CHIP_UNSELECTED,
              )}
            >
              <span className="text-2xl">{option.emoji}</span>
              <span className="leading-tight break-keep">{option.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="오늘은 몇 시간 할 것 같아?" className="rounded-2xl">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {EXPECTED_MINUTES_OPTIONS.map((option) => (
            <button
              key={option.minutes}
              type="button"
              aria-pressed={expectedMinutes === option.minutes}
              onClick={() => setExpectedMinutes(option.minutes)}
              className={cn(
                CHIP_BASE,
                expectedMinutes === option.minutes ? CHIP_SELECTED : CHIP_UNSELECTED,
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Button
        size="lg"
        className="w-full gap-2 rounded-xl text-base shadow-sm transition-transform hover:shadow-md active:scale-[0.98]"
        onClick={handleSubmit}
      >
        {isCheckedInToday ? '✏️ 체크인 다시 저장' : '✅ 체크인 완료'}
      </Button>
    </div>
  )
}
