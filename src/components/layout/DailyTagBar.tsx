import { useAuth } from '@/hooks/useAuth'
import { usePsychTestSync } from '@/hooks/usePsychTestSync'
import { useSendCheckIn, useUnsentCheckInRetry } from '@/hooks/useCheckInSync'
import { todayServerCheckInQuery } from '@/lib/checkInsApi'
import { cn } from '@/lib/cn'
import { getTodayKey } from '@/lib/date'
import {
  EMOTION_OPTIONS,
  MOOD_OPTIONS,
  hasCheckIn,
  isDailyTagSkipped,
  markDailyTagSkipped,
  saveLocalCheckIn,
  saveQuickCheckIn,
} from '@/lib/quickCheckIn'
import type { EmotionTag } from '@/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface ServerCheckInGateProps {
  todayKey: string
  children: ReactNode
}

/**
 * 이 기기에 오늘 체크인이 없을 때, 서버에 있는지 한 번 더 봅니다. (다른 기기에서 했을 수 있어서. #321)
 * 쿼리가 받아오면서 서버의 오늘 체크인을 이 기기에도 적어 둡니다. 그래서 받아온 뒤에는 이 기기의 저장소만 보면 됩니다.
 * 서버에도 없거나, 서버에 닿지 못하면(쿼리가 null) 한 줄을 보여 줍니다.
 */
function ServerCheckInGate({ todayKey, children }: ServerCheckInGateProps) {
  useSuspenseQuery(todayServerCheckInQuery(todayKey))
  return <>{hasCheckIn(todayKey) ? null : children}</>
}

/** 이 한 줄에서 고른 값. date 가 오늘이 아니면(앱을 켜 둔 채 날이 바뀜) 아무것도 안 고른 것으로 봅니다. */
interface Picked {
  date: string
  condition: number | null
  emotions: EmotionTag[]
}

/**
 * 그날 처음 연 화면이 어디든 맨 위에 뜨는 "오늘의 한 줄" 입니다. 컨디션 1 ~ 5 와 감정 태그(여러 개)를 고릅니다. (#387)
 * Layout 이 본문 맨 위에 둡니다. 알림을 눌러 타이머로 바로 들어와도 같은 한 줄이 뜹니다.
 *
 *   로그인 안 했다 / 오늘 체크인을 이미 했다 / 오늘 [건너뛰기] 했다  -> 안 보입니다.
 *   컨디션을 누른다   -> 바로 저장합니다(1탭). 감정 태그는 그 전이나 뒤에 더 눌러도 되고, 누를 때마다 다시 저장합니다.
 *   [건너뛰기]        -> 저장하지 않고 그날은 다시 묻지 않습니다. (그날 통화에서 묻습니다)
 *   저장한 뒤 [닫기]  -> 사라집니다. 화면을 옮겨도 닫을 때까지는 남아 있어서 태그를 마저 고를 수 있습니다.
 *
 * 예전처럼 화면을 막지 않습니다. 고르지 않아도 앱을 그대로 쓸 수 있습니다.
 * 고른 값은 이 기기에 먼저 저장하고 서버로도 보냅니다. 못 보내면 다음에 앱을 열 때 다시 보냅니다. (hooks/useCheckInSync.ts)
 * 테스트 로그인은 서버를 부르지 않고 이 기기의 값만 봅니다.
 */
export function DailyTagBar() {
  const { isLoggedIn } = useAuth()
  // useLocation 을 쓰면 주소가 바뀔 때마다 다시 그려집니다.
  // 앱을 켜 둔 채 날이 바뀌어도(새벽 4시), 다음에 화면을 옮길 때 "오늘 체크인" 을 다시 확인하게 됩니다.
  useLocation()
  const send = useSendCheckIn()
  // 아직 서버에 안 간 심리검사 결과를 앱을 열 때 보냅니다. (hooks/usePsychTestSync.ts)
  usePsychTestSync()
  // 예전에 서버로 못 보낸 체크인을 앱을 열 때 다시 보냅니다.
  useUnsentCheckInRetry()

  const todayKey = getTodayKey()
  const [picked, setPicked] = useState<Picked | null>(null)
  // 이 한 줄에서 저장한 날짜 · 닫거나 건너뛴 날짜. 저장소가 바뀐 것은 React 가 몰라서 이 값으로 다시 그리게 합니다.
  const [savedDate, setSavedDate] = useState<string | null>(null)
  const [closedDate, setClosedDate] = useState<string | null>(null)

  const isSavedHere = savedDate === todayKey
  const condition = picked?.date === todayKey ? picked.condition : null
  const emotions = picked?.date === todayKey ? picked.emotions : []

  function save(nextCondition: number, nextEmotions: EmotionTag[]) {
    const checkIn = saveQuickCheckIn(nextCondition, nextEmotions)
    setSavedDate(todayKey)
    // 서버로도 보냅니다. 서버가 채운 칸(통화에서 말한 이유 등)이 있으면 이 기기에도 적어 둡니다.
    if (send.canSync) send.mutate(checkIn, { onSuccess: saveLocalCheckIn })
  }

  function handleSelectCondition(value: number) {
    setPicked({ date: todayKey, condition: value, emotions })
    save(value, emotions)
  }

  function handleToggleEmotion(tag: EmotionTag) {
    const toggled = emotions.includes(tag)
      ? emotions.filter((item) => item !== tag)
      : [...emotions, tag]
    // 누른 순서와 상관없이 화면 순서로 저장합니다. (늘 같은 모양이 되게)
    const ordered = EMOTION_OPTIONS.map((option) => option.tag).filter((item) =>
      toggled.includes(item),
    )
    setPicked({ date: todayKey, condition, emotions: ordered })
    // 컨디션을 이미 골라 저장했으면 태그를 바꿀 때마다 다시 저장합니다.
    if (condition !== null && isSavedHere) save(condition, ordered)
  }

  function handleSkip() {
    markDailyTagSkipped(todayKey)
    setClosedDate(todayKey)
  }

  if (!isLoggedIn || closedDate === todayKey || isDailyTagSkipped(todayKey)) return null
  // 오늘 체크인이 이미 있으면(다른 기기 · 통화) 묻지 않습니다. 이 한 줄에서 방금 저장한 것은 닫을 때까지 둡니다.
  if (!isSavedHere && hasCheckIn(todayKey)) return null

  const bar = (
    <section
      aria-label="오늘의 한 줄"
      className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
    >
      {/* flex-wrap: PC 에서는 한 줄로, 375px 에서는 넘치는 칸이 다음 줄로 내려갑니다. (가로 스크롤 없음) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-semibold whitespace-nowrap text-slate-900">오늘 컨디션</p>
        {/* 컨디션 1 ~ 5. 누르는 곳은 40×40px(h-10 w-10) */}
        <div role="group" aria-label="컨디션" className="flex gap-1">
          {MOOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={`컨디션 ${option.value} · ${option.label}`}
              aria-pressed={condition === option.value}
              onClick={() => handleSelectCondition(option.value)}
              className={cn(
                'flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border text-xl',
                condition === option.value
                  ? 'border-brand bg-brand-light'
                  : 'hover:border-brand border-slate-200 bg-white',
              )}
            >
              <span aria-hidden>{option.emoji}</span>
            </button>
          ))}
        </div>

        {/* 감정 태그 (여러 개). 고르면 색이 채워집니다. 누르는 곳은 높이 40px(h-10) */}
        <div role="group" aria-label="감정 태그 (여러 개)" className="flex flex-wrap gap-1.5">
          {EMOTION_OPTIONS.map((option) => (
            <button
              key={option.tag}
              type="button"
              aria-pressed={emotions.includes(option.tag)}
              onClick={() => handleToggleEmotion(option.tag)}
              className={cn(
                'h-10 cursor-pointer rounded-full border px-3 text-sm font-medium whitespace-nowrap',
                emotions.includes(option.tag)
                  ? 'border-brand bg-brand text-white'
                  : 'hover:border-brand border-slate-200 bg-white text-slate-700',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          {isSavedHere && (
            <p role="status" className="text-xs text-slate-500">
              저장했어요
            </p>
          )}
          <button
            type="button"
            onClick={isSavedHere ? () => setClosedDate(todayKey) : handleSkip}
            className="h-10 shrink-0 cursor-pointer rounded-md px-3 text-sm text-slate-500 hover:bg-slate-100"
          >
            {isSavedHere ? '닫기' : '건너뛰기'}
          </button>
        </div>
      </div>
    </section>
  )

  if (isSavedHere || !send.canSync) return bar

  return (
    // 서버에 묻는 동안에는 아무것도 보여주지 않습니다. 화면을 막지 않으니 기다릴 필요가 없습니다.
    <Suspense fallback={null}>
      <ServerCheckInGate todayKey={todayKey}>{bar}</ServerCheckInGate>
    </Suspense>
  )
}
