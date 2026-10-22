import { cn } from '@/lib/cn'
import { recordsTabs, getRecordsTabPath, type RecordsTab } from '@/lib/tabMenu'
import { Link } from 'react-router-dom'

interface AnalysisSubNavProps {
  /** 지금 보고 있는 하위 탭 */
  current: RecordsTab
}

/**
 * 기록 탭 안에서 [기록 | 리포트] 를 오가는 하위 탭 막대입니다. (#101, #386)
 * 하위 탭은 주소의 ?tab= 에 담깁니다. 그래서 NavLink 의 자동 선택(주소 경로만 비교) 대신 current 로 표시합니다.
 * 링크는 ?tab= 만 남긴 새 주소로 가서, 다른 하위 탭의 ?view= · ?date= 같은 값은 따라오지 않습니다.
 */
export function RecordsSubNav({ current }: AnalysisSubNavProps) {
  return (
    // overflow-x-auto: 화면이 좁아 탭이 넘치면 이 막대만 옆으로 밀립니다. (페이지 전체 가로 스크롤은 안 생깁니다)
    // sticky top-14: 아래로 내려도 헤더(h-14 = 56px) 바로 아래에 붙어 있습니다. 바탕을 칠해 뒤 내용이 비치지 않게 합니다.
    // -mx-4 px-4: Layout 의 좌우 여백까지 바탕을 넓혀, 막대가 화면 폭 전체로 이어져 보이게 합니다. -mt-3: 모바일에서 헤더 바로 아래에 붙입니다.
    <nav
      aria-label="기록 하위 메뉴"
      className="sticky top-14 z-10 -mx-4 -mt-3 mb-4 overflow-x-auto border-b border-slate-200 bg-slate-100 px-4 sm:-mx-6 sm:mt-0 sm:mb-6 sm:px-6"
    >
      {/* min-w-max: 탭이 줄바꿈되지 않고 한 줄로 늘어서게 합니다. */}
      <ul className="flex min-w-max gap-1">
        {recordsTabs.map((item) => (
          <li key={item.tab}>
            <Link
              to={getRecordsTabPath(item.tab)}
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

/*
 * 지금 있는 탭이면 브랜드 색 굵은 글자 + 굵은 밑줄(3px)로 또렷하게 표시합니다. 높이 h-12 = 48px (누르기 쉽게)
 * -mb-px: 밑줄이 막대의 회색 선 위에 겹쳐서, 선택된 탭이 선과 이어져 보이게 합니다.
 */
function tabClass(isActive: boolean) {
  return cn(
    '-mb-px flex h-12 items-center border-b-[3px] px-4 text-[15px] transition-colors',
    isActive
      ? 'border-brand text-brand font-bold'
      : 'border-transparent font-medium text-slate-500 hover:text-slate-900',
  )
}
