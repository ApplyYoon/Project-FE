import { isRecordsPath } from '@/lib/recordsMenu'

/**
 * 앱의 주요 메뉴 목록입니다.
 * PC 헤더 메뉴와 모바일 하단 탭이 이 목록을 같이 씁니다.
 * 메뉴를 추가·변경하려면 여기 한 곳만 고치면 됩니다.
 */
export const navItems = [
  { to: '/', label: '홈' },
  { to: '/planner', label: '계획' },
  { to: '/timer', label: '타이머' },
  { to: '/records', label: '기록' },
  { to: '/settings', label: '설정' },
]

/**
 * 지금 주소에서 이 메뉴를 "선택된 모양" 으로 보여줄지 알려줍니다.
 * NavLink 는 주소가 똑같을 때만 선택되므로, "기록" 처럼 아래에 다른 화면(리포트·사용설명서 등)이
 * 묶인 메뉴는 여기서 따로 확인합니다. (NavLink 의 isActive 와 함께 씁니다)
 */
export function isNavItemSelected(to: string, pathname: string): boolean {
  if (to === '/records') return isRecordsPath(pathname)
  return false
}
