/**
 * 구글 연결(구글 캘린더 #314 · 구글로 시작하기 #319)에 쓰는 OAuth 클라이언트 ID 입니다.
 * .env.local · Vercel 의 VITE_GOOGLE_CLIENT_ID 에 넣습니다. (공개돼도 되는 값)
 * 구글 버튼과 창은 @react-oauth/google 이 만들고, App.tsx 의 GoogleOAuthProvider 가 이 ID 를 넘겨줍니다.
 */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''

/** 클라이언트 ID 가 있는지. 없으면 구글 버튼 대신 "준비 중" 을 보여 줍니다. */
export const isGoogleConfigured = GOOGLE_CLIENT_ID !== ''

/**
 * App.tsx 의 GoogleOAuthProvider 에 넘기는 ID 입니다.
 *
 * 클라이언트 ID 가 비어 있으면 구글 코드가 "Missing required parameter client_id" 에러를 던져서,
 * useGoogleLogin 을 부르는 화면(홈 달력)이 "문제가 생겼어요" 로 죽습니다.
 * 그래서 ID 가 없을 때는 아무 데도 쓰이지 않는 임시 값을 넘겨서 화면이 죽지 않게 합니다.
 * (ID 가 없으면 구글 버튼과 연결 버튼은 isGoogleConfigured 로 막아서 "준비 중" 이 보이므로, 이 임시 값으로 구글에 요청이 가는 일은 없습니다)
 *
 *   VITE_GOOGLE_CLIENT_ID 를 넣었을 때 -> 그 ID
 *   안 넣었거나 빈 글자일 때             -> 'google-client-id-not-set'
 */
export const GOOGLE_PROVIDER_CLIENT_ID = isGoogleConfigured
  ? GOOGLE_CLIENT_ID
  : 'google-client-id-not-set'
