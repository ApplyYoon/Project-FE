import { isNavItemSelected, navItems } from '@/components/layout/navItems'
import { useAiMessages } from '@/hooks/useAiMessages'
import { useAuth } from '@/hooks/useAuth'
import { countUnreadAiMessages } from '@/lib/aiMessages'
import { cn } from '@/lib/cn'
import { scrollToTop } from '@/lib/scroll'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface HeaderProps {
  /** true 면 메뉴를 숨깁니다. (온보딩처럼 탭 없이 뜨는 화면에서 씁니다) */
  hideNav?: boolean
  /** 메뉴를 숨겼을 때 오른쪽에 대신 보여줄 것. 예) "나중에 하기" 링크 */
  action?: ReactNode
}

/*
 * 헤더 오른쪽에는 셋 중 하나가 보입니다.
 *   로그인 전          -> "로그인" 하나만 (처음 온 사람도 로그인 화면에서 시작하면 가입으로 이어지기 때문입니다, #319)
 *                         로그인 화면에서는 이미 그 화면이라 아무것도 안 보여줍니다.
 *   로그인 + hideNav   -> action (온보딩의 "나중에 하기" 등)
 *   로그인             -> 메뉴와 알림 종
 */

export function Header({ hideNav = false, action }: HeaderProps) {
  const { isLoggedIn } = useAuth()
  const { pathname } = useLocation()
  // 새 알림이 쌓이면 화면을 옮기지 않아도 바로 다시 그려져서 빨간 점이 뜹니다. (hooks/useAiMessages.ts)
  const messages = useAiMessages()
  // 알림 화면을 보고 있는 동안은 다 읽은 것이므로 0개로 봅니다. (빨간 점이 사라집니다)
  const unreadCount = pathname === '/notifications' ? 0 : countUnreadAiMessages(messages)
  // 화면을 읽어 주는 프로그램이 "알림, 안 읽은 알림 3개" 처럼 개수까지 읽어 줍니다.
  const bellLabel = unreadCount > 0 ? `알림, 안 읽은 알림 ${unreadCount}개` : '알림'

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* whitespace-nowrap: 좁은 화면에서도 앱 이름이 두 줄로 꺾이지 않게 합니다. */}
        <NavLink to="/" className="text-brand text-base font-bold whitespace-nowrap sm:text-lg">
          STARFLOW
        </NavLink>

        {!isLoggedIn ? (
          // 로그인 전에는 로그인만 보여줍니다. 모바일에서도 그대로 보입니다. (하단 탭이 없어서)
          // 회원가입은 따로 두지 않습니다. 로그인 화면에서 시작하면 처음인 사람은 가입으로 이어집니다. (#319)
          // 로그인 화면에서는 같은 화면으로 가는 버튼이라 숨깁니다.
          pathname !== '/login' && (
            <nav aria-label="로그인 메뉴" className="flex items-center gap-1">
              <NavLink to="/login" className={guestLinkClass}>
                로그인
              </NavLink>
            </nav>
          )
        ) : hideNav ? (
          // 메뉴를 숨기는 화면(온보딩 등)에서는 종 아이콘도 숨기고 action 만 보여줍니다.
          action
        ) : (
          <div className="flex items-center gap-2">
            {/* 데스크톱(sm 이상)에서만 보이는 가로 메뉴. 모바일은 하단 탭(BottomTabNav)을 씁니다. */}
            <nav className="hidden gap-1 sm:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  // 메뉴를 누르면 맨 위로 올립니다. 지금 보고 있는 메뉴를 다시 눌러도 올라갑니다. (하단 탭과 같은 규칙)
                  onClick={scrollToTop}
                  className={({ isActive }) =>
                    // 기록 아래 화면(리포트·사용설명서 등)에서도 "기록" 이 선택된 모양이 되게 합니다.
                    navLinkClass({ isActive: isActive || isNavItemSelected(item.to, pathname) })
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* 알림 종 아이콘. 모바일·PC 모두 보입니다. 누르기 쉽게 44×44px(h-11 w-11) 입니다. */}
            <NavLink to="/notifications" aria-label={bellLabel} className={bellLinkClass}>
              <BellIcon />
              {unreadCount > 0 && (
                <span
                  aria-hidden
                  className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
                />
              )}
            </NavLink>
          </div>
        )}
      </div>
    </header>
  )
}

/* 종 모양 아이콘 (라이브러리 없이 SVG 를 직접 그립니다) */
function BellIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

/* NavLink 는 현재 주소와 일치하면 isActive 를 true 로 넘겨줍니다. */
function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-100',
  )
}

/* 로그인 전에 보이는 "로그인" 링크. 손가락으로 누르기 쉽게 높이 40px(h-10) 입니다. */
function guestLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
    isActive ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-100',
  )
}

/* 종 버튼도 메뉴와 같은 방법으로, /notifications 에 있으면 선택된 모양(연보라 배경)이 됩니다. */
function bellLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
    isActive ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-100',
  )
}
