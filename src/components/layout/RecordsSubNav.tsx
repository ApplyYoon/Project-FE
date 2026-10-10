import { cn } from '@/lib/cn'
import { recordsTabs } from '@/lib/recordsMenu'
import { NavLink } from 'react-router-dom'

/**
 * 기록 탭 안에서 [기록 | 리포트 | 사용설명서] 를 오가는 하위 탭 막대입니다. (#101)
 * Layout 이 /records, /report, /manual 에서만 이 막대를 보여줍니다.
 */
export function RecordsSubNav() {
  return (
    // overflow-x-auto: 화면이 좁아 탭이 넘치면 이 막대만 옆으로 밀립니다. (페이지 전체 가로 스크롤은 안 생깁니다)
    <nav aria-label="기록 하위 메뉴" className="mb-6 overflow-x-auto border-b border-slate-200">
      {/* min-w-max: 탭이 줄바꿈되지 않고 한 줄로 늘어서게 합니다. */}
      <ul className="flex min-w-max gap-2">
        {recordsTabs.map((tab) => (
          <li key={tab.to}>
            <NavLink to={tab.to} className={tabClass}>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/* 지금 있는 탭이면 브랜드 색 글자와 밑줄로 표시합니다. 높이 h-11 = 44px (누르기 쉽게) */
function tabClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors sm:px-4',
    isActive ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-900',
  )
}
