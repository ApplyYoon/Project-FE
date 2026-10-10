import { ApiError, api, isConnectionError } from '@/lib/api'
import type { School } from '@/lib/schoolSearch'
import type { SignupConsents } from '@/lib/signup'
import type { AuthUser } from '@/types'

/**
 * SNS 로그인이 끝나고 돌아왔을 때, 주소에 붙어 온 코드를 우리 서버에 보내서 로그인 토큰으로 바꿉니다.
 *
 * ⚠️ 서버 API 는 아직 없습니다. 아래 주소·응답 모양은 BE 와 정해야 하고, 정해지면 이 파일만 고치면 됩니다.
 *   요청  POST /auth/sns-login   { code, provider }
 *   응답  { token, user: { id, name }, isNewUser }
 */

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 멈춰도 로딩이 영원히 끝나지 않으면 안 되기 때문입니다. */
const REQUEST_TIMEOUT_MS = 10000

/** 서버가 돌려주는 로그인 결과 */
export interface SnsLoginResult {
  /** 로그인 열쇠(토큰) */
  token: string
  /** 로그인한 사람 */
  user: AuthUser
  /** true 면 처음 온 사람(회원가입 추가 정보가 필요), false 면 기존 회원 */
  isNewUser: boolean
}

/** 서버가 준 값이 약속한 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) */
function isSnsLoginResult(value: unknown): value is SnsLoginResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  const user = result.user as Record<string, unknown> | null

  return (
    typeof result.token === 'string' &&
    result.token !== '' &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof result.isNewUser === 'boolean'
  )
}

/**
 * 코드를 서버에 보내고 로그인 결과를 받습니다. 실패하면 에러(ApiError 등)를 던집니다.
 *
 *   const { token, user, isNewUser } = await exchangeSnsCode(code, 'kakao')
 */
export async function exchangeSnsCode(code: string, provider?: string): Promise<SnsLoginResult> {
  const result = await api<unknown>('/auth/sns-login', {
    method: 'POST',
    body: JSON.stringify({ code, provider }),
    // 정해 둔 시간이 지나면 요청을 끊고 에러로 처리합니다.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!isSnsLoginResult(result)) {
    // 502: 서버가 이상한 응답을 줬다는 뜻으로 씁니다.
    throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  }

  return result
}

/* ---------- 일반 로그인 (이메일 · 비밀번호) ----------
 *
 * ⚠️ 이 서버 API 도 아직 없습니다. 아래 주소·모양은 FE 가 먼저 적어 본 것이고, BE 와 정해지면 이 파일만 고치면 됩니다.
 *   로그인  POST /auth/login    { email, password }                                            -> { token, user: { id, name } }
 *   가입    POST /auth/signup   { email, password, name, nickname, schoolCode, schoolName, consents } -> 201 + JSON 아무 값 (예: { "ok": true })
 *   실패    로그인 401 (이메일·비밀번호가 틀림) / 가입 409 (이미 가입한 이메일)
 *
 * 가입은 계정만 만듭니다. 가입한 뒤에는 로그인 화면에서 이메일·비밀번호로 로그인합니다. (가입 응답으로 토큰을 받지 않습니다)
 * ⚠️ 가입 응답의 본문은 비어 있으면 안 됩니다. api() 가 응답을 JSON 으로 읽기 때문입니다. (본문이 없는 응답은 204 만 됩니다)
 *
 * ⚠️ 비밀번호는 서버로 보내기만 합니다. 브라우저 저장소(localStorage)에 넣지 않고, console.log 로도 찍지 않습니다.
 *    저장소에 넣으면 이 기기를 쓰는 누구나 읽을 수 있기 때문입니다. 비밀번호를 보관하고 확인하는 일은 서버가 합니다.
 */

/** 로그인·가입에 성공했을 때 서버가 돌려주는 값 */
export interface AuthResult {
  /** 로그인 열쇠(토큰) */
  token: string
  /** 로그인한 사람 */
  user: AuthUser
}

/** 이메일로 가입할 때 서버에 보내는 값 */
export interface PasswordSignupInput {
  email: string
  password: string
  name: string
  nickname: string
  /** 고른 고등학교. 안 골랐으면 null */
  school: School | null
  consents: SignupConsents
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
 *   const { token, user } = await loginWithPassword('study@example.com', '비밀번호')
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

/**
 * 이메일과 비밀번호로 가입합니다. 계정만 만들고 로그인은 하지 않습니다. 실패하면 에러를 던집니다.
 * (성공하면 가입 화면이 로그인 화면으로 보냅니다)
 */
export async function signupWithPassword(input: PasswordSignupInput): Promise<void> {
  await api<unknown>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      name: input.name,
      nickname: input.nickname,
      // 학교는 번호와 이름만 보냅니다. 안 골랐으면 둘 다 null 입니다.
      schoolCode: input.school?.code ?? null,
      schoolName: input.school?.name ?? null,
      consents: input.consents,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

// 서버가 꺼져 있거나 이 API 가 아직 없을 때 보여줄 안내입니다.
const SERVER_NOT_READY_MESSAGE =
  '서버 로그인이 아직 준비되지 않았어요. 서버가 연결되면 쓸 수 있어요.'

/**
 * 일반 로그인·가입이 실패했을 때 화면에 보여줄 한 줄을 고릅니다.
 *
 *   로그인 401                -> '이메일 또는 비밀번호가 맞지 않아요.'
 *   가입 409                  -> '이미 가입한 이메일이에요. 로그인해 주세요.'
 *   서버가 꺼져 있음 · 404     -> '서버 로그인이 아직 준비되지 않았어요. …'   (지금은 BE 에 이 API 가 없습니다)
 *   그 밖에 서버가 거절        -> 서버가 준 메시지
 */
export function getPasswordAuthErrorMessage(error: unknown, kind: 'login' | 'signup'): string {
  if (error instanceof ApiError) {
    if (kind === 'login' && error.status === 401) return '이메일 또는 비밀번호가 맞지 않아요.'
    if (kind === 'signup' && error.status === 409)
      return '이미 가입한 이메일이에요. 로그인해 주세요.'
    // 404: 서버는 켜져 있지만 이 주소(API)가 아직 없다는 뜻입니다.
    if (error.status === 404) return SERVER_NOT_READY_MESSAGE
    return error.message
  }
  if (isConnectionError(error)) return SERVER_NOT_READY_MESSAGE
  return '알 수 없는 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
}
