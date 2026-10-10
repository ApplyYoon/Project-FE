import { useAuth } from '@/hooks/useAuth'
import type { LoginRedirectState } from '@/lib/authRedirect'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

/**
 * 로그인해야 볼 수 있는 페이지들을 감싸는 문지기입니다. (router.tsx 에서 페이지들을 이걸로 감쌉니다)
 *
 *   로그인했다   -> <Outlet /> 자리에 안쪽 페이지를 그대로 보여줍니다.
 *   로그인 안 했다 -> /login 으로 보냅니다. 가려던 주소도 같이 넘겨서, 로그인하면 거기로 돌아가게 합니다.
 *
 * 로그인·회원가입·SNS 콜백 페이지는 이 문지기 밖에 두어야 합니다. (안 그러면 로그인하러 가는 길도 막혀 버립니다)
 */
export function RequireAuth() {
  const { isLoggedIn } = useAuth()
  const location = useLocation()

  if (!isLoggedIn) {
    // 주소 전체를 넘깁니다. ?date=... 같은 뒷부분(search)과 #... (hash)도 함께 돌아가야 하기 때문입니다.
    const redirectState: LoginRedirectState = {
      from: location.pathname + location.search + location.hash,
    }

    // replace: 막힌 주소를 기록에 남기지 않습니다. 남기면 로그인 화면에서 뒤로가기를 눌렀을 때
    // 막힌 주소로 갔다가 다시 튕겨 나오는 일이 반복됩니다.
    return <Navigate to="/login" replace state={redirectState} />
  }

  return <Outlet />
}
