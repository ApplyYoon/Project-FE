import { ANALYSIS_PATH, isAnalysisPath, isCounselPath } from '@/lib/tabMenu'

/**
 * 앱의 주요 메뉴 목록입니다. (기획서 3장 5탭, #386)
 * PC 헤더 메뉴와 모바일 하단 탭이 이 목록을 같이 씁니다.
 * 메뉴를 추가·변경하려면 여기 한 곳만 고치면 됩니다.
 * 설정은 탭에 없고 홈 오른쪽 위 톱니 아이콘으로 갑니다. (HomePage)
 */
export const navItems = [
  { to: '/', label: '홈' },
  { to: '/cards', label: '카드' },
  { to: '/timer', label: '타이머' },
  { to: '/counsel', label: '상담' },
  { to: ANALYSIS_PATH, label: '분석' },
]

/**
 * 지금 주소에서 이 메뉴를 "선택된 모양" 으로 보여줄지 알려줍니다.
 * NavLink 는 주소가 똑같을 때만 선택되므로, "분석" · "상담" 처럼 아래에 다른 화면(시험·일기 등)이
 * 묶인 메뉴는 여기서 따로 확인합니다. (NavLink 의 isActive 와 함께 씁니다)
 */
export function isNavItemSelected(to: string, pathname: string): boolean {
  // 목표 만들기(/goals/new)는 카드 탭에서 들어오는 화면이라 카드 탭을 선택된 모양으로 둡니다. (#391)
  if (to === '/cards') return pathname.startsWith('/goals')
  if (to === ANALYSIS_PATH) return isAnalysisPath(pathname)
  if (to === '/counsel') return isCounselPath(pathname)
  return false
}
