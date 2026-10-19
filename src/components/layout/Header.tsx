import { isNavItemSelected, navItems } from '@/components/layout/navItems'
import { SettingsLink } from '@/components/ui/SettingsLink'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { scrollToTop } from '@/lib/scroll'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface HeaderProps {
  /** true 면 메뉴를 숨깁니다. (로그인·가입·온보딩처럼 탭 없이 뜨는 화면에서 씁니다) */
  hideNav?: boolean
  /** 메뉴를 숨겼을 때 오른쪽에 대신 보여줄 것. 예) "나중에 하기" 링크 */
  action?: ReactNode
}

/*
 * 헤더 오른쪽에는 셋 중 하나가 보입니다.
 *   hideNav           -> action 만 (온보딩의 "나중에 하기" 등). 없으면 앱 이름만 보입니다.
 *                         로그인·가입·온보딩처럼 탭 없이 뜨는 화면(PlainLayout)이라, 로그인 전이어도 "로그인" 을 띄우지 않습니다.
 *   로그인 전          -> "로그인" 하나만 (처음 온 사람도 로그인 화면에서 시작하면 가입으로 이어지기 때문입니다, #319)
 *   로그인             -> PC 는 탭 4개(홈 · 채팅 · 타이머 · 기록) 메뉴 + 맨 오른쪽 "설정", 모바일은 오른쪽 위 ⚙️ 톱니(하단 탭은 4개 그대로)
 * 설정은 아래 탭에 넣지 않고 헤더에 따로 둡니다. 로그아웃 · 탈퇴가 설정에 있어서 어느 화면에서든 찾을 수 있게. (2026-10-19)
 * 알림 종 · 통화는 채팅 목록 · 대화방 머리에 둡니다. (2026-10-18 "탭을 명확히")
 */

export function Header({ hideNav = false, action }: HeaderProps) {
  const { isLoggedIn } = useAuth()
  const { pathname } = useLocation()

  return (
    // 바탕과 같은 연회색에 살짝 비치게(backdrop-blur). 모바일은 선 없이, PC 는 아래 선으로 구분합니다.
    <header className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur sm:border-b sm:border-slate-200 sm:bg-white/90">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* whitespace-nowrap: 좁은 화면에서도 앱 이름이 두 줄로 꺾이지 않게 합니다. */}
        <NavLink to="/" className="text-brand text-base font-bold whitespace-nowrap sm:text-lg">
          STARFLOW
        </NavLink>

        {hideNav ? (
          // 메뉴를 숨기는 화면(로그인·가입·온보딩 등)에서는 종 아이콘도 숨기고 action 만 보여줍니다.
          action
        ) : !isLoggedIn ? (
          // 로그인 전에는 로그인만 보여줍니다. 모바일에서도 그대로 보입니다. (하단 탭이 없어서)
          // 회원가입은 따로 두지 않습니다. 로그인 화면에서 시작하면 처음인 사람은 가입으로 이어집니다. (#319)
          <nav aria-label="로그인 메뉴" className="flex items-center gap-1">
            <NavLink to="/login" className={guestLinkClass}>
              로그인
            </NavLink>
          </nav>
        ) : (
          <div className="flex items-center gap-2">
            {/* 데스크톱(sm 이상)에서만 보이는 가로 메뉴. 모바일은 하단 탭(BottomTabNav)을 씁니다. (같은 4개) */}
            <nav className="hidden gap-1 sm:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  // 메뉴를 누르면 맨 위로 올립니다. 지금 보고 있는 메뉴를 다시 눌러도 올라갑니다. (하단 탭과 같은 규칙)
                  onClick={scrollToTop}
                  className={({ isActive }) =>
                    // 홈 · 기록 아래 화면(카드 · 목표 등)에서도 그 탭이 선택된 모양이 되게 합니다.
                    navLinkClass({ isActive: isActive || isNavItemSelected(item.to, pathname) })
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {/* 설정은 탭 4개 뒤 맨 오른쪽에 따로 둡니다. /settings/account(내 계정)에서도 선택된 모양입니다. */}
              <NavLink to="/settings" onClick={scrollToTop} className={navLinkClass}>
                설정
              </NavLink>
            </nav>
            {/* 모바일은 오른쪽 위 톱니로 설정에 갑니다. (PC 는 위 메뉴의 "설정") */}
            <SettingsLink className="-mr-2 sm:hidden" />
          </div>
        )}
      </div>
    </header>
  )
}

/* NavLink 는 현재 주소와 일치하면 isActive 를 true 로 넘겨줍니다. */
function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex h-10 items-center rounded-full px-4 text-[15px] font-semibold transition-colors',
    isActive ? 'bg-brand-light text-brand' : 'text-slate-500 hover:bg-slate-100',
  )
}

/* 로그인 전에 보이는 "로그인" 링크. 손가락으로 누르기 쉽게 높이 40px(h-10) 입니다. */
function guestLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
    isActive ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-100',
  )
}
