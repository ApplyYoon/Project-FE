import { AuthProvider } from '@/components/layout/AuthProvider'
import { router } from '@/router'
import { RouterProvider } from 'react-router-dom'

export default function App() {
  // AuthProvider 로 감싸야 어느 화면에서든 useAuth() 로 로그인 상태를 쓸 수 있습니다.
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
