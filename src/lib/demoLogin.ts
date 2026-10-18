/**
 * 시연 코드 로그인: 앱(Project-App) 안의 웹 화면처럼 구글 로그인이 막힌 곳에서,
 * 시연 때 정해 둔 코드로 "시연 계정" 에 로그인해 진짜 서버 · AI 를 쓰는 기능입니다. (2026-10-18)
 * (화면은 pages/LoginPage.tsx 의 "시연 코드로 로그인", 서버는 BE POST /auth/demo-login)
 *
 * 테스트 로그인(lib/testLogin.ts)과 다른 점
 *   - 테스트 로그인: 서버 없이 가짜로 로그인 → 시연 대본만 돕니다. 누구나 누를 수 있습니다.
 *   - 시연 코드 로그인: 서버가 코드를 확인하고 진짜 토큰을 줍니다 → 구글로 로그인한 것과 똑같이 서버 · AI 를 씁니다.
 *
 * 코드 값은 FE 에 넣지 않습니다. 서버(Render)의 환경변수 DEMO_LOGIN_CODE 에만 있고, 시연하는 사람이 직접 입력합니다.
 */

/**
 * 시연 코드 로그인 칸을 보여줄지 정합니다. 환경변수 VITE_DEMO_CODE_LOGIN 의 값을 넣어서 부릅니다.
 * 테스트 로그인과 반대로 'true' 라고 적었을 때만 켭니다. (앱용 웹 starflow-app-web 에만 켜 둡니다)
 *
 *   isDemoCodeLoginEnabled(undefined) -> false  (안 적음)
 *   isDemoCodeLoginEnabled('true')    -> true
 *   isDemoCodeLoginEnabled(' TRUE ')  -> true   (대문자 · 공백이 섞여도 같은 뜻으로 봅니다)
 *   isDemoCodeLoginEnabled('false')   -> false
 */
export function isDemoCodeLoginEnabled(envValue: string | undefined): boolean {
  return envValue?.trim().toLowerCase() === 'true'
}
