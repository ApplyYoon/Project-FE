import { AuthContext, type AuthContextValue } from '@/hooks/useAuth'
import { loadData, saveData } from '@/lib/storage'
import type { AuthUser } from '@/types'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-auth' 가 됩니다)
const STORAGE_KEY = 'auth'

/** 저장해 두는 로그인 정보입니다. 둘 다 null 이면 로그인 전입니다. */
interface AuthState {
  user: AuthUser | null
  token: string | null
}

const loggedOutState: AuthState = { user: null, token: null }

/** 저장소에서 꺼낸 값이 우리가 저장한 모양이 맞는지 확인합니다. (깨진 값을 로그인으로 착각하면 안 되기 때문입니다) */
function isAuthState(value: unknown): value is AuthState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>

  // 로그아웃 상태: 둘 다 null
  if (state.user === null && state.token === null) return true

  // 로그인 상태: 사용자(id·이름)와 토큰이 모두 있어야 합니다.
  const user = state.user as Record<string, unknown> | null
  return (
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof state.token === 'string' &&
    state.token !== ''
  )
}

/** 저장된 로그인 정보를 불러옵니다. 없거나 깨져 있으면 "로그인 전" 입니다. */
function loadAuth(): AuthState {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  return isAuthState(saved) ? saved : loggedOutState
}

interface AuthProviderProps {
  children: ReactNode
}

/**
 * 로그인 상태를 들고 있다가 아래의 모든 화면에 나눠 주는 컴포넌트입니다. (App.tsx 에서 앱 전체를 감쌉니다)
 *
 * 참고: 토큰을 localStorage 에 두면 페이지 안의 스크립트가 읽을 수 있습니다.
 * 지금은 팀이 정한 방식(#6 저장 함수)을 쓰고, 서버를 연결할 때 저장 방식을 다시 정합니다.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  // 처음 한 번만 저장소에서 불러옵니다. 그래서 새로고침해도 로그인이 유지됩니다.
  const [auth, setAuth] = useState<AuthState>(loadAuth)

  // 로그인·로그아웃으로 바뀔 때마다 저장합니다. 로그아웃하면 토큰도 null 로 덮어써서 남지 않습니다.
  useEffect(() => {
    saveData(STORAGE_KEY, auth)
  }, [auth])

  // useCallback: 렌더링될 때마다 함수가 새로 만들어지지 않게 해서, 받아 쓰는 쪽이 괜히 다시 그려지지 않게 합니다.
  const login = useCallback((user: AuthUser, token: string) => {
    setAuth({ user, token })
  }, [])

  const logout = useCallback(() => {
    setAuth(loggedOutState)
  }, [])

  // useMemo: 로그인 정보가 바뀔 때만 값을 새로 만듭니다.
  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth.user,
      token: auth.token,
      isLoggedIn: auth.user !== null && auth.token !== null,
      login,
      logout,
    }),
    [auth, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
