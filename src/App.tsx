import { AuthProvider } from '@/components/layout/AuthProvider'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

export default function App() {
  // QueryClientProvider 로 감싸야 어느 화면에서든 useSuspenseQuery 로 서버 데이터를 받아올 수 있습니다. (lib/queryClient.ts)
  // AuthProvider 로 감싸야 어느 화면에서든 useAuth() 로 로그인 상태를 쓸 수 있습니다.
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
