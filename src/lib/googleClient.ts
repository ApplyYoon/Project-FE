/**
 * 구글 연결(구글 캘린더 #314 · 구글로 시작하기 #319)에 쓰는 OAuth 클라이언트 ID 입니다.
 * .env.local · Vercel 의 VITE_GOOGLE_CLIENT_ID 에 넣습니다. (공개돼도 되는 값)
 * 구글 버튼과 창은 @react-oauth/google 이 만들고, App.tsx 의 GoogleOAuthProvider 가 이 ID 를 넘겨줍니다.
 */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''

/** 클라이언트 ID 가 있는지. 없으면 구글 버튼 대신 "준비 중" 을 보여 줍니다. */
export const isGoogleConfigured = GOOGLE_CLIENT_ID !== ''
