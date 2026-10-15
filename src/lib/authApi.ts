import { ApiError, api, isConnectionError } from '@/lib/api'
import type { School } from '@/lib/schoolSearch'
import type { SignupConsents } from '@/lib/signup'
import type { AuthUser } from '@/types'

/**
 * 서버(BE)에 로그인하고 가입하는 함수들입니다.
 *  - 이메일 · 비밀번호 로그인: 이미 이메일로 가입한 사람만 씁니다.
 *  - 구글로 시작하기 · 구글로 가입하기: 새로 오는 사람은 모두 구글로 가입합니다. (#319, 이메일 가입은 2026-10-15 에 뺐습니다)
 *
 * 서버(BE)와 정한 약속입니다. (BE 저장소의 docs/API.md "가입 · 로그인", BE 이슈 #97 · #19)
 *   로그인  POST /auth/login    { email, password }  -> 200 { token, user: { id, name } }
 *   실패    로그인 401 (이메일·비밀번호가 틀림) / 값이 틀리면 400
 *
 * ⚠️ 비밀번호는 서버로 보내기만 합니다. 브라우저 저장소(localStorage)에 넣지 않고, console.log 로도 찍지 않습니다.
 *    저장소에 넣으면 이 기기를 쓰는 누구나 읽을 수 있기 때문입니다. 비밀번호를 보관하고 확인하는 일은 서버가 합니다.
 */

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 멈춰도 로딩이 영원히 끝나지 않으면 안 되기 때문입니다. */
const REQUEST_TIMEOUT_MS = 10000

/** 로그인에 성공했을 때 서버가 돌려주는 값 */
export interface AuthResult {
  /** 로그인 열쇠(토큰) */
  token: string
  /** 로그인한 사람 */
  user: AuthUser
}

/** 서버가 준 값이 약속한 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) */
function isAuthResult(value: unknown): value is AuthResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  const user = result.user as Record<string, unknown> | null

  return (
    typeof result.token === 'string' &&
    result.token !== '' &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    typeof user.name === 'string'
  )
}

/**
 * 이메일과 비밀번호로 로그인합니다. 실패하면 에러(ApiError 등)를 던집니다.
 *
 *   const { token, user } = await loginWithPassword('tmax@starflow.com', '비밀번호')
 */
export async function loginWithPassword(email: string, password: string): Promise<AuthResult> {
  const result = await api<unknown>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!isAuthResult(result)) throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  return result
}

/* ---------- 구글로 시작하기 (#319, BE #19) ----------
 *   시작  POST /auth/google         { credential }                                         -> 200 LOGGED_IN 또는 SIGNUP_REQUIRED
 *   가입  POST /auth/google/signup  { credential, name, nickname, schoolCode, schoolName, consents } -> 201 { token, user }
 *   실패  400 (구글 확인 실패 · 한 시간이 지남) / 409 (같은 이메일의 이메일 계정 · 이미 가입) / 503 (서버에 구글 로그인이 꺼짐)
 * credential 은 구글 버튼이 준 신분증(ID 토큰)입니다. 진짜인지는 서버가 구글에 확인합니다.
 */

/** 구글로 시작했을 때의 결과. 가입한 사람이면 로그인 정보, 처음이면 가입 화면을 채울 이름·이메일 */
export type GoogleStartResult =
  | { status: 'LOGGED_IN'; auth: AuthResult }
  | { status: 'SIGNUP_REQUIRED'; name: string; email: string }

/** 구글 버튼이 준 신분증을 서버에 보냅니다. */
export async function startWithGoogle(credential: string): Promise<GoogleStartResult> {
  const result = await api<unknown>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const record = (typeof result === 'object' && result !== null ? result : {}) as Record<
    string,
    unknown
  >
  if (record.status === 'LOGGED_IN' && isAuthResult(record)) {
    return { status: 'LOGGED_IN', auth: { token: record.token, user: record.user } }
  }
  if (record.status === 'SIGNUP_REQUIRED' && typeof record.email === 'string') {
    const name = typeof record.name === 'string' ? record.name : ''
    return { status: 'SIGNUP_REQUIRED', name, email: record.email }
  }
  throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
}

/** 구글로 가입할 때 서버에 보내는 값. 이메일은 서버가 구글에서 확인한 값을 써서 보내지 않습니다 */
export interface GoogleSignupInput {
  credential: string
  name: string
  nickname: string
  /** 고른 고등학교. 안 골랐으면 null */
  school: School | null
  consents: SignupConsents
}

/** 구글로 가입합니다. 가입과 동시에 로그인돼서 로그인 정보를 돌려줍니다. */
export async function signupWithGoogle(input: GoogleSignupInput): Promise<AuthResult> {
  const result = await api<unknown>('/auth/google/signup', {
    method: 'POST',
    body: JSON.stringify({
      credential: input.credential,
      name: input.name,
      nickname: input.nickname,
      schoolCode: input.school?.code ?? null,
      schoolName: input.school?.name ?? null,
      consents: input.consents,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!isAuthResult(result)) throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  return result
}

// 서버는 켜져 있는데 이 API 가 없을 때(옛 버전의 서버) 보여줄 안내입니다.
const SERVER_NOT_READY_MESSAGE =
  '서버 로그인이 아직 준비되지 않았어요. 서버가 연결되면 쓸 수 있어요.'
// 서버에 닿지 못했을 때(서버가 꺼져 있음 · 인터넷 끊김 · 응답이 너무 늦음) 보여줄 안내입니다.
const SERVER_UNREACHABLE_MESSAGE = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'

/**
 * 이메일 로그인이 실패했을 때 화면에 보여줄 한 줄을 고릅니다.
 *
 *   로그인 401                -> '이메일 또는 비밀번호가 맞지 않아요.'
 *   404 (서버에 이 API 가 없음) -> '서버 로그인이 아직 준비되지 않았어요. …'
 *   서버에 닿지 못함           -> '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
 *   그 밖에 서버가 거절        -> 서버가 준 메시지  (예: 400 '비밀번호는 8자 이상으로 적어 주세요')
 */
export function getPasswordAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return '이메일 또는 비밀번호가 맞지 않아요.'
    // 404: 서버는 켜져 있지만 이 주소(API)가 아직 없다는 뜻입니다.
    if (error.status === 404) return SERVER_NOT_READY_MESSAGE
    return error.message
  }
  if (isConnectionError(error)) return SERVER_UNREACHABLE_MESSAGE
  return '알 수 없는 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 구글로 시작하기·가입이 실패했을 때 화면에 보여줄 한 줄을 고릅니다.
 *   400 · 409 · 503            -> 서버가 준 메시지 (예: '이미 이메일로 가입한 주소예요. 이메일로 로그인해 주세요')
 *   404 (서버에 이 API 가 없음) -> '서버 로그인이 아직 준비되지 않았어요. …'
 *   서버에 닿지 못함           -> '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
 */
export function getGoogleAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return SERVER_NOT_READY_MESSAGE
    return error.message
  }
  if (isConnectionError(error)) return SERVER_UNREACHABLE_MESSAGE
  return '알 수 없는 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
}
