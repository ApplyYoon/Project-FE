import { AuthContext, type AuthContextValue } from '@/hooks/useAuth'
import {
  AUTH_STORAGE_KEY,
  UNAUTHORIZED_EVENT,
  loadAuth,
  loggedOutState,
  type AuthState,
} from '@/lib/authStorage'
import { clearServerMessages } from '@/lib/aiMessagesApi'
import { disconnectCalendar } from '@/lib/googleCalendar'
import { queryClient } from '@/lib/queryClient'
import { makeKey, saveData } from '@/lib/storage'
import { unsubscribeThisDevice } from '@/lib/webPush'
import type { AuthUser } from '@/types'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

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
    saveData(AUTH_STORAGE_KEY, auth)
  }, [auth])

  // 지금 로그인 정보를 함수들 안에서 바로 읽으려고 ref 에도 담아 둡니다. (useCallback 안에서는 처음 값만 보이기 때문입니다)
  const authRef = useRef(auth)
  useEffect(() => {
    authRef.current = auth
  }, [auth])

  // 다른 탭(또는 홈 화면 앱)에서 로그인·로그아웃하면 이 탭도 맞춥니다.
  // 브라우저는 다른 탭이 localStorage 를 바꾸면 'storage' 이벤트로 알려 줍니다. (같은 탭에서 바꾼 것은 오지 않습니다)
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      // event.key 가 null 이면 저장소가 통째로 지워진 것입니다. (모든 기록 지우기 등)
      if (event.key !== null && event.key !== makeKey(AUTH_STORAGE_KEY)) return
      const next = loadAuth()
      const current = authRef.current
      if (next.token === current.token && next.user?.id === current.user?.id) return
      // 사람이 바뀌었거나 로그아웃됐으니 서버에서 받아 둔 것을 비우고 따라갑니다. (로그아웃이면 문지기가 로그인 화면으로 보냅니다)
      queryClient.clear()
      setAuth(next)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // useCallback: 렌더링될 때마다 함수가 새로 만들어지지 않게 해서, 받아 쓰는 쪽이 괜히 다시 그려지지 않게 합니다.
  const login = useCallback((user: AuthUser, token: string) => {
    // 새로 로그인할 때마다 서버에서 받아 보관해 둔 것(내 정보 등)을 비웁니다.
    // 로그인한 채로 /login 에서 다른 계정으로 로그인하면, 안 비울 때 앞사람의 정보가 '내 계정' 칸에 남고 저장하면 새 계정에 덮어써집니다.
    queryClient.clear()
    // 다른 사람으로 바뀌었으면 앞사람의 서버 메시지와 구글 캘린더 연결도 이 기기에서 정리합니다. (로그아웃과 같은 이유)
    const previous = authRef.current
    if (previous.user !== null && previous.user.id !== user.id) {
      clearServerMessages()
      disconnectCalendar()
    }
    setAuth({ user, token })
  }, [])

  const logout = useCallback(() => {
    // 서버에서 받아 보관해 둔 것(내 정보 등)을 지웁니다. 안 지우면 같은 기기에서 다른 사람이 로그인했을 때 앞사람의 정보가 잠깐 보입니다.
    queryClient.clear()
    // 구글 캘린더 연결도 끊습니다. (이 기기의 출입증을 지우고 구글 쪽 허락도 취소)
    // 안 끊으면 같은 기기에서 다음 사람이 로그인했을 때 앞사람의 구글 일정이 홈 달력에 보입니다.
    disconnectCalendar()
    // 서버에서 받은 메시지도 이 기기에서 뺍니다. 안 빼면 다음 사람에게 앞사람 메시지가 보이고, 앞사람의 마지막 번호로 받기를 이어서 다음 사람의 메시지가 빠집니다.
    clearServerMessages()
    setAuth(loggedOutState)
  }, [])

  // 서버가 "누구인지 모르겠다(401)" 고 하면 api.ts 가 알려 줍니다. 그러면 로그아웃해서,
  // 문지기(RequireAuth)가 로그인 화면으로 보내게 합니다. (#198)
  // 로그인이 만료돼서 서버를 부를 수 없으니, 이 기기의 푸시 구독은 브라우저에서만 지웁니다.
  // 남겨 두면 같은 기기에서 다른 사람이 로그인했을 때 설정에 "켜져 있어요" 가 뜨고 앞사람 알림이 옵니다.
  useEffect(() => {
    function handleUnauthorized() {
      void unsubscribeThisDevice()
      logout()
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [logout])

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
