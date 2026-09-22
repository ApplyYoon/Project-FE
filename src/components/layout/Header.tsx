import { cn } from '@/lib/cn'
import { useToggle } from '@/hooks/useToggle'
import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', label: '홈' },
  { to: '/about', label: '소개' },
]

export function Header() {
  const [isMenuOpen, toggleMenu, setIsMenuOpen] = useToggle()
  const location = useLocation()

  // 페이지를 이동하면 열려 있던 모바일 메뉴를 닫습니다.
  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.pathname, setIsMenuOpen])

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <NavLink to="/" className="text-brand text-base font-bold sm:text-lg">
          Project FE
        </NavLink>

        {/* 데스크톱(sm 이상)에서만 보이는 가로 메뉴 */}
        <nav className="hidden gap-1 sm:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 모바일(sm 미만)에서만 보이는 햄버거 버튼 */}
        <button
          type="button"
          onClick={toggleMenu}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          aria-label="메뉴 열기"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 sm:hidden"
        >
          <span aria-hidden className="block text-lg leading-none">
            {isMenuOpen ? '✕' : '☰'}
          </span>
        </button>
      </div>

      {/* 모바일 메뉴 (세로로 펼쳐짐) */}
      {isMenuOpen && (
        <nav
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-slate-200 p-3 sm:hidden"
        >
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

/* NavLink 는 현재 주소와 일치하면 isActive 를 true 로 넘겨줍니다. */
function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-md px-3 py-2 text-sm font-medium transition-colors sm:py-1.5',
    isActive ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-100',
  )
}
