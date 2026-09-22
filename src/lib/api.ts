/**
 * 서버에 요청을 보내는 함수입니다.
 *
 * 아직 우리 서버가 없다면 연습용 공개 API 를 그대로 쓰면 됩니다.
 * 나중에 진짜 서버가 생기면 BASE_URL 만 바꾸세요.
 */
const BASE_URL = 'https://jsonplaceholder.typicode.com'

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
 *   const posts = await api<Post[]>('/posts')
 *   await api('/posts', { method: 'POST', body: JSON.stringify(newPost) })
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
