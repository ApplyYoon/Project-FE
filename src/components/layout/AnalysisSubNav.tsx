import { cn } from '@/lib/cn'
import { analysisTabs, getAnalysisTabPath, type AnalysisTab } from '@/lib/tabMenu'
import { Link } from 'react-router-dom'

interface AnalysisSubNavProps {
  /** 지금 보고 있는 하위 탭 */
  current: AnalysisTab
}

/**
 * 분석 탭 안에서 [기록 | 리포트 | 사용설명서] 를 오가는 하위 탭 막대입니다. (#101, #386)
 * 하위 탭은 주소의 ?tab= 에 담깁니다. 그래서 NavLink 의 자동 선택(주소 경로만 비교) 대신 current 로 표시합니다.
 * 링크는 ?tab= 만 남긴 새 주소로 가서, 다른 하위 탭의 ?view= · ?date= 같은 값은 따라오지 않습니다.
 */
export function AnalysisSubNav({ current }: AnalysisSubNavProps) {
  return (
    // overflow-x-auto: 화면이 좁아 탭이 넘치면 이 막대만 옆으로 밀립니다. (페이지 전체 가로 스크롤은 안 생깁니다)
    <nav aria-label="분석 하위 메뉴" className="mb-6 overflow-x-auto border-b border-slate-200">
      {/* min-w-max: 탭이 줄바꿈되지 않고 한 줄로 늘어서게 합니다. */}
      <ul className="flex min-w-max gap-2">
        {analysisTabs.map((item) => (
          <li key={item.tab}>
            <Link
              to={getAnalysisTabPath(item.tab)}
              aria-current={item.tab === current ? 'page' : undefined}
              className={tabClass(item.tab === current)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/* 지금 있는 탭이면 브랜드 색 글자와 밑줄로 표시합니다. 높이 h-11 = 44px (누르기 쉽게) */
function tabClass(isActive: boolean) {
  return cn(
    'flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors sm:px-4',
    isActive ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-900',
  )
}
