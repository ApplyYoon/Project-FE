/** 로그인 화면으로 보낼 때 함께 넘겨 두는 쪽지의 모양입니다. (RequireAuth 가 쓰고, LoginPage 가 읽습니다) */
export interface LoginRedirectState {
  /** 로그인한 뒤 돌아갈 주소. 예: '/records?date=2026-10-01' */
  from: string
}

/**
 * 로그인 화면으로 넘어온 쪽지(location.state)에서 "돌아갈 주소" 를 꺼냅니다.
 * 쪽지가 없거나 모양이 이상하면 null 입니다.
 */
export function getReturnPath(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null

  const from = (state as Record<string, unknown>).from
  if (typeof from !== 'string') return null

  // 우리 앱 안의 주소('/' 로 시작)만 받습니다. '//' 로 시작하면 다른 사이트 주소로 읽힐 수 있어서 막습니다.
  if (!from.startsWith('/') || from.startsWith('//')) return null

  return from
}
