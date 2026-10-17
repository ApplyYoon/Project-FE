import { isNavItemSelected, navItems } from '@/components/layout/navItems'
import { cn } from '@/lib/cn'
import { scrollToTop } from '@/lib/scroll'
import { NavLink, useLocation } from 'react-router-dom'

/**
 * 모바일 화면 아래에 고정되는 탭 메뉴입니다.
 * PC(sm 이상)에서는 숨기고, 대신 헤더 메뉴를 보여줍니다.
 */
export function BottomTabNav() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white sm:hidden"
    >
      {/* 탭 5개를 같은 너비로 나눕니다. */}
      <ul className="grid grid-cols-5">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              // 탭을 누르면 맨 위로 올립니다. 지금 보고 있는 탭을 다시 눌러도 올라갑니다.
              onClick={scrollToTop}
              className={({ isActive }) =>
                // 분석·상담 아래 화면(시험·일기 등)에서도 그 탭이 선택된 모양이 되게 합니다.
                tabLinkClass({ isActive: isActive || isNavItemSelected(item.to, pathname) })
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/* 지금 있는 탭이면 브랜드 색으로 표시합니다. */
function tabLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex h-14 items-center justify-center text-sm font-medium transition-colors',
    isActive ? 'text-brand bg-brand-light' : 'text-slate-500 hover:bg-slate-100',
  )
}
