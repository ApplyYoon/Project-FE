/**
 * 서버(BE)에 요청을 보내는 함수입니다.
 *
 * 서버 주소는 코드에 적지 않고 환경변수(VITE_API_BASE_URL)에서 읽습니다. (#197)
 * 내 컴퓨터용·배포용으로 바꿀 때 코드를 고치지 않고 `.env`(또는 Vercel 설정)만 바꾸면 됩니다.
 * 견본은 저장소 맨 위의 `.env.example` 입니다.
 */

/** 환경변수를 안 넣었을 때 쓰는 주소. 내 컴퓨터에서 켠 BE 서버입니다. (BE 의 모든 API 는 /api/v1 로 시작합니다) */
export const DEFAULT_API_BASE_URL = 'http://localhost:8080/api/v1'

/**
 * 서버 주소를 정합니다.
 *   - 환경변수가 있으면 그 값, 없거나 빈 글자면 기본값
 *   - 끝의 '/' 는 지웁니다. (api('/subjects') 와 이어 붙일 때 '//' 가 생기지 않게)
 *
 *   'http://localhost:8080/api/v1/'  -> 'http://localhost:8080/api/v1'
 *   undefined 또는 ''                -> DEFAULT_API_BASE_URL
 */
export function resolveApiBaseUrl(envValue: string | undefined): string {
  const value = envValue?.trim()
  return (value ? value : DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

const BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

/** 서버가 200번대가 아닌 응답을 줬을 때 던지는 에러입니다. */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * 사용 예:
 *   const status = await api<{ status: string }>('/health')
 *   await api('/subjects', { method: 'POST', body: JSON.stringify(newSubject) })
 *
 * 에러는 두 가지입니다. 호출하는 쪽에서 try/catch 로 구분해서 안내하면 앱 화면이 멈추지 않습니다.
 *   - 서버가 답했는데 실패(4xx·5xx): ApiError (error.status 로 번호를 봅니다)
 *   - 서버가 꺼져 있거나 주소가 틀려서 연결 자체가 안 됨: 브라우저가 던지는 TypeError 그대로
 *     (예: authApi 를 쓰는 로그인 처리 화면이 "서버에 연결하지 못했어요" 로 안내합니다)
 */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new ApiError(`요청에 실패했습니다 (${response.status})`, response.status)
  }

  // 204 No Content 처럼 본문이 없는 응답 대비
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
