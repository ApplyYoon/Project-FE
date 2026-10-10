import type { CareLimits } from '@/lib/careLimits'
import { loadSavedWritings } from '@/lib/diarySafety'
import { getSafetyBrakeResult } from '@/lib/safetyBrake'
import { loadData, saveData } from '@/lib/storage'

/**
 * 집중 모드(#69)에 필요한 규칙과 저장을 모아 둔 파일입니다. (기획서 v2 5장 "강제적 채찍"의 1단계: 마찰형)
 *
 * 집중 모드 중에는 타이머만 보이고, 다른 화면으로 가려면 10초를 기다린 뒤 해제 이유를 한 줄 적어야 합니다.
 * 해제 기록은 벌이 아니라 "어떤 시간대에 약한지" 보여 주는 데이터입니다.
 *
 * ⚠️ 웹 앱은 휴대폰의 다른 앱(유튜브·게임)을 잠글 수 없습니다. 이 집중 모드는 우리 앱 안에서만 동작합니다.
 */

// 저장소에 넣는 이름들입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙입니다)
/** 지금 집중 모드 중인지. 켜져 있으면 { startedAt }, 꺼져 있으면 null */
const FOCUS_MODE_KEY = 'focus-mode'
/** 집중 모드를 해제한 기록 목록 */
const UNLOCK_RECORDS_KEY = 'focus-unlocks'

/** 집중 모드가 켜지거나 꺼질 때 보내는 신호 이름. 여러 화면(Layout·타이머)이 같이 바뀌도록 알려 줍니다. */
export const FOCUS_MODE_CHANGE_EVENT = 'focus-mode-change'

/** 해제 화면에서 이유를 쓰기 전에 기다리는 시간(초) */
export const UNLOCK_WAIT_SECONDS = 10
/** 해제 이유의 최대 글자 수 (한 줄) */
export const UNLOCK_REASON_MAX_LENGTH = 50
/** 해제 화면의 "빠르게 고르기" 버튼. 누르면 이유 칸에 그대로 들어갑니다. */
export const QUICK_UNLOCK_REASONS = ['급한 연락', '쉬는 시간', '그냥 하기 싫어']

/** 집중 모드 상태 */
export interface FocusModeState {
  /** 집중 모드를 켠 시각 (Date.now() 값) */
  startedAt: number
}

/** 집중 모드를 해제한 기록 한 개 */
export interface FocusUnlockRecord {
  id: string
  /** 집중 모드를 켠 시각 */
  startedAt: number
  /** 해제한 시각 */
  unlockedAt: number
  /** 해제 이유 (사용자가 적은 한 줄, 또는 자동 해제 안내 문구) */
  reason: string
  /** 사용자가 직접 푼 게 아니라 설정·안전 브레이크 때문에 자동으로 풀렸으면 true */
  isAuto: boolean
}

/**
 * 집중 모드를 쓸 수 있는 사용자인지 알려줍니다. (#59 설정)
 * "집중 모드 잠금 허용" 을 켰고, 관리 강도 최대 한도가 4(강제적 채찍)일 때만 true 입니다.
 *
 *   { allowFocusMode: true,  maxCareLevel: 4 } -> true
 *   { allowFocusMode: true,  maxCareLevel: 3 } -> false  (강제적 채찍까지 허용하지 않음)
 *   { allowFocusMode: false, maxCareLevel: 4 } -> false  (잠금을 허용하지 않음)
 */
export function canUseFocusMode(
  limits: Pick<CareLimits, 'allowFocusMode' | 'maxCareLevel'>,
): boolean {
  return limits.allowFocusMode && limits.maxCareLevel === 4
}

/**
 * 해제 이유로 받아도 되는 글인지 알려줍니다. 앞뒤 빈칸을 뺀 글자가 1자 이상, 50자 이하여야 합니다.
 *
 *   '엄마가 불러서' -> true
 *   '   '          -> false  (빈칸만 있음)
 */
export function isValidUnlockReason(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length > 0 && trimmed.length <= UNLOCK_REASON_MAX_LENGTH
}

/**
 * 집중 모드를 자동으로 풀어야 하는 이유를 돌려줍니다. 풀 필요가 없으면 null 입니다.
 * 안전 브레이크(#95)가 설정보다 먼저입니다.
 *
 *   { canUse: true,  isSafetyBrakeOn: false } -> null
 *   { canUse: true,  isSafetyBrakeOn: true }  -> '지금은 쉬어 가는 게 좋아서 ...'
 *   { canUse: false, isSafetyBrakeOn: false } -> '설정에서 ...'
 */
export function getAutoUnlockReason(input: {
  canUse: boolean
  isSafetyBrakeOn: boolean
}): string | null {
  if (input.isSafetyBrakeOn) return '지금은 쉬어 가는 게 좋아서 집중 모드를 풀었어요.'
  if (!input.canUse) return '설정에서 집중 모드 잠금을 꺼서 집중 모드가 풀렸어요.'
  return null
}

/**
 * 지금 안전 브레이크(#95)가 켜져 있는지 확인합니다.
 * 체크인·일기·성찰 일기에 저장된 글과 기분으로 판정합니다. (시험 목록 #80 은 아직 없어서 빈 배열)
 * 관리 강도(#28)와 같은 기준으로 stopWhip 또는 recoveryMode 면 켜진 것으로 봅니다.
 */
export function isSafetyBrakeOnNow(): boolean {
  const { texts, moods } = loadSavedWritings()
  const brake = getSafetyBrakeResult({
    now: new Date(),
    recentTexts: texts,
    recentMoods: moods,
    exams: [],
  })
  return brake.stopWhip || brake.recoveryMode
}

/** 저장된 집중 모드 상태를 불러옵니다. 꺼져 있거나 모양이 이상하면 null 입니다. */
export function loadFocusMode(): FocusModeState | null {
  const saved = loadData<unknown>(FOCUS_MODE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const startedAt = (saved as Record<string, unknown>).startedAt
  return typeof startedAt === 'number' && Number.isFinite(startedAt) ? { startedAt } : null
}

/** 다른 화면들에게 "집중 모드가 바뀌었어" 라고 알려 줍니다. */
function notifyChange() {
  window.dispatchEvent(new Event(FOCUS_MODE_CHANGE_EVENT))
}

/** 집중 모드를 켭니다. */
export function startFocusMode(now: number = Date.now()): void {
  saveData(FOCUS_MODE_KEY, { startedAt: now })
  notifyChange()
}

/** 해제 기록 목록을 불러옵니다. 없으면 빈 목록입니다. */
export function loadUnlockRecords(): FocusUnlockRecord[] {
  const saved = loadData<unknown>(UNLOCK_RECORDS_KEY, [])
  return Array.isArray(saved) ? (saved as FocusUnlockRecord[]) : []
}

/**
 * 집중 모드를 끄고, 해제한 시각과 이유를 기록합니다.
 * 이미 꺼져 있으면 아무것도 하지 않습니다. (두 화면이 동시에 끄려고 해도 기록이 두 번 남지 않게)
 */
export function endFocusMode(reason: string, isAuto: boolean, now: number = Date.now()): void {
  const current = loadFocusMode()
  if (current === null) return

  const record: FocusUnlockRecord = {
    id: `unlock-${now}`,
    startedAt: current.startedAt,
    unlockedAt: now,
    reason: reason.trim().slice(0, UNLOCK_REASON_MAX_LENGTH),
    isAuto,
  }
  saveData(UNLOCK_RECORDS_KEY, [...loadUnlockRecords(), record])
  saveData(FOCUS_MODE_KEY, null)
  notifyChange()
}
