/** 로그인 안 해도 열려야 하는 주소들입니다. RequireAuth 는 이 목록에 없는 주소를 모두 막습니다. */
const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback']

/**
 * 로그인 없이 열어도 되는 주소인지 알려 줍니다.
 *
 * 새 페이지를 만들면 이 목록에 따로 적을 필요가 없습니다. 자동으로 막힙니다.
 * 로그인하러 가는 길(로그인·회원가입·SNS 콜백)만 PUBLIC_PATHS 에 적어 둡니다.
 */
export function isPublicPath(pathname: string): boolean {
  // 라우터는 대문자·소문자와 끝의 '/' 를 구분하지 않고 같은 주소로 보기 때문에, 여기서도 똑같이 맞춰서 비교합니다.
  const normalized = pathname.toLowerCase().replace(/\/+$/, '')
  return PUBLIC_PATHS.includes(normalized)
}

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
