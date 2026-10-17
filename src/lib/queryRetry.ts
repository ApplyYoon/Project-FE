import { ApiError, isConnectionError } from '@/lib/api'

/** 일시적인 문제로 실패했을 때 최대 몇 번 더 시도할지 (처음 시도는 세지 않습니다) */
const MAX_RETRIES = 2

/**
 * 서버에서 받아오다 실패했을 때, 다시 시도할지 정합니다. (TanStack Query 의 `retry` 에 넘겨서 씁니다)
 *
 * 다시 시도하면 되는 것은 "잠깐 안 되는 것" 뿐입니다.
 *   - 서버에 연결하지 못함 · 시간이 지남 (인터넷이 잠깐 끊김, 서버가 느림)  -> 다시 시도
 *   - 서버가 잠깐 아픔 (500 · 503 · 504 등 5xx)                              -> 다시 시도
 *   - 서버가 "그 요청은 안 돼" 라고 거절함 (400 · 401 · 404 · 409 …)          -> 다시 시도하지 않음 (다시 보내도 같습니다)
 *   - 서버가 이상한 모양의 답을 줌 (우리가 만드는 502)                        -> 다시 시도하지 않음 (다시 받아도 같습니다)
 * 그리고 최대 2번까지만 다시 시도해서, 계속 안 될 때 실패 안내가 너무 늦게 뜨지 않게 합니다.
 *
 *   shouldRetryQuery(0, new TypeError('Failed to fetch'))  -> true   (연결 실패)
 *   shouldRetryQuery(0, new ApiError('서버 오류', 503))     -> true
 *   shouldRetryQuery(0, new ApiError('없어요', 404))        -> false
 *   shouldRetryQuery(0, new ApiError('모양이 이상해요', 502)) -> false  (우리가 모양을 확인하다 던진 것)
 *   shouldRetryQuery(2, new TypeError('Failed to fetch'))  -> false  (이미 2번 다시 시도함)
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (isConnectionError(error)) return true
  // 502 는 서버가 준 답의 모양이 이상할 때 우리 쪽(lib/*Api.ts)이 던지는 값이라서 다시 받아도 같습니다.
  if (error instanceof ApiError) return error.status >= 500 && error.status !== 502
  return false
}
