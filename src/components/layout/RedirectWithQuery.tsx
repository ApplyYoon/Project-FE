import { Navigate, useLocation } from 'react-router-dom'

interface RedirectWithQueryProps {
  /** 넘겨 줄 새 주소. 예: '/cards' */
  to: string
}

/**
 * 옛 주소로 들어오면 새 주소로 넘겨 줍니다. 이때 ?date= 같은 주소 뒤의 값은 그대로 가져갑니다. (#386)
 * 저장해 둔 주소나 예전 알림을 눌러도, 보던 날짜·보기가 그대로 열리게 하려는 것입니다.
 * (?tab= 을 더하는 기능은 리포트로 넘길 때만 써서, 리포트를 뺀 2026-10-23 에 지웠습니다)
 *
 *   <RedirectWithQuery to="/cards" />                    /planner?date=2026-10-11 → /cards?date=2026-10-11
 */
export function RedirectWithQuery({ to }: RedirectWithQueryProps) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const search = params.toString()

  // replace: 옛 주소를 뒤로 가기 기록에 남기지 않습니다. (뒤로 가기를 눌렀을 때 다시 넘겨지는 일이 없게)
  return <Navigate to={{ pathname: to, search: search ? `?${search}` : '' }} replace />
}
