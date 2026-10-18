import { Navigate, useLocation } from 'react-router-dom'

interface RedirectWithQueryProps {
  /** 넘겨 줄 새 주소. 예: '/cards' */
  to: string
  /** 새 주소에 더할 ?tab= 값. 예: 'report' (없으면 더하지 않습니다) */
  tab?: string
}

/**
 * 옛 주소로 들어오면 새 주소로 넘겨 줍니다. 이때 ?date= 같은 주소 뒤의 값은 그대로 가져갑니다. (#386)
 * 저장해 둔 주소나 예전 알림을 눌러도, 보던 날짜·보기가 그대로 열리게 하려는 것입니다.
 *
 *   <RedirectWithQuery to="/cards" />                    /planner?date=2026-10-11 → /cards?date=2026-10-11
 *   <RedirectWithQuery to="/records" tab="report" />    /report?view=monthly → /records?view=monthly&tab=report
 */
export function RedirectWithQuery({ to, tab }: RedirectWithQueryProps) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  if (tab !== undefined) params.set('tab', tab)
  const search = params.toString()

  // replace: 옛 주소를 뒤로 가기 기록에 남기지 않습니다. (뒤로 가기를 눌렀을 때 다시 넘겨지는 일이 없게)
  return <Navigate to={{ pathname: to, search: search ? `?${search}` : '' }} replace />
}
