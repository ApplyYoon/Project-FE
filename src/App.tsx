import { AuthProvider } from '@/components/layout/AuthProvider'
import { GOOGLE_CLIENT_ID } from '@/lib/googleClient'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import { QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { RouterProvider } from 'react-router-dom'

export default function App() {
  // QueryClientProvider 로 감싸야 어느 화면에서든 useSuspenseQuery 로 서버 데이터를 받아올 수 있습니다. (lib/queryClient.ts)
  // AuthProvider 로 감싸야 어느 화면에서든 useAuth() 로 로그인 상태를 쓸 수 있습니다.
  // GoogleOAuthProvider 는 구글 연결 창 스크립트를 불러 두어서, 구글로 시작하기 · 구글 캘린더 연결 버튼이 바로 창을 띄울 수 있게 합니다. (lib/googleClient.ts)
  // locale="ko": 구글 버튼의 글자를 한국어로 보여줍니다.
  return (
    <QueryClientProvider client={queryClient}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID} locale="ko">
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </GoogleOAuthProvider>
    </QueryClientProvider>
  )
}
