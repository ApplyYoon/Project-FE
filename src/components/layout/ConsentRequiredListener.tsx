import { CONSENT_REQUIRED_EVENT } from '@/lib/authStorage'
import { CONSENT_PATH } from '@/lib/consentApi'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// 내 계정(로그아웃 · 탈퇴) 화면의 주소
const ACCOUNT_PATH = '/settings/account'

/**
 * 서버가 저장 요청을 "최신 동의 문구에 동의해야 저장할 수 있다(403 CONSENT_REQUIRED)" 며 막으면,
 * 어느 화면에 있든 다시 동의 화면(/consent)으로 보냅니다. 동의하면 지금 화면으로 돌아옵니다. (#512)
 * 알림은 lib/api.ts 가 보냅니다. 테스트 로그인은 서버에 토큰을 보내지 않아서 이 알림이 오지 않습니다.
 * (RequireAuth 가 로그인한 사람의 화면에만 이걸 붙입니다)
 */
export function ConsentRequiredListener() {
  const navigate = useNavigate()
  const location = useLocation()
  // 돌아올 주소. 지금 화면의 주소 전체(?date=... 같은 뒷부분도)를 넘깁니다.
  const currentPath = location.pathname + location.search

  useEffect(() => {
    function handleConsentRequired() {
      // 이미 다시 동의 화면이면 그대로 둡니다. (같은 화면을 또 열지 않게)
      // 내 계정(로그아웃 · 탈퇴)도 그대로 둡니다. 동의하지 않은 사람도 나갈 수 있어야 하기 때문입니다.
      if (location.pathname === CONSENT_PATH || location.pathname === ACCOUNT_PATH) return
      navigate(`${CONSENT_PATH}?from=${encodeURIComponent(currentPath)}`)
    }
    window.addEventListener(CONSENT_REQUIRED_EVENT, handleConsentRequired)
    // 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(CONSENT_REQUIRED_EVENT, handleConsentRequired)
  }, [navigate, location.pathname, currentPath])

  return null
}
