import { ApiError, api } from '@/lib/api'
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
