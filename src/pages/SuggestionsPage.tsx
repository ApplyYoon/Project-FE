import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useSuggestions } from '@/hooks/useSuggestions'
import { cn } from '@/lib/cn'
import type { Suggestion, SuggestionLevel } from '@/types'

/** 실험 기간으로 고를 수 있는 일수. 기본값은 14일입니다. */
const dayOptions = [7, 10, 14]

const levelLabels: Record<SuggestionLevel, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '강함',
}

const levelBadgeStyles: Record<SuggestionLevel, string> = {
  easy: 'bg-green-50 text-green-600',
  normal: 'bg-blue-50 text-blue-600',
  hard: 'bg-red-50 text-red-600',
}

/** 오늘 날짜를 'YYYY-MM-DD' 문자열로 돌려줍니다. */
function todayKey() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' 날짜에 days 일을 더한 뒤 'M월 D일' 로 바꿔줍니다. */
function formatEndDate(startDateKey: string, days: number) {
  const [year, month, day] = startDateKey.split('-').map(Number)
  const end = new Date(year, month - 1, day + days)
  return `${end.getMonth() + 1}월 ${end.getDate()}일`
}

/** 시작일로부터 오늘이 며칠째인지 돌려줍니다. 시작한 날 당일이면 1일째입니다. */
function daysElapsed(startDateKey: string) {
  const [year, month, day] = startDateKey.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  return diffDays + 1
}

/** 개선안 문장을 "만약 ~하면 → ~한다" 모양으로 보여줍니다. */
function SuggestionSentence({ suggestion }: { suggestion: Suggestion }) {
  return (
    <p className="text-sm text-slate-900">
      <span className="font-semibold">만약 {suggestion.ifText}</span>
      {' → '}
      {suggestion.thenText}
    </p>
  )
}

export function SuggestionsPage() {
  const { suggestions, activeCount, maxActiveCount, startChallenge } = useSuggestions()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [days, setDays] = useState(14)
  const [showLimitNotice, setShowLimitNotice] = useState(false)

  const activeSuggestions = suggestions.filter((suggestion) => suggestion.status === 'active')
  const candidateSuggestions = suggestions.filter((suggestion) => suggestion.status === 'suggested')
  const selected = suggestions.find((suggestion) => suggestion.id === selectedId)

  function handlePickCandidate(suggestion: Suggestion) {
    // 이미 2개를 도전 중이면 기간 선택 칸을 열지 않고 안내만 보여줍니다.
    if (activeCount >= maxActiveCount) {
      setShowLimitNotice(true)
      return
    }
    setShowLimitNotice(false)
    setSelectedId(suggestion.id)
    setDays(14)
  }

  function handleStart() {
    if (!selected) return
    startChallenge(selected.id, days)
    setSelectedId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">개선안 고르기</h1>
        <p className="mt-2 text-slate-600">
          1개, 많아야 2개 골라서 7~14일 해 봐요. 효과가 있었는지 같이 확인할게요.
        </p>
      </div>

      {activeSuggestions.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              도전 중 {activeSuggestions.length} / {maxActiveCount}
            </h2>
            <p className="text-sm text-slate-500">동시에 {maxActiveCount}개까지 할 수 있어요</p>
          </div>

          {activeSuggestions.map((suggestion) => {
            // startDate·days 는 도전을 시작할 때 같이 저장돼서 여기선 항상 값이 있습니다.
            const totalDays = suggestion.days ?? 0
            const elapsed = Math.min(daysElapsed(suggestion.startDate ?? todayKey()), totalDays)
            const percent = totalDays > 0 ? (elapsed / totalDays) * 100 : 0

            return (
              <Card key={suggestion.id}>
                <SuggestionSentence suggestion={suggestion} />
                <p className="mt-3 text-sm text-slate-500">
                  {totalDays}일 중 {elapsed}일째
                </p>
                <ProgressBar value={percent} className="mt-2" />
                <p className="mt-3 text-sm text-slate-500">
                  실험 중에는 바꿀 수 없어요. 끝까지 해야 효과를 알 수 있어요.
                </p>
              </Card>
            )
          })}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">새로 도전할 개선안</h2>
        {/* 아직 내 기록으로 개선안을 만들어 주는 기능이 없어서, 지금은 누구에게나 같은 예시를 보여줍니다. */}
        <p className="mt-1 text-sm break-keep text-slate-500">
          아직은 누구에게나 같은 예시예요. 기록이 쌓이면 나에게 맞는 개선안으로 바뀔 거예요.
        </p>

        {showLimitNotice && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            동시에 {maxActiveCount}개까지만 도전할 수 있어요. 하나를 마치고 다시 골라 주세요.
          </p>
        )}

        {candidateSuggestions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">지금 고를 수 있는 개선안이 없어요.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {candidateSuggestions.map((suggestion) => {
              const isSelected = suggestion.id === selectedId
              return (
                <Card
                  key={suggestion.id}
                  className={cn(isSelected && 'border-brand bg-brand-light')}
                >
                  <span
                    className={cn(
                      'inline-block rounded px-2 py-0.5 text-xs font-semibold',
                      levelBadgeStyles[suggestion.level],
                    )}
                  >
                    {levelLabels[suggestion.level]}
                  </span>

                  <div className="mt-2">
                    <SuggestionSentence suggestion={suggestion} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{suggestion.reason}</p>

                  <Button
                    variant={isSelected ? 'primary' : 'secondary'}
                    className="mt-4 w-full"
                    onClick={() => handlePickCandidate(suggestion)}
                  >
                    {isSelected ? '✓ 선택됨' : '도전하기'}
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <Card title={`고른 개선안 · ${levelLabels[selected.level]}`}>
          <SuggestionSentence suggestion={selected} />

          <p className="mt-4 text-sm font-medium text-slate-700">실험 기간</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {dayOptions.map((option) => {
              const isSelectedDay = option === days
              return (
                <label
                  key={option}
                  className={cn(
                    'flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-medium',
                    isSelectedDay
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio"
                    name="days"
                    checked={isSelectedDay}
                    onChange={() => setDays(option)}
                    className="accent-brand h-4 w-4 cursor-pointer"
                  />
                  {option}일
                </label>
              )
            })}
          </div>

          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            실험 중에는 바꿀 수 없어요. 끝까지 해야 효과를 알 수 있어요.{' '}
            {formatEndDate(todayKey(), days)}에 결과를 같이 봐요.
          </p>

          <Button size="lg" className="mt-4 w-full" onClick={handleStart}>
            {days}일 도전 시작
          </Button>
        </Card>
      )}
    </div>
  )
}
