import { navItems } from '@/components/layout/navItems'
import { countUnreadAiMessages, loadAiMessages } from '@/lib/aiMessages'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface HeaderProps {
  /** true 면 메뉴를 숨깁니다. (온보딩처럼 탭 없이 뜨는 화면에서 씁니다) */
  hideNav?: boolean
  /** 메뉴를 숨겼을 때 오른쪽에 대신 보여줄 것. 예) "나중에 하기" 링크 */
  action?: ReactNode
}

export function Header({ hideNav = false, action }: HeaderProps) {
  // 주소가 바뀔 때마다 헤더가 다시 그려지면서 안 읽은 메시지 수를 새로 셉니다.
  const { pathname } = useLocation()
  // 메시지함을 보고 있는 동안은 다 읽은 것이므로 빨간 점을 숨깁니다.
  const hasUnread = pathname !== '/messages' && countUnreadAiMessages(loadAiMessages()) > 0

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <NavLink to="/" className="text-brand text-base font-bold sm:text-lg">
          Project FE
        </NavLink>

        {/* 메뉴를 숨기는 화면(온보딩 등)에서는 종 아이콘도 숨기고 action 만 보여줍니다. */}
        {hideNav ? (
          action
        ) : (
          <div className="flex items-center gap-2">
            {/* 데스크톱(sm 이상)에서만 보이는 가로 메뉴. 모바일은 하단 탭(BottomTabNav)을 씁니다. */}
            <nav className="hidden gap-1 sm:flex">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* 메시지함 종 아이콘. 모바일·PC 모두 보입니다. (크기·선택 모양 다듬기는 #102) */}
            <NavLink
              to="/messages"
              aria-label={hasUnread ? '메시지함, 안 읽은 메시지 있음' : '메시지함'}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <BellIcon />
              {hasUnread && (
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
