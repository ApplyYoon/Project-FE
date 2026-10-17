import { AuthProvider } from '@/components/layout/AuthProvider'
import { useAppBridge } from '@/hooks/useAppBridge'
import { GOOGLE_PROVIDER_CLIENT_ID } from '@/lib/googleClient'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import { QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { RouterProvider } from 'react-router-dom'

export default function App() {
  // QueryClientProvider 로 감싸야 어느 화면에서든 useSuspenseQuery 로 서버 데이터를 받아올 수 있습니다. (lib/queryClient.ts)
  // AuthProvider 로 감싸야 어느 화면에서든 useAuth() 로 로그인 상태를 쓸 수 있습니다.
  // GoogleOAuthProvider 는 구글 연결 창 스크립트를 불러 두어서, 구글로 시작하기 버튼이 바로 창을 띄울 수 있게 합니다. (lib/googleClient.ts)
  // locale="ko": 구글 버튼의 글자를 한국어로 보여줍니다.
  return (
    <QueryClientProvider client={queryClient}>
      <GoogleOAuthProvider clientId={GOOGLE_PROVIDER_CLIENT_ID} locale="ko">
        <AuthProvider>
          <AppBridge />
          <RouterProvider router={router} />
        </AuthProvider>
      </GoogleOAuthProvider>
    </QueryClientProvider>
  )
}

/** 휴대폰 앱 안에서 열렸을 때 앱과 연결합니다. 화면에는 아무것도 그리지 않습니다. (hooks/useAppBridge.ts) */
function AppBridge() {
  useAppBridge()
  return null
}
