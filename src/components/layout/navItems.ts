import { COACH_PATH, HOME_PATH, isHomePath, isRecordsPath, RECORDS_PATH } from '@/lib/tabMenu'

/**
 * 앱의 주요 메뉴 목록입니다. (2026-10-18 4탭: 홈 · 코치 · 타이머 · 기록. 같은 날 홈을 첫 탭으로 올리고 코치를 두 번째로)
 * PC 헤더 메뉴와 모바일 하단 탭이 이 목록을 같이 씁니다.
 * 메뉴를 추가·변경하려면 여기 한 곳만 고치면 됩니다.
 * 설정 · 알림 · 통화는 탭에 없고 코치 화면 머리의 아이콘으로 갑니다. (SettingsLink · 알림 종 · [통화])
 * 카드 · 목표 관리는 홈 탭에서 들어갑니다. 상담(통화)은 코치 화면의 [통화] 버튼으로 갑니다.
 */
export const navItems = [
  { to: HOME_PATH, label: '홈' },
  { to: COACH_PATH, label: '코치' },
  { to: '/timer', label: '타이머' },
  { to: RECORDS_PATH, label: '기록' },
]

/**
 * 지금 주소에서 이 메뉴를 "선택된 모양" 으로 보여줄지 알려줍니다.
 * NavLink 는 주소가 똑같을 때만 선택되므로, "홈" · "기록" 처럼 아래에 다른 화면(카드 · 목표 등)이
 * 묶인 메뉴는 여기서 따로 확인합니다. (NavLink 의 isActive 와 함께 씁니다)
 */
export function isNavItemSelected(to: string, pathname: string): boolean {
  if (to === HOME_PATH) return isHomePath(pathname)
  if (to === RECORDS_PATH) return isRecordsPath(pathname)
  return false
}
