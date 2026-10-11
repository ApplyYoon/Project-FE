/**
 * 테스트 로그인: 서버(BE)가 배포되기 전에, 서버 없이 "로그인한 것처럼" 앱을 써 보는 기능입니다.
 * (화면은 pages/LoginPage.tsx 의 "테스트로 시작하기")
 *
 * 누구나 누를 수 있는 가짜 로그인이라, 진짜 로그인이 붙으면 꺼야 합니다.
 * 끄는 법: `.env`(배포는 Vercel 설정)에 VITE_TEST_LOGIN=false
 */
import type { AuthUser } from '@/types'

// 테스트 로그인에 쓰는 사람과 토큰입니다.
// 진짜 서버는 이 토큰을 모릅니다. 그래서 lib/api.ts 는 이 토큰을 서버에 보내지 않고,
// 로그인이 필요한 서버 기능(AI 요약 등)은 테스트 로그인에서 동작하지 않습니다.
export const testUser: AuthUser = { id: 'test-user', name: '테스트 사용자' }
export const TEST_TOKEN = 'fake-token'

/**
 * 테스트 로그인 버튼을 보여줄지 정합니다. 환경변수 VITE_TEST_LOGIN 의 값을 넣어서 부릅니다.
 * 'false' 라고 적었을 때만 끕니다. 서버가 배포되기 전에는 이것 말고 로그인할 방법이 없어서, 안 적으면 켜 둡니다.
 *
 *   isTestLoginEnabled(undefined) -> true   (안 적음)
 *   isTestLoginEnabled('true')    -> true
 *   isTestLoginEnabled('false')   -> false
 *   isTestLoginEnabled(' FALSE ') -> false  (대문자·공백이 섞여도 같은 뜻으로 봅니다)
 */
export function isTestLoginEnabled(envValue: string | undefined): boolean {
  return envValue?.trim().toLowerCase() !== 'false'
}
