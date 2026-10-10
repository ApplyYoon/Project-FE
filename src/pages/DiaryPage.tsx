import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useDiaryEntries } from '@/hooks/useDiaryEntries'
import { cn } from '@/lib/cn'
import type { DiaryEntry } from '@/types'
import { useState } from 'react'
import { Link } from 'react-router-dom'

/** 오늘 기분 버튼. 체크인(#24)과 같은 5단계를 씁니다. */
const MOOD_OPTIONS = [
  { value: 1, emoji: '😞', label: '많이 처짐' },
  { value: 2, emoji: '🙁', label: '처짐' },
  { value: 3, emoji: '😐', label: '보통' },
  { value: 4, emoji: '🙂', label: '좋음' },
  { value: 5, emoji: '😄', label: '아주 좋음' },
]

// 일기를 처음 쓸 때 기분 버튼이 가리킬 기본값 (가운데 값)
const DEFAULT_MOOD = 3

/** Date 를 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString() 은 영국 시간 기준이라 쓰지 않습니다) */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' 날짜를 한국어로 보여줍니다. */
function formatDateLabel(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ko-KR', options)
}

export function DiaryPage() {
  const todayKey = toDateKey(new Date())
  const { allEntries, getEntry, saveEntry } = useDiaryEntries()

  // 오늘 이미 썼으면 그 내용을 불러와서 고칠 수 있게 합니다.
  const existingEntry = getEntry(todayKey)
  const [mood, setMood] = useState(existingEntry?.mood ?? DEFAULT_MOOD)
  const [content, setContent] = useState(existingEntry?.content ?? '')
  const [savedMessage, setSavedMessage] = useState('')

  // "지난 일기" 목록에는 오늘 것만 빼고 보여줍니다. (오늘 것은 위 "오늘 일기" 칸에 있으니까요)
  const pastEntries = allEntries.filter((entry) => entry.date !== todayKey)

  function handleSave() {
    // #95 안전 브레이크 함수가 아직 없어서, 위기 표현 확인 없이 바로 저장합니다.
    // #95 가 만들어지면 여기서 먼저 내용을 확인하고, 감지되면 도움 연결 안내(#96)를 보여줘야 합니다.
    const entry: DiaryEntry = { date: todayKey, mood, content: content.trim() }
    saveEntry(entry)
    setSavedMessage('저장했어요.')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/records" className="text-sm text-slate-500 hover:text-slate-700">
          ‹ 기록
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">일기</h1>
        <p className="mt-2 text-slate-600">
          원할 때만 쓰는 기록이에요. AI 가 기분과 반복되는 말을 분석에 써요.
        </p>
      </div>

      {/* 모바일은 세로로 쌓고, PC(lg)에서는 왼쪽 오늘 일기 · 오른쪽 지난 일기로 나눕니다. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <Card
          title={
            <div className="flex items-center justify-between font-semibold">
              <span>오늘 일기</span>
              <span className="text-sm font-normal text-slate-500">
                {formatDateLabel(todayKey, { month: 'long', day: 'numeric', weekday: 'long' })}
              </span>
            </div>
          }
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">오늘 기분</span>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {MOOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={mood === option.value}
                  aria-label={option.label}
                  onClick={() => setMood(option.value)}
                  className={cn(
                    'flex min-h-16 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center text-xs font-medium transition-colors',
                    mood === option.value
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span className="text-xl">{option.emoji}</span>
                  <span className="leading-tight break-keep">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="diary-content" className="text-sm font-medium text-slate-700">
              오늘 있었던 일
            </label>
            <textarea
              id="diary-content"
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                setSavedMessage('')
              }}
              placeholder="오늘 있었던 일을 자유롭게 적어 보세요"
              rows={8}
              className="focus:border-brand focus:ring-brand/30 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm placeholder:text-slate-400 focus:ring-2 focus:outline-none"
            />
          </div>

          <p className="mt-3 text-sm text-slate-500">🔒 일기 원문은 나만 볼 수 있어요</p>

          <Button className="mt-4 w-full" onClick={handleSave}>
            저장하기
          </Button>

          {savedMessage && (
            <p role="status" className="mt-2 text-sm font-medium text-emerald-600">
              {savedMessage}
            </p>
          )}
        </Card>

        <Card title="지난 일기">
          {pastEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">아직 쓴 일기가 없어요.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pastEntries.map((entry) => {
                const moodOption = MOOD_OPTIONS.find((option) => option.value === entry.mood)
                return (
                  <li key={entry.date} className="flex items-start gap-3 py-3">
                    <span className="text-xl" role="img" aria-label={moodOption?.label ?? ''}>
                      {moodOption?.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatDateLabel(entry.date, { month: 'long', day: 'numeric' })}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm break-words text-slate-600">
                        {entry.content || '(내용 없음)'}
                      </p>
                    </div>
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
