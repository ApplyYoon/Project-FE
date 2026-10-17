import type { AuthUser } from '@/types'
import { createContext, useContext } from 'react'

/** useAuth() 로 꺼내 쓰는 값입니다. */
export interface AuthContextValue {
  /** 로그인한 사람. 로그인 전이면 null */
  user: AuthUser | null
  /** 서버가 준 로그인 열쇠(토큰). 로그인 전이면 null */
  token: string | null
  /** 로그인했으면 true */
  isLoggedIn: boolean
  /** 로그인 정보를 저장합니다. 새로고침해도 유지됩니다. */
  login: (user: AuthUser, token: string) => void
  /** 로그인 정보를 지웁니다. */
  logout: () => void
}

// 값을 담아 두는 통입니다. <AuthProvider> 가 이 통에 값을 채워 주고, 아래 useAuth 가 꺼내 씁니다.
// null 은 "Provider 로 감싸지 않았다" 는 뜻입니다.
export const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * 로그인 상태를 앱 어디서나 꺼내 쓰는 훅입니다. (React Context 로 공유)
 *
 *   const { user, isLoggedIn, login, logout } = useAuth()
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)

  if (value === null) {
    // 감싸는 걸 깜빡했을 때, 이유를 바로 알 수 있게 알려줍니다.
    throw new Error('useAuth 는 <AuthProvider> 안에서만 쓸 수 있어요. App.tsx 를 확인해 보세요.')
  }

  return value
}
