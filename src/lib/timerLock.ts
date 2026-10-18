import { loadData } from '@/lib/storage'

/**
 * 타이머 잠금 (최종 기획서 「3 앱 구조」 타이머 잠금 규칙, #396)
 *
 * 공부 세션이 진행 중이면(일시정지 포함) 하단 탭을 숨기고 다른 화면으로 갈 수 없습니다.
 * 세션 화면을 나가는 길은 [일시정지] · [끝내기] 뿐이고, 그 팝업이 곧 데이터를 모으는 곳입니다.
 * 휴대폰 홈 버튼으로 앱을 벗어나는 것은 막을 수 없지만(OS 영역), 돌아오면 항상 세션 화면입니다.
 */

// 진행 중인 카드 세션을 넣어 두는 이름입니다. (실제 키는 'study-card-session')
// hooks/useCardSession.ts 가 저장하고, 여기서는 "진행 중인지" 만 봅니다.
export const CARD_SESSION_KEY = 'card-session'
// 놀기 타이머(2026-10-18 삭제)가 쓰던 이름. 예전 값이 남아 있어도 잠그지 않고, useCardSession 이 지웁니다.
export const OLD_PLAY_SESSION_KEY = 'play-session'

// 세션을 시작하거나 끝냈다고 같은 창의 다른 화면(Layout 등)에 알리는 이벤트 이름
export const TIMER_LOCK_EVENT = 'timer-lock-change'

/** 잠금이 걸리는 주소 — 세션 중에는 이 화면만 열립니다 */
export const TIMER_PATH = '/timer'

/** 저장된 값에 시작 시각이 있으면 진행 중으로 봅니다 */
function hasStartedAt(key: string): boolean {
  const saved = loadData<{ startedAt?: unknown } | null>(key, null)
  return typeof saved?.startedAt === 'number'
}

/** 지금 공부 세션이 진행 중인지 (일시정지 중도 진행 중입니다) */
export function isTimerLocked(): boolean {
  return hasStartedAt(CARD_SESSION_KEY)
}

/** 세션이 시작되거나 끝났다고 알립니다. (useCardSession 이 저장한 뒤에 부릅니다) */
export function notifyTimerLockChange(): void {
  window.dispatchEvent(new Event(TIMER_LOCK_EVENT))
}
