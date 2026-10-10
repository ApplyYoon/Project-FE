import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useDiaryEntries } from '@/hooks/useDiaryEntries'
import { useReflectionEntries } from '@/hooks/useReflectionEntries'
import { cn } from '@/lib/cn'
import { shouldShowCrisisHelp } from '@/lib/diarySafety'
import { SUPPORT_PATH } from '@/lib/helpLines'
import { loadStudySessions } from '@/lib/dailyRecords'
import { getReflectionPrescription } from '@/lib/reflectionPrescription'
import type { DiaryEntry } from '@/types'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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

/** "지난 일기" 목록 한 줄. 일반 일기와 성찰 일기(#70)를 날짜 기준으로 합친 모양입니다. */
interface TimelineItem {
  date: string
  isReflection: boolean
  /** 그날 기분. 성찰만 쓰고 일반 일기는 안 쓴 날은 없습니다. */
  mood?: number
  previewText: string
}

export function DiaryPage() {
  const navigate = useNavigate()
  const todayKey = toDateKey(new Date())
  const { allEntries, getEntry, saveEntry } = useDiaryEntries()
  const { allEntries: allReflectionEntries } = useReflectionEntries()

  // 오늘 이미 썼으면 그 내용을 불러와서 고칠 수 있게 합니다.
  const existingEntry = getEntry(todayKey)
  const [mood, setMood] = useState(existingEntry?.mood ?? DEFAULT_MOOD)
  const [content, setContent] = useState(existingEntry?.content ?? '')
  const [savedMessage, setSavedMessage] = useState('')

  // 성찰 일기 처방(#70). 지금 내려진 처방이 없으면 null 이고, 처방 카드는 보이지 않습니다.
  // (서버가 생기기 전까지 진짜 사용자에게는 처방이 없습니다. lib/reflectionPrescription.ts)
  const [prescription] = useState(() => getReflectionPrescription(loadStudySessions()))
  const prescriptionDayIndex =
    prescription === null ? 0 : countDays(prescription.startDate, todayKey)
  const isPrescriptionActive =
    prescription !== null && prescriptionDayIndex >= 1 && prescriptionDayIndex <= prescription.days

  // "지난 일기" 목록에는 오늘 것만 빼고, 일반 일기와 성찰 일기를 날짜 기준으로 합쳐서 보여줍니다.
  // (오늘 것은 위 "오늘 일기" 칸에 있으니까요)
  const itemsByDate = new Map<string, TimelineItem>()
  for (const entry of allEntries) {
    if (entry.date === todayKey) continue
    itemsByDate.set(entry.date, {
      date: entry.date,
      isReflection: false,
      mood: entry.mood,
      previewText: entry.content || '(내용 없음)',
    })
  }
  for (const entry of allReflectionEntries) {
    if (entry.date === todayKey) continue
    // 같은 날 일반 일기도 썼으면 그 기분은 그대로 두고, 미리보기 글만 성찰 답으로 바꿉니다.
    const sameDayEntry = itemsByDate.get(entry.date)
    itemsByDate.set(entry.date, {
      date: entry.date,
      isReflection: true,
      mood: sameDayEntry?.mood,
      previewText: entry.answers.find((answer) => answer) || '(내용 없음)',
    })
  }
  const pastEntries = [...itemsByDate.values()].sort((a, b) => b.date.localeCompare(a.date))

  function handleSave() {
    const entry: DiaryEntry = { date: todayKey, mood, content: content.trim() }
    // 쓴 글을 잃지 않도록 먼저 저장하고, 그다음에 위기 표현·기분 저하를 확인합니다. (#95)
    saveEntry(entry)
    setSavedMessage('저장했어요.')

    // 지난 일기의 기분에, 오늘 고른 기분을 더해서 기분 저하가 이어지는지 봅니다.
    const diaryMoods = [
      ...allEntries.filter((past) => past.date !== todayKey),
      { date: todayKey, mood },
    ].map((item) => ({ date: item.date, mood: item.mood }))
    // 감지되면 도움 연결 안내 화면으로 보냅니다. (글은 이미 저장했습니다)
    if (shouldShowCrisisHelp({ texts: [entry.content], diaryMoods })) {
      navigate(SUPPORT_PATH)
    }
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

      {/* 성찰 일기 처방(#70). AI 가 처방을 내린 기간에만 보입니다. */}
      {isPrescriptionActive && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-brand text-sm font-semibold">
              성찰 일기 처방 중 · {prescriptionDayIndex}일째 / {prescription.days}일
            </p>
            <Link
              to="/diary/reflection"
              className="text-brand text-sm font-semibold hover:underline"
            >
              오늘 성찰 쓰기
            </Link>
          </div>
          <ProgressBar value={(prescriptionDayIndex / prescription.days) * 100} className="mt-2" />
          <p className="mt-2 text-sm text-slate-500">{prescription.reason}</p>
        </Card>
      )}

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
                    {moodOption ? (
                      <span className="text-xl" role="img" aria-label={moodOption.label}>
                        {moodOption.emoji}
                      </span>
                    ) : (
                      <span className="w-6 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                        {formatDateLabel(entry.date, { month: 'long', day: 'numeric' })}
                        {entry.isReflection && (
                          <span className="bg-brand-light text-brand rounded px-1.5 py-0.5 text-xs font-semibold">
                            성찰
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm break-words text-slate-600">
                        {entry.previewText}
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
