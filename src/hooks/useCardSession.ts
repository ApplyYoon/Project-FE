import { useStudySessions } from '@/hooks/useStudySessions'
import {
  closePause,
  finishActiveSession,
  getScheduledEndAt,
  type ActiveCardSession,
} from '@/lib/cardSession'
import { loadData, removeData, saveData } from '@/lib/storage'
import type { Card, PauseTag, StudySession } from '@/types'
import { useEffect, useRef, useState } from 'react'

// 진행 중인 카드 세션을 넣어 두는 이름입니다. (실제 키는 'study-card-session')
// 새로고침하거나 앱을 닫았다 열어도 세션 화면으로 돌아오기 위해 저장합니다.
export const CARD_SESSION_KEY = 'card-session'

/** 저장된 진행 중 세션. 없거나 모양이 틀리면 null */
export function loadActiveCardSession(): ActiveCardSession | null {
  const saved = loadData<unknown>(CARD_SESSION_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const value = saved as Partial<ActiveCardSession>
  const isValid =
    typeof value.cardId === 'string' &&
    typeof value.startedAt === 'number' &&
    typeof value.endAt === 'number' &&
    Array.isArray(value.pauses)
  return isValid ? (saved as ActiveCardSession) : null
}

/**
 * 카드 세션(타이머 한 번)을 시작 · 일시정지 · 끝냅니다. (#395)
 * 진행 중인 세션은 저장소에 있어서 새로고침해도 그대로 이어집니다.
 * 1초마다 now 를 바꿔서 남은 시간이 줄어드는 화면을 다시 그립니다.
 *
 *   const { active, now, allSessions, start, pause, resume, toggleCheck, addMemo, finish } = useCardSession()
 */
export function useCardSession() {
  // 끝낸 기록을 붙이는 곳과 화면이 읽는 곳이 같아야 해서, 기록 목록도 이 훅이 같이 돌려줍니다.
  const { allSessions, addSession, updateSession } = useStudySessions()
  const [active, setActive] = useState<ActiveCardSession | null>(loadActiveCardSession)
  const [now, setNow] = useState(() => Date.now())
  // 같은 세션을 두 번 저장하지 않게, 마지막으로 끝낸 세션의 시작 시각을 기억합니다.
  // (예정 시각이 지난 채로 화면을 열면 끝내기가 화면 그리기마다 불릴 수 있어서)
  const finishedStartRef = useRef<number | null>(null)

  // 바뀔 때마다 저장합니다. 끝나서 null 이 되면 지웁니다.
  useEffect(() => {
    if (active) saveData(CARD_SESSION_KEY, active)
    else removeData(CARD_SESSION_KEY)
  }, [active])

  // 세션이 있는 동안만 1초마다 시계를 움직입니다.
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  /** 카드로 세션을 시작합니다. 이미 진행 중이면 아무것도 하지 않습니다. */
  function start(card: Card, dateKey: string, mode: ActiveCardSession['mode'] = 'normal') {
    if (active) return
    const startedAt = Date.now()
    setNow(startedAt)
    setActive({
      cardId: card.id,
      dateKey,
      startedAt,
      endAt: getScheduledEndAt(card, dateKey, startedAt),
      plannedMinutes: card.durationMinutes,
      pauses: [],
      checked: {},
      memos: [],
      mode,
    })
  }

  /** 일시정지합니다. 이유(tag)는 1탭으로 받습니다 (#397). */
  function pause(tag: PauseTag, note?: string) {
    setActive((prev) =>
      prev && !prev.pausedNow
        ? { ...prev, pausedNow: { startedAt: Date.now(), tag, ...(note ? { note } : {}) } }
        : prev,
    )
  }

  /** 다시 시작합니다. 방금 일시정지는 끝난 일시정지 목록으로 옮깁니다. */
  function resume() {
    setActive((prev) => {
      if (!prev?.pausedNow) return prev
      const { pausedNow, ...rest } = prev
      return { ...rest, pauses: [...prev.pauses, closePause(pausedNow, Date.now())] }
    })
  }

  /** 15분 복귀 알림을 보냈다고 적어 둡니다. 새로고침해도 다시 보내지 않게 세션에 남깁니다. */
  function markLongPauseAlerted() {
    setActive((prev) =>
      prev?.pausedNow ? { ...prev, pausedNow: { ...prev.pausedNow, alerted: true } } : prev,
    )
  }

  /** 체크리스트 항목을 체크하거나 풉니다. 체크한 시각을 같이 남깁니다. */
  function toggleCheck(itemId: string) {
    setActive((prev) => {
      if (!prev) return prev
      const checked = { ...prev.checked }
      if (checked[itemId]) delete checked[itemId]
      else checked[itemId] = Date.now()
      return { ...prev, checked }
    })
  }

  /** 딴생각 주차장에 한 줄을 적습니다. 빈 글자는 넣지 않습니다. */
  function addMemo(text: string) {
    const trimmed = text.trim()
    if (trimmed === '') return
    setActive((prev) =>
      prev ? { ...prev, memos: [...prev.memos, { at: Date.now(), text: trimmed }] } : prev,
    )
  }

  /** 세션을 끝내고 기록으로 저장합니다. 저장한 기록을 돌려줍니다 (종료 팝업 #398 에서 씀). */
  function finish(): StudySession | null {
    if (!active || finishedStartRef.current === active.startedAt) return null
    finishedStartRef.current = active.startedAt
    const record = finishActiveSession(active, Date.now(), `session-${Date.now()}`)
    addSession(record)
    setActive(null)
    return record
  }

  return {
    active,
    now,
    allSessions,
    start,
    pause,
    resume,
    markLongPauseAlerted,
    updateSession,
    toggleCheck,
    addMemo,
    finish,
  }
}
