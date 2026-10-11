/**
 * 로그인 안 해도 열려야 하는 주소들입니다. RequireAuth 는 이 목록에 없는 주소를 모두 막습니다.
 * /support(도움 연결 안내)는 힘든 순간에 로그인 때문에 막히면 안 돼서 여기에 있습니다. (#96)
 */
const PUBLIC_PATHS = ['/login', '/signup', '/support']

/**
 * 로그인 없이 열어도 되는 주소인지 알려 줍니다.
 *
 * 새 페이지를 만들면 이 목록에 따로 적을 필요가 없습니다. 자동으로 막힙니다.
 * 로그인하러 가는 길(로그인·회원가입)과 도움 연결 안내만 PUBLIC_PATHS 에 적어 둡니다.
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
  /** 방금 이메일로 가입을 마치고 온 사람의 이메일. 로그인 칸에 미리 채워 둡니다. (가입 화면이 넘겨줍니다) */
  signedUpEmail?: string
}

/**
 * 로그인 화면으로 넘어온 쪽지에서 "방금 가입한 이메일" 을 꺼냅니다. 없으면 null 입니다.
 * 있으면 로그인 화면이 "가입이 끝났어요. 로그인해 주세요." 를 보여주고 이메일 칸을 채워 둡니다.
 */
export function getSignedUpEmail(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const email = (state as Record<string, unknown>).signedUpEmail
  return typeof email === 'string' && email !== '' ? email : null
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

/**
 * 로그인을 막 마친 사람이 갈 주소를 정합니다.
 *
 *   getAfterLoginPath(false, '/records') -> '/signup'   (가입 정보를 아직 안 적은 사람은 가입부터)
 *   getAfterLoginPath(true, '/records')  -> '/records'  (가려던 곳이 있으면 거기로)
 *   getAfterLoginPath(true, null)        -> '/'         (없으면 홈)
 */
export function getAfterLoginPath(hasSignedUp: boolean, returnPath: string | null): string {
  if (!hasSignedUp) return '/signup'
  return returnPath ?? '/'
}
