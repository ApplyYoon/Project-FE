import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useDiaryEntries } from '@/hooks/useDiaryEntries'
import { useReflectionEntries } from '@/hooks/useReflectionEntries'
import { cn } from '@/lib/cn'
import { getTodayKey } from '@/lib/date'
import { hasDemoData } from '@/lib/demoData'
import { shouldShowCrisisHelp } from '@/lib/diarySafety'
import { SUPPORT_PATH } from '@/lib/helpLines'
import { loadStudySessions } from '@/lib/dailyRecords'
import { reflectionPrescriptionQuery } from '@/lib/reflectionPrescription'
import { loadData, removeData, saveData } from '@/lib/storage'
import type { DiaryEntry } from '@/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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

interface PrescriptionCardProps {
  todayKey: string
  /** 개발용 가상 데이터를 넣었는지. 넣었으면 서버 대신 예시 처방을 씁니다. */
  isDemo: boolean
}

/** 성찰 일기 처방(#70) 카드. 서버가 처방을 내린 기간에만 보이고, 아니면 아무것도 그리지 않습니다. */
function PrescriptionCard({ todayKey, isDemo }: PrescriptionCardProps) {
  // 지금 내려진 처방. 서버가 처방하지 않았으면 null 입니다. (lib/reflectionPrescription.ts)
  const { data: prescription } = useSuspenseQuery(reflectionPrescriptionQuery(isDemo))
  const dayIndex = prescription === null ? 0 : countDays(prescription.startDate, todayKey)
  if (prescription === null || dayIndex < 1 || dayIndex > prescription.days) return null

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-brand text-sm font-semibold">
          성찰 일기 처방 중 · {dayIndex}일째 / {prescription.days}일
        </p>
        <Link
          to="/diary/reflection"
          className="text-brand inline-flex h-10 items-center text-sm font-semibold hover:underline"
        >
          오늘 성찰 쓰기
        </Link>
      </div>
      <ProgressBar value={(dayIndex / prescription.days) * 100} className="mt-2" />
      <p className="mt-2 text-sm text-slate-500">{prescription.reason}</p>
    </Card>
  )
}

/** "지난 일기" 목록 한 줄. 일반 일기와 성찰 일기(#70)를 날짜 기준으로 합친 모양입니다. */
interface TimelineItem {
  date: string
  isReflection: boolean
  /** 그날 기분. 성찰만 쓰고 일반 일기는 안 쓴 날은 없습니다. */
  mood?: number
  previewText: string
}

// 저장 버튼을 누르기 전에 쓰던 글을 임시로 넣어 두는 이름입니다.
// 쓰는 도중에 전화 화면으로 넘어가거나 새로고침해도 글이 사라지지 않습니다. 저장하면 지웁니다.
// "일기만 지우기" 로 같이 지워집니다. (lib/myData.ts 의 DIARY_KEYS)
const DRAFT_KEY = 'diary-draft'

/** 쓰던 글. date 가 오늘이 아니면 지난 날의 것이라 쓰지 않습니다. */
interface DiaryDraft {
  date: string
  mood: number
  content: string
}

/** 오늘 쓰던 글이 있으면 불러옵니다. 없거나 모양이 틀리거나 지난 날의 것이면 null 입니다. */
function loadTodayDraft(todayKey: string): DiaryDraft | null {
  const saved = loadData<Partial<DiaryDraft> | null>(DRAFT_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  if (saved.date !== todayKey) return null
  if (typeof saved.mood !== 'number' || typeof saved.content !== 'string') return null
  return { date: saved.date, mood: saved.mood, content: saved.content }
}

export function DiaryPage() {
  const navigate = useNavigate()
  const todayKey = getTodayKey()
  const { allEntries, getEntry, saveEntry } = useDiaryEntries()
  const { allEntries: allReflectionEntries } = useReflectionEntries()

  // 오늘 이미 썼으면 그 내용을 불러와서 고칠 수 있게 합니다.
  const existingEntry = getEntry(todayKey)
  // 저장 버튼을 누르기 전에 쓰던 글이 있으면 그것부터 보여줍니다. (전화가 와서 화면이 넘어갔다 돌아온 경우 등)
  const [draft] = useState(() => loadTodayDraft(todayKey))
  const [mood, setMood] = useState(draft?.mood ?? existingEntry?.mood ?? DEFAULT_MOOD)
  const [content, setContent] = useState(draft?.content ?? existingEntry?.content ?? '')
  const [savedMessage, setSavedMessage] = useState('')

  // 기분이나 글이 바뀔 때마다 임시로 저장합니다. 저장된 일기와 똑같으면 임시 저장은 필요 없어서 지웁니다.
  useEffect(() => {
    const isSameAsSaved =
      existingEntry !== undefined &&
      existingEntry.mood === mood &&
      existingEntry.content === content
    const isUntouched = existingEntry === undefined && content === '' && mood === DEFAULT_MOOD
    if (isSameAsSaved || isUntouched) removeData(DRAFT_KEY)
    else saveData<DiaryDraft>(DRAFT_KEY, { date: todayKey, mood, content })
  }, [existingEntry, mood, content, todayKey])

  // 성찰 일기 처방 카드가 가상 데이터의 예시를 쓸지. 처음 열 때 한 번만 봅니다.
  const [isDemo] = useState(() => hasDemoData(loadStudySessions()))

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
        {/* 위의 "‹ 상담" 돌아가기 링크는 Layout 이 보여 줍니다. (lib/tabMenu.ts) */}
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">일기</h1>
        <p className="mt-2 text-slate-600">
          원할 때만 쓰는 기록이에요. AI 가 기분과 반복되는 말을 분석에 써요.
        </p>
      </div>

      {/* 성찰 일기 처방(#70). 서버가 처방을 내린 기간에만 보입니다.
          받아오는 동안은 아무것도 그리지 않습니다. (처방이 없는 사람이 대부분이라 자리를 비워 두면 화면이 덜컹거립니다) */}
      <AsyncBoundary
        pendingFallback={null}
        errorMessage="성찰 일기 처방을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
      >
        <PrescriptionCard todayKey={todayKey} isDemo={isDemo} />
      </AsyncBoundary>

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
