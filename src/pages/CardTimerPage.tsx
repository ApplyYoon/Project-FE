import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useCardSession } from '@/hooks/useCardSession'
import { useCards } from '@/hooks/useCards'
import { useKeepScreenOn } from '@/hooks/useKeepScreenOn'
import { useQueryParam } from '@/hooks/useQueryParam'
import { playAlarm } from '@/lib/alarm'
import { formatClock } from '@/lib/away'
import {
  LONG_PAUSE_MINUTES,
  createInstantCard,
  getRemainingMs,
  getRunMs,
  shouldAlertLongPause,
} from '@/lib/cardSession'
import { cn } from '@/lib/cn'
import { formatMinutes } from '@/lib/dailyRecords'
import { getTodayKey, toDayKey } from '@/lib/date'
import { showSystemNotification } from '@/lib/notifications'
import { getSessionCardId } from '@/lib/sessionRecords'
import { PAUSE_TAGS } from '@/lib/sessionTags'
import { loadAutoSettings } from '@/lib/settingsMapping'
import type { Card as CardModel, PauseTag } from '@/types'

/**
 * 타이머 탭 — 카드 기준 (최종 기획서 「4.4 타이머」, #395)
 *
 * - 세션이 없으면 **대기 화면**: 다음 카드 [시작], [지금 시작](즉석 카드)
 * - 세션이 있으면 **세션 화면**: 카드의 예정 종료 시각까지 줄어드는 시계, [일시정지] · [끝내기]
 * - 알림으로 `/timer?card=카드id` 가 열리면 묻지 않고 바로 시작합니다.
 * 진행 중인 세션은 저장돼 있어서 새로고침해도 이어집니다.
 */

// [지금 시작] 의 길이 고르기 (분). 가운데 값이 처음 골라져 있습니다.
const INSTANT_MINUTES = [25, 50, 80]
const DEFAULT_INSTANT_MINUTES = 50
const MS_PER_MINUTE = 60 * 1000

/** 남은 시간(밀리초)을 '37:48' · '1:05:00' 처럼 */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function CardTimerPage() {
  const { cards, getCards, addCard } = useCards()
  const session = useCardSession()
  const { active, now, allSessions } = session
  const [cardParam, setCardParam] = useQueryParam('card', '', { replace: true })

  const todayKey = getTodayKey()
  // 오늘 이미 세션을 한 카드 (반복 카드도 오늘 것만)
  const doneTodayIds = new Set(
    allSessions
      .filter((record) => toDayKey(record.startedAt) === todayKey)
      .map((record) => getSessionCardId(record, {}))
      .filter((id): id is string => id !== undefined),
  )
  const todayCards = getCards(todayKey)
  const waitingCards = todayCards.filter((card) => !doneTodayIds.has(card.id))

  // 알림으로 들어오면(?card=) 사전 질문 없이 바로 시작합니다. (「4.4」 시작)
  // 시작한 뒤에는 주소에서 card 값을 지워서, 새로고침해도 다시 시작하지 않게 합니다.
  useEffect(() => {
    if (cardParam === '') return
    const card = cards.find((item) => item.id === cardParam)
    if (card && !active) session.start(card, todayKey)
    setCardParam('')
  }, [cardParam, cards, active, session, todayKey, setCardParam])

  function handleStartNow(minutes: number) {
    const startedAt = Date.now()
    const card = createInstantCard(`card-${startedAt}`, todayKey, startedAt, minutes)
    addCard(card)
    session.start(card, todayKey)
  }

  if (active) {
    const activeCard = cards.find((card) => card.id === active.cardId)
    return <SessionView session={session} card={activeCard} now={now} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">타이머</h1>
        <p className="mt-2 text-slate-600">
          카드를 누르면 바로 시작해요. 시계는 카드가 끝나는 시각까지 줄어들어요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card title="오늘 남은 카드">
          {waitingCards.length === 0 ? (
            <p className="text-sm text-slate-600">
              오늘 할 카드가 없어요. 카드 없이 바로 시작해도 돼요.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {waitingCards.map((card, index) => (
                <WaitingCardRow
                  key={card.id}
                  card={card}
                  isNext={index === 0}
                  onStart={() => session.start(card, todayKey)}
                />
              ))}
            </ul>
          )}
        </Card>

        <InstantStart onStart={handleStartNow} />
      </div>
    </div>
  )
}

interface WaitingCardRowProps {
  card: CardModel
  isNext: boolean
  onStart: () => void
}

/** 대기 화면의 카드 한 줄. 맨 위(다음 카드)는 크게 보입니다 */
function WaitingCardRow({ card, isNext, onStart }: WaitingCardRowProps) {
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
        isNext ? 'border-brand bg-brand/5' : 'border-slate-200',
      )}
    >
      <div className="min-w-0">
        {isNext && <p className="text-brand text-xs font-semibold">다음 카드</p>}
        <p className="truncate font-medium text-slate-900">{card.title}</p>
        <p className="text-sm text-slate-600">
          {card.startTime ?? '시간 미정'} · {formatMinutes(card.durationMinutes)}
          {card.priority === 'absolute' && ' · 꼭 해야 함'}
        </p>
      </div>
      <Button size={isNext ? 'md' : 'sm'} className="h-10 shrink-0" onClick={onStart}>
        시작
      </Button>
    </li>
  )
}

interface InstantStartProps {
  onStart: (minutes: number) => void
}

/** [지금 시작] — 카드 없이 시작하면 '언제 = 지금' 인 즉석 카드가 생깁니다 */
function InstantStart({ onStart }: InstantStartProps) {
  const [minutes, setMinutes] = useState(DEFAULT_INSTANT_MINUTES)
  return (
    <Card title="카드 없이 지금 시작">
      <p className="text-sm text-slate-600">제목과 할 일은 끝날 때 한 줄로 적어요.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {INSTANT_MINUTES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={minutes === value}
            onClick={() => setMinutes(value)}
            className={cn(
              'h-10 rounded-lg border text-sm font-medium',
              minutes === value
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-slate-200 text-slate-700',
            )}
          >
            {value}분
          </button>
        ))}
      </div>
      <Button size="lg" className="mt-4 w-full" onClick={() => onStart(minutes)}>
        ▷ 지금 시작
      </Button>
    </Card>
  )
}

interface SessionViewProps {
  session: ReturnType<typeof useCardSession>
  card: CardModel | undefined
  now: number
}

/** 세션 화면 — 나가는 길은 [일시정지] · [끝내기] 뿐입니다 */
function SessionView({ session, card, now }: SessionViewProps) {
  const active = session.active
  const [settings] = useState(loadAutoSettings)
  const [isEndOpen, setIsEndOpen] = useState(false)
  const [isPauseOpen, setIsPauseOpen] = useState(false)
  const [memo, setMemo] = useState('')
  const remainingMs = active ? getRemainingMs(active, now) : 0
  useKeepScreenOn(active !== null)

  // 예정 종료 시각이 되면 알리고 끝냅니다. (완료 기준은 예정 시간이 끝난 것)
  useEffect(() => {
    if (active && remainingMs === 0) {
      playAlarm()
      session.finish()
    }
  }, [active, remainingMs, session])

  // 일시정지가 15분을 넘으면 복귀 알림을 한 번 보냅니다. (앱을 뒤로 보내 둔 동안에도 뜨게 시스템 알림도 씁니다)
  const isLongPause = active !== null && shouldAlertLongPause(active, now)
  useEffect(() => {
    if (!isLongPause) return
    playAlarm()
    void showSystemNotification({
      title: `${LONG_PAUSE_MINUTES}분째 멈춰 있어요`,
      body: '다시 시작할까요? 끝나는 시각은 그대로예요.',
      tag: 'card-pause-long',
      url: '/timer',
    })
    session.markLongPauseAlerted()
  }, [isLongPause, session])

  if (!active) return null
  const runMinutes = Math.floor(getRunMs(active, now) / MS_PER_MINUTE)
  const progress = (runMinutes / Math.max(1, active.plannedMinutes)) * 100
  const isPaused = active.pausedNow !== undefined
  const checklist = card?.checklist ?? []
  const checkedCount = checklist.filter((item) => active.checked[item.id]).length
  const showChecklist = settings.timerMode.value === 'checklist'

  function handleSaveMemo() {
    session.addMemo(memo)
    setMemo('')
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="max-w-full truncate text-lg font-semibold text-slate-900">
          {card?.title ?? '공부'}
        </p>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-sm font-medium',
            isPaused ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
          )}
        >
          {isPaused ? '잠깐 멈춤' : '● 공부 중'}
        </span>
        {active.pausedNow?.alerted && (
          <p className="text-sm font-medium text-amber-700">
            {LONG_PAUSE_MINUTES}분 넘게 멈춰 있어요. 준비되면 다시 시작해요.
          </p>
        )}
        <p
          className="text-6xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-7xl"
          aria-live="off"
        >
          {formatRemaining(remainingMs)}
        </p>
        <p className="font-medium text-slate-700">
          {active.plannedMinutes}분 중 {runMinutes}분 했어요
        </p>
        <ProgressBar value={progress} className="w-full max-w-sm" />
        <p className="text-sm text-slate-500">
          {formatClock(active.startedAt)} 시작 · {formatClock(active.endAt)}에 끝나요 · 일시정지{' '}
          {active.pauses.length + (isPaused ? 1 : 0)}번
        </p>

        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          {isPaused ? (
            <Button size="lg" onClick={session.resume}>
              다시 시작
            </Button>
          ) : (
            <Button size="lg" variant="secondary" onClick={() => setIsPauseOpen(true)}>
              일시정지
            </Button>
          )}
          <Button
            size="lg"
            variant="ghost"
            className="border border-slate-300"
            onClick={() => setIsEndOpen(true)}
          >
            끝내기
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          공부 중에는 화면이 꺼지지 않아요. 일시정지해도 끝나는 시각은 그대로예요.
        </p>
      </Card>

      {showChecklist && checklist.length > 0 && (
        <Card title={`체크리스트 ${checkedCount}/${checklist.length}`}>
          <ul className="flex flex-col gap-1">
            {checklist.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="accent-brand size-5"
                    checked={Boolean(active.checked[item.id])}
                    onChange={() => session.toggleCheck(item.id)}
                  />
                  <span
                    className={cn(
                      'text-slate-800',
                      active.checked[item.id] && 'text-slate-400 line-through',
                    )}
                  >
                    {item.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {settings.parkingLot.value && (
        <Card title="딴생각 주차장">
          <p className="text-sm text-slate-600">
            떠오른 걱정이나 할 일을 한 줄 적고 바로 돌아와요.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              maxLength={100}
              placeholder="예: 엄마한테 문자하기"
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <Button onClick={handleSaveMemo}>적기</Button>
          </div>
          {active.memos.length > 0 && (
            <p className="mt-2 text-sm text-slate-500">{active.memos.length}개 적어 뒀어요</p>
          )}
        </Card>
      )}

      <PausePicker
        isOpen={isPauseOpen}
        onClose={() => setIsPauseOpen(false)}
        onPick={(tag, note) => {
          setIsPauseOpen(false)
          session.pause(tag, note)
        }}
      />

      <Modal isOpen={isEndOpen} onClose={() => setIsEndOpen(false)} title="지금 끝낼까요?">
        <p className="text-slate-700">
          아직 {formatMinutes(Math.ceil(remainingMs / MS_PER_MINUTE))} 남았어요. 지금 끝내면 '중간에
          끝냈어요'로 남아요.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setIsEndOpen(false)}>
            계속하기
          </Button>
          <Button
            onClick={() => {
              setIsEndOpen(false)
              session.finish()
            }}
          >
            끝내기
          </Button>
        </div>
      </Modal>
    </div>
  )
}

interface PausePickerProps {
  isOpen: boolean
  onClose: () => void
  onPick: (tag: PauseTag, note?: string) => void
}

/**
 * 일시정지 이유 1탭 (「4.4 타이머」 일시정지, #397)
 * 누르는 순간 멈춥니다. '기타' 만 한 줄을 받고(빈칸 허용) [멈추기] 를 누릅니다.
 * 이유는 귀인(내 쪽 / 바깥)과 주의 분산을 보는 재료라서 꼭 하나를 고르게 합니다.
 */
function PausePicker({ isOpen, onClose, onPick }: PausePickerProps) {
  const [isOther, setIsOther] = useState(false)
  const [note, setNote] = useState('')

  function handleClose() {
    setIsOther(false)
    setNote('')
    onClose()
  }

  function pick(tag: PauseTag, text?: string) {
    setIsOther(false)
    setNote('')
    onPick(tag, text?.trim() || undefined)
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="왜 멈추나요?">
      {isOther ? (
        <div className="flex flex-col gap-3">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={100}
            placeholder="한 줄로 적어요 (안 적어도 돼요)"
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setIsOther(false)}>
              뒤로
            </Button>
            <Button onClick={() => pick('other', note)}>멈추기</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {PAUSE_TAGS.map((item) => (
            <Button
              key={item.key}
              variant="secondary"
              className="h-12"
              onClick={() => (item.key === 'other' ? setIsOther(true) : pick(item.key))}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        멈춘 시간은 한 시간에서 빠지고, 끝나는 시각은 그대로예요.
      </p>
    </Modal>
  )
}
