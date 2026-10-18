/**
 * 공부 중 폰을 집어 들었을 때의 단계별 경고 규칙입니다. (React 없는 순수 함수)
 * 앱(Project-App)이 폰을 들고 놓을 때마다 알려 주면(브릿지 v1.3), 타이머 화면이 이 규칙으로 경고를 정합니다.
 * 화면 쪽은 hooks/usePhoneLift.ts 와 pages/CardTimerPage.tsx 의 SessionView 입니다.
 *
 * 단계 (관리 강도 "보통" 기준, 팀 회의안 2026-10-18)
 *   0  들고 10초까지      아무것도 안 함 (시간 확인 정도는 괜찮음)
 *   1  10초 넘음          진동 + 화면 위에 "다시 엎어 둘까?"
 *   2  20초 넘음          코치 말투 경고를 화면 전체에
 *   3  60초 넘음          세션을 일시정지하고 '폰 확인' 으로 기록
 * 관리 강도가 약하면 1단계 안내만 하고, 강하면 더 빨리 · 소리까지 냅니다.
 */
import type { FocusNudge } from '@/lib/appBridge'
import { loadData, saveData } from '@/lib/storage'

/** 경고 세기. 오늘의 관리 강도로 정합니다. (getLiftStrength) */
export type LiftStrength = 'soft' | 'normal' | 'strong'

/** 0 조용 · 1 안내 · 2 화면 전체 경고 · 3 자동 일시정지 */
export type LiftStage = 0 | 1 | 2 | 3

interface StageSeconds {
  /** 1단계(안내)를 띄우는 초 */
  notice: number
  /** 2단계(화면 전체 경고)를 띄우는 초. null 이면 없음 */
  overlay: number | null
  /** 3단계(자동 일시정지)를 하는 초. null 이면 없음 */
  pause: number | null
}

export const LIFT_STAGE_SECONDS: Record<LiftStrength, StageSeconds> = {
  // 약: 회복 · 당근 단계. 안내만 하고 멈추지 않습니다. (힘든 날 몰아붙이지 않게)
  soft: { notice: 15, overlay: null, pause: null },
  normal: { notice: 10, overlay: 20, pause: 60 },
  // 강: 채찍 단계. 더 빨리 알리고, 화면 전체 경고 때 소리도 냅니다. (SessionView)
  strong: { notice: 5, overlay: 15, pause: 45 },
}

/**
 * 오늘의 관리 강도(0 회복 ~ 3 채찍)와 4단계 여부로 경고 세기를 정합니다.
 *
 *   getLiftStrength(0, false) -> 'soft'
 *   getLiftStrength(2, false) -> 'normal'
 *   getLiftStrength(1, true)  -> 'strong'
 */
export function getLiftStrength(careLevel: number, isStage4: boolean): LiftStrength {
  if (isStage4 || careLevel >= 3) return 'strong'
  if (careLevel === 2) return 'normal'
  return 'soft'
}

/**
 * 폰을 들고 있은 시간(밀리초)으로 지금 단계를 정합니다.
 *
 *   getLiftStage(8_000, 'normal')  -> 0
 *   getLiftStage(25_000, 'normal') -> 2
 *   getLiftStage(90_000, 'soft')   -> 1   (약하면 1단계까지만)
 */
export function getLiftStage(liftedMs: number, strength: LiftStrength): LiftStage {
  const seconds = liftedMs / 1000
  const rule = LIFT_STAGE_SECONDS[strength]
  if (rule.pause !== null && seconds >= rule.pause) return 3
  if (rule.overlay !== null && seconds >= rule.overlay) return 2
  if (seconds >= rule.notice) return 1
  return 0
}

/**
 * 폰을 든 채 앱 밖(홈 · 다른 앱)으로 나갔을 때 앱이 띄울 알림들. 세기마다 개수와 말투가 다릅니다.
 * 앱은 나간 시각부터 afterSec 초 뒤에 띄우고, 돌아오면 지웁니다.
 */
export function getLiftNudges(strength: LiftStrength): FocusNudge[] {
  if (strength === 'soft') {
    return [{ afterSec: 60, title: '공부 중이었지?', body: '괜찮으면 돌아와서 이어 하자.' }]
  }
  if (strength === 'normal') {
    return [
      { afterSec: 10, title: '공부 중이야', body: '돌아와서 폰을 엎어 두자.' },
      { afterSec: 60, title: '1분 지났어', body: '지금 돌아오면 바로 이어서 할 수 있어.' },
    ]
  }
  return [
    { afterSec: 5, title: '공부 중이야!', body: '지금 바로 돌아와서 폰 엎어 둬.' },
    { afterSec: 30, title: '30초째 밖이야', body: '정한 공부 시간이야. 돌아오자.' },
    { afterSec: 60, title: '1분 넘었어', body: '세션이 멈춰 있어. 돌아와서 다시 시작하자.' },
  ]
}

/**
 * 공부할 때 휴대폰 방해 금지를 켤지. 관리 강도가 '강' 일 때만 켭니다. (안드로이드 앱만, 2026-10-18)
 * 끝나면 앱이 원래대로 되돌립니다.
 */
export function shouldTurnOnDnd(strength: LiftStrength): boolean {
  return strength === 'strong'
}

/** 'focus.start' 의 답에서 방해 금지 상태를 꺼냅니다. 없거나 모양이 틀리면 null (앱 밖 · 옛 앱) */
export function readDndState(reply: unknown): 'on' | 'off' | 'noPermission' | 'unsupported' | null {
  if (typeof reply !== 'object' || reply === null) return null
  const dnd = (reply as Record<string, unknown>).dnd
  return dnd === 'on' || dnd === 'off' || dnd === 'noPermission' || dnd === 'unsupported'
    ? dnd
    : null
}

/** 'focus.start' 의 답에서 이 폰에 엎기 센서가 없는지. 없으면 엎어도 알 수 없어서 [그냥 시작] 을 안내합니다. */
export function isFaceDownUnavailable(reply: unknown): boolean {
  if (typeof reply !== 'object' || reply === null) return false
  return (reply as Record<string, unknown>).faceDown === 'unavailable'
}

/** 한 세션 동안의 폰 기록 (앱이 'focus.end' 로 답한 숫자를 정리한 것) */
export interface PhoneLiftSummary {
  /** 5초 넘게 들고 있던 시간 합계 (밀리초) */
  liftedMs: number
  /** 5~30초 든 횟수 ("잠깐 확인") */
  checks: number
  /** 30초 넘게 든 횟수 ("들림") */
  longLifts: number
  /** 들고 있는 동안 앱 밖으로 나간 횟수 ("딴짓 의심") */
  outsideLifts: number
  /** 앱 밖에 있던 시간 합계 (밀리초) */
  outsideMs: number
}

/** 5초보다 짧게 든 것은 책상을 치거나 폰을 민 것으로 보고 셈에서 뺍니다. (팀 회의안) */
const IGNORE_UNDER_MS = 5_000
/** 이만큼 넘게 들면 "잠깐 확인" 이 아니라 "들림" 입니다. */
const LONG_LIFT_MS = 30_000

/**
 * 'focus.end' 의 답을 정리합니다. 모양이 틀리거나 답이 없었으면(앱 밖 · 옛 앱) null.
 *
 *   readPhoneSummary({ lifts: [{ at: 1, ms: 12000, inApp: true }], outsideMs: 0 })
 *     -> { liftedMs: 12000, checks: 1, longLifts: 0, outsideLifts: 0, outsideMs: 0 }
 */
export function readPhoneSummary(reply: unknown): PhoneLiftSummary | null {
  if (typeof reply !== 'object' || reply === null) return null
  const { lifts, outsideMs } = reply as Record<string, unknown>
  // lifts · outsideMs 가 없으면 v1.3 전의 옛 앱입니다.
  if (!Array.isArray(lifts) || typeof outsideMs !== 'number') return null

  const summary: PhoneLiftSummary = {
    liftedMs: 0,
    checks: 0,
    longLifts: 0,
    outsideLifts: 0,
    outsideMs: Math.max(0, outsideMs),
  }
  for (const lift of lifts) {
    if (typeof lift !== 'object' || lift === null) continue
    const { ms, inApp } = lift as Record<string, unknown>
    if (typeof ms !== 'number' || ms < IGNORE_UNDER_MS) continue
    summary.liftedMs += ms
    if (ms >= LONG_LIFT_MS) summary.longLifts += 1
    else summary.checks += 1
    if (inApp === false) summary.outsideLifts += 1
  }
  return summary
}

/** 밀리초 → '2분 10초' · '40초' */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}초`
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`
}

/**
 * 종료 팝업 · 코치 채팅에 쓰는 한 줄. 폰을 한 번도 안 들었으면 칭찬 한 줄입니다.
 *
 *   -> '폰을 든 시간 2분 10초 (잠깐 확인 3번 · 오래 든 것 1번) · 그중 앱 밖 1분 20초'
 *   -> '공부하는 동안 폰을 한 번도 안 들었어요 👏'
 */
export function formatPhoneSummary(summary: PhoneLiftSummary): string {
  if (summary.checks + summary.longLifts === 0 && summary.outsideMs === 0) {
    return '공부하는 동안 폰을 한 번도 안 들었어요 👏'
  }
  const counts = [
    summary.checks > 0 ? `잠깐 확인 ${summary.checks}번` : '',
    summary.longLifts > 0 ? `오래 든 것 ${summary.longLifts}번` : '',
  ].filter((text) => text !== '')
  const outside = summary.outsideMs > 0 ? ` · 그중 앱 밖 ${formatDuration(summary.outsideMs)}` : ''
  const countText = counts.length > 0 ? ` (${counts.join(' · ')})` : ''
  return `폰을 든 시간 ${formatDuration(summary.liftedMs)}${countText}${outside}`
}

// 저장소 이름 (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-phone-lifts')
const STORAGE_KEY = 'phone-lifts'
// 최근 세션 몇 개까지 남길지
const MAX_SAVED = 60

/**
 * 세션 번호마다 폰 기록을 남깁니다. 나중에 코치 채팅 · 분석이 "평소보다 폰을 많이 봤어" 처럼 쓰려고 둡니다.
 * 최근 60개만 남기고 오래된 것부터 지웁니다.
 */
export function savePhoneSummary(sessionId: string, summary: PhoneLiftSummary): void {
  const saved = loadPhoneSummaries()
  saved[sessionId] = summary
  const ids = Object.keys(saved)
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SAVED))) {
    delete saved[id]
  }
  saveData(STORAGE_KEY, saved)
}

/** 저장해 둔 세션별 폰 기록. 깨져 있으면 빈 객체 */
export function loadPhoneSummaries(): Record<string, PhoneLiftSummary> {
  const saved = loadData<unknown>(STORAGE_KEY, {})
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {}
  return saved as Record<string, PhoneLiftSummary>
}
