import { getPlannedStartAt } from '@/lib/facts'
import { summarizePauses } from '@/lib/sessionRecords'
import type { Card, PauseTag, SessionMemo, SessionMode, SessionPause, StudySession } from '@/types'

/**
 * 카드 세션(타이머 한 번)을 계산하는 순수 함수들입니다. (최종 기획서 「4.4 타이머」 세션, #395)
 * 진행 중인 세션을 들고 있는 훅은 hooks/useCardSession.ts 입니다.
 */

const MS_PER_MINUTE = 60 * 1000

/** 진행 중인 카드 세션. 새로고침해도 이어지도록 저장소에 그대로 넣습니다 */
export interface ActiveCardSession {
  cardId: string
  /** 그 카드를 하는 날짜 ('YYYY-MM-DD') */
  dateKey: string
  /** 시작한 시각 */
  startedAt: number
  /** 이 시각에 끝납니다 (getScheduledEndAt) */
  endAt: number
  /** 계획 시간 (분) — 기록의 targetMinutes 로 남깁니다 */
  plannedMinutes: number
  /** 끝난 일시정지들 */
  pauses: SessionPause[]
  /** 지금 일시정지 중이면 시작한 시각과 이유. alerted: 15분 복귀 알림을 이미 보냈는지 */
  pausedNow?: { startedAt: number; tag: PauseTag; note?: string; alerted?: boolean }
  /** 체크한 체크리스트 항목 (항목 id → 체크한 시각) */
  checked: Record<string, number>
  /** 딴생각 주차장 메모 */
  memos: SessionMemo[]
  mode: SessionMode
}

/**
 * 세션이 끝나는 시각을 정합니다. 타이머는 **카드의 예정 종료 시각까지** 줄어듭니다 (뒤 일정을 지키기 위해).
 * - 일찍 시작하면 그만큼 길어집니다.
 * - 늦게 시작해도 끝나는 시각은 그대로입니다 (지연 시간만 기록됩니다).
 * - 시작 시각이 없는 카드(옛 계획에서 옮긴 것)이거나, 예정 종료가 이미 지났으면 지금부터 카드 길이만큼입니다.
 * - 일시정지해도 끝나는 시각은 늘지 않습니다. 일시정지한 시간은 실행 시간에서만 빠집니다.
 *
 *   (10/17 19:00 · 60분 카드)
 *   18:50 시작 -> 20:00 에 끝 (70분)       19:20 시작 -> 20:00 에 끝 (40분)
 *   20:30 시작 -> 21:30 에 끝 (예정이 지나서 60분)   시작 시각 없는 카드, 15:00 시작 -> 16:00
 */
export function getScheduledEndAt(
  card: Pick<Card, 'startTime' | 'durationMinutes'>,
  dateKey: string,
  startedAt: number,
): number {
  const durationMs = card.durationMinutes * MS_PER_MINUTE
  const plannedStartAt = getPlannedStartAt({ date: dateKey, startTime: card.startTime })
  if (plannedStartAt === null) return startedAt + durationMs
  const plannedEndAt = plannedStartAt + durationMs
  return plannedEndAt > startedAt ? plannedEndAt : startedAt + durationMs
}

/** 남은 시간 (밀리초, 0 밑으로는 안 내려감). 일시정지 중에도 시계는 흐릅니다 */
export function getRemainingMs(active: Pick<ActiveCardSession, 'endAt'>, now: number): number {
  return Math.max(0, active.endAt - now)
}

/** 지금까지 일시정지한 시간 합 (지금 일시정지 중인 것 포함) */
export function getPausedMs(
  active: Pick<ActiveCardSession, 'pauses' | 'pausedNow'>,
  now: number,
): number {
  const done = summarizePauses(active.pauses).pausedMs
  return done + (active.pausedNow ? Math.max(0, now - active.pausedNow.startedAt) : 0)
}

/**
 * 지금까지 실제로 한 시간 (일시정지 뺌)
 *
 *   19:00 시작, 19:20 ~ 19:25 일시정지, 지금 19:40 -> 35분
 */
export function getRunMs(
  active: Pick<ActiveCardSession, 'startedAt' | 'pauses' | 'pausedNow'>,
  now: number,
): number {
  return Math.max(0, now - active.startedAt - getPausedMs(active, now))
}

/**
 * 진행 중인 세션을 끝내고 저장할 기록을 만듭니다.
 * - endedAt: 끝낸 시각. 예정 종료를 넘겨서 끝내도 예정 종료 시각까지만 셉니다 (자리를 비운 시간이 실행으로 들어가지 않게)
 * - 일시정지 중에 끝내면 그 일시정지도 끝난 것으로 넣습니다.
 * - 예정 종료 전에 끝내면 endedEarly (중도 종료)
 */
export function finishActiveSession(
  active: ActiveCardSession,
  now: number,
  id: string,
): StudySession {
  const endedAt = Math.min(now, active.endAt)
  const pauses = active.pausedNow
    ? [
        ...active.pauses,
        closePause(active.pausedNow, Math.max(active.pausedNow.startedAt, endedAt)),
      ]
    : active.pauses
  return {
    id,
    subjectId: '',
    startedAt: active.startedAt,
    endedAt,
    ...summarizePauses(pauses),
    targetMinutes: active.plannedMinutes,
    kind: 'study',
    cardId: active.cardId,
    mode: active.mode,
    pauses,
    endedEarly: endedAt < active.endAt,
    endReport: { checked: active.checked },
    ...(active.memos.length > 0 ? { memos: active.memos } : {}),
  }
}

/** 지금의 일시정지를 끝난 일시정지로 바꿉니다. 알림을 보냈는지(alerted)는 기록에 남기지 않습니다 */
export function closePause(
  pausedNow: NonNullable<ActiveCardSession['pausedNow']>,
  endedAt: number,
): SessionPause {
  return {
    startedAt: pausedNow.startedAt,
    endedAt,
    tag: pausedNow.tag,
    ...(pausedNow.note ? { note: pausedNow.note } : {}),
  }
}

/** 일시정지가 이만큼(분) 넘으면 복귀 알림을 한 번 보냅니다 (「4.4」 일시정지) */
export const LONG_PAUSE_MINUTES = 15

/**
 * 복귀 알림을 보낼 때인지 — 일시정지 중이고, 15분이 지났고, 아직 안 보냈으면 true
 *
 *   19:20 에 멈춤, 지금 19:34 -> false     지금 19:35 -> true     이미 보냄 -> false
 */
export function shouldAlertLongPause(
  active: Pick<ActiveCardSession, 'pausedNow'>,
  now: number,
): boolean {
  const paused = active.pausedNow
  if (!paused || paused.alerted) return false
  return now - paused.startedAt >= LONG_PAUSE_MINUTES * MS_PER_MINUTE
}

/** 시각을 'HH:MM' 으로 (카드의 startTime 모양) */
function toTimeText(time: number): string {
  const date = new Date(time)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 지금 시각으로 즉석 카드를 만듭니다. (화면 코드가 Date.now() 를 직접 부르지 않게 여기서 시각을 찍습니다) */
export function createInstantCardNow(dateKey: string, minutes: number): Card {
  const now = Date.now()
  return createInstantCard(`card-${now}`, dateKey, now, minutes)
}

/**
 * [지금 시작] 으로 만드는 즉석 카드 — '언제 = 지금' 입니다 (「4.2 홈」).
 * 제목과 체크리스트는 종료 팝업에서 한 줄로 받으므로 처음에는 '지금 시작한 공부' 한 줄입니다.
 * 모든 세션이 카드에 붙어 있어야 분석이 깨지지 않기 때문에 만듭니다.
 */
export function createInstantCard(id: string, dateKey: string, now: number, minutes: number): Card {
  return {
    id,
    title: '지금 시작한 공부',
    date: dateKey,
    startTime: toTimeText(now),
    durationMinutes: minutes,
    checklist: [{ id: `${id}-item-0`, text: '지금 시작한 공부' }],
    priority: 'flexible',
    type: 'self',
    createdAt: now,
  }
}
