import { RECORDS_PATH, COACH_PATH, isRecordsPath, isTodayPath, TODAY_PATH } from '@/lib/tabMenu'

/**
 * 앱의 주요 메뉴 목록입니다. (2026-10-18 "AI 코치 채팅 중심" 으로 4탭)
 * PC 헤더 메뉴와 모바일 하단 탭이 이 목록을 같이 씁니다.
 * 메뉴를 추가·변경하려면 여기 한 곳만 고치면 됩니다.
 * 설정 · 알림 · 통화는 탭에 없고 코치 화면 머리의 아이콘으로 갑니다. (SettingsLink · 알림 종 · [통화])
 * 카드 · 목표 관리는 오늘 탭에서 들어갑니다. 상담(통화)은 코치 화면의 [통화] 버튼으로 갑니다.
 */
export const navItems = [
  { to: COACH_PATH, label: '코치' },
  { to: TODAY_PATH, label: '오늘' },
  { to: '/timer', label: '타이머' },
  { to: RECORDS_PATH, label: '기록' },
]

/**
 * 지금 주소에서 이 메뉴를 "선택된 모양" 으로 보여줄지 알려줍니다.
 * NavLink 는 주소가 똑같을 때만 선택되므로, "오늘" · "기록" 처럼 아래에 다른 화면(카드 · 목표 등)이
 * 묶인 메뉴는 여기서 따로 확인합니다. (NavLink 의 isActive 와 함께 씁니다)
 */
export function isNavItemSelected(to: string, pathname: string): boolean {
  if (to === TODAY_PATH) return isTodayPath(pathname)
  if (to === RECORDS_PATH) return isRecordsPath(pathname)
  return false
}
