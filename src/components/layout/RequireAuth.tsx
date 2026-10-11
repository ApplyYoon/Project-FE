import { useAuth } from '@/hooks/useAuth'
import { isPublicPath, type LoginRedirectState } from '@/lib/authRedirect'
import { hasSignupInfo } from '@/lib/signup'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

interface RequireAuthProps {
  children: ReactNode
}

/**
 * 로그인해야 볼 수 있는 화면을 감싸는 문지기입니다. (router.tsx 에서 화면을 이걸로 감쌉니다)
 *
 *   로그인 없이 열리는 주소     -> 로그인·회원가입·도움 연결 안내는 그대로 보여줍니다. (lib/authRedirect.ts 의 PUBLIC_PATHS)
 *   로그인 안 했다             -> /login 으로 보냅니다. 가려던 주소도 같이 넘겨서, 로그인하면 거기로 돌아가게 합니다.
 *   로그인했지만 가입을 안 마쳤다 -> /signup 으로 보냅니다. 가입을 건너뛰고 앱에 들어갈 수 없습니다.
 *   로그인했고 가입도 마쳤다     -> 감싼 화면을 그대로 보여줍니다.
 *
 * "막을 주소" 가 아니라 "열어 줄 주소" 를 적어 두는 방식이라, 새 페이지를 만들어도 따로 할 일이 없습니다.
 * (깜빡하고 안 적어도 막히는 쪽이 안전합니다)
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isLoggedIn } = useAuth()
  const location = useLocation()

  if (isPublicPath(location.pathname)) {
    return <>{children}</>
  }

  if (!isLoggedIn) {
    // 주소 전체를 넘깁니다. ?date=... 같은 뒷부분(search)과 #... (hash)도 함께 돌아가야 하기 때문입니다.
    const redirectState: LoginRedirectState = {
      from: location.pathname + location.search + location.hash,
    }

    // replace: 막힌 주소를 기록에 남기지 않습니다. 남기면 로그인 화면에서 뒤로가기를 눌렀을 때
    // 막힌 주소로 갔다가 다시 튕겨 나오는 일이 반복됩니다.
    return <Navigate to="/login" replace state={redirectState} />
  }

  // 로그인은 했지만 가입 정보(이름·동의 등)를 아직 안 적은 사람은 가입 화면으로 보냅니다.
  // 테스트 로그인으로 처음 들어온 사람이 여기에 해당합니다. (lib/testLogin.ts)
  // 이메일로 로그인한 사람은 서버에 가입을 마친 회원이라, 로그인할 때 "가입 마침" 표시를 해 둡니다. (LoginPage 의 markSignupDone)
  if (!hasSignupInfo()) {
    return <Navigate to="/signup" replace />
  }

  return <>{children}</>
}
