import { navItems } from '@/components/layout/navItems'
import { cn } from '@/lib/cn'
import { NavLink } from 'react-router-dom'

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <NavLink to="/" className="text-brand text-base font-bold sm:text-lg">
          Project FE
        </NavLink>

        {/* 데스크톱(sm 이상)에서만 보이는 가로 메뉴. 모바일은 하단 탭(BottomTabNav)을 씁니다. */}
        <nav className="hidden gap-1 sm:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

/* NavLink 는 현재 주소와 일치하면 isActive 를 true 로 넘겨줍니다. */
function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-100',
  )
}
