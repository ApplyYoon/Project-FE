import { useAuth } from '@/hooks/useAuth'
import { isPublicPath, type LoginRedirectState } from '@/lib/authRedirect'
import { hasSignupInfo } from '@/lib/signup'
import { TEST_TOKEN } from '@/lib/testLogin'
import { THINKING_TEST_PATH, hasThinkingTest } from '@/lib/thinkingTest'
import { PLEDGE_PATH, hasSeenPledge } from '@/lib/voicePledge'
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
 *   로그인했지만 가입을 안 마쳤다 -> /signup 으로 보냅니다. 가입을 건너뛰고 앱에 들어갈 수 없습니다. (테스트 로그인은 예외)
 *   처음의 다짐 화면을 안 봤다   -> /onboarding/voice 로 딱 한 번 보냅니다. 건너뛰어도 됩니다. (테스트 로그인도 보냅니다)
 *   생각 습관 테스트를 안 했다   -> /onboarding/thinking 으로 보냅니다. (가입 설문·설정은 막지 않습니다. 테스트 로그인도 보냅니다)
 *   로그인했고 가입도 마쳤다     -> 감싼 화면을 그대로 보여줍니다.
 *
 * "막을 주소" 가 아니라 "열어 줄 주소" 를 적어 두는 방식이라, 새 페이지를 만들어도 따로 할 일이 없습니다.
 * (깜빡하고 안 적어도 막히는 쪽이 안전합니다)
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isLoggedIn, token } = useAuth()
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
  // 이메일로 로그인한 사람은 서버에 가입을 마친 회원이라, 로그인할 때 "가입 마침" 표시를 해 둡니다. (LoginPage 의 markSignupDone)
  // 테스트 로그인(lib/testLogin.ts)은 앱을 바로 둘러보려는 것이라 가입 화면으로 보내지 않습니다.
  // (테스트 로그인도 "가입 마침" 표시를 하지만, 그 표시가 생기기 전에 로그인해 둔 브라우저도 풀어 주려고 토큰으로 한 번 더 봅니다)
  const isTestLogin = token === TEST_TOKEN
  if (!hasSignupInfo() && !isTestLogin) {
    return <Navigate to="/signup" replace />
  }

  // 가입은 마쳤지만 생각 습관 테스트를 아직 안 한 사람은 테스트로 보냅니다. ("나는 어떤 생각 습관을 가졌는지" 부터 알아보게)
  // 가입 설문(/onboarding…)은 테스트 앞뒤로 이어지는 화면이라 막지 않습니다.
  // 설정(/settings…)도 막지 않습니다. 로그아웃·탈퇴는 언제나 할 수 있어야 하기 때문입니다.
  // (도움 연결 안내 /support 는 RequireAuth 로 감싸지 않아서 처음부터 막히지 않습니다)
  // 테스트 로그인도 보냅니다. 시연과 둘러보기에서도 "나는 어떤 생각 습관을 가졌는지" 부터 보여 주기 위해서입니다.
  const isTestFreePath =
    location.pathname.startsWith('/onboarding') || location.pathname.startsWith('/settings')

  // 처음의 다짐(#241)을 한 번도 안 본 사람은 생각 습관 테스트보다 먼저 다짐 화면으로 한 번 보냅니다.
  // 가입한 사람은 가입 직후 이 화면부터 지나가지만, 테스트 로그인은 가입·온보딩을 건너뛰어서 여기서 한 번 보여줍니다.
  // 한 번 보면(건너뛰어도) 다시 보내지 않습니다. 끝나면 ?from=start 를 보고 홈으로 갑니다. (OnboardingVoicePage)
  if (!isTestFreePath && !hasSeenPledge()) {
    return <Navigate to={`${PLEDGE_PATH}?from=start`} replace />
  }

  if (!hasThinkingTest() && !isTestFreePath) {
    return <Navigate to={THINKING_TEST_PATH} replace />
  }

  return <>{children}</>
}
