import { AnalysisSubNav } from '@/components/layout/AnalysisSubNav'
import { PageBoundary } from '@/components/layout/PageBoundary'
import { useQueryParam } from '@/hooks/useQueryParam'
import { toAnalysisTab } from '@/lib/tabMenu'
import { lazy } from 'react'

/*
 * 하위 탭 화면도 router.tsx 처럼 그 탭을 처음 열 때 받아옵니다. (Lazy Load)
 * 분석 탭을 열 때 기록 화면만 받고, 리포트 · 사용설명서는 그 탭을 누를 때 받습니다.
 */
const ManualPage = lazy(() => import('@/pages/ManualPage').then((m) => ({ default: m.ManualPage })))
const RecordsPage = lazy(() =>
  import('@/pages/RecordsPage').then((m) => ({ default: m.RecordsPage })),
)
const ReportPage = lazy(() => import('@/pages/ReportPage').then((m) => ({ default: m.ReportPage })))

/**
 * 분석 탭 화면(/analysis)입니다. 위의 하위 탭 막대로 [기록 | 리포트 | 사용설명서] 를 오갑니다. (#386)
 * 보고 있는 하위 탭은 주소에 둡니다. (/analysis = 기록, /analysis?tab=report = 리포트, ?tab=manual = 사용설명서)
 * 옛 주소 /records · /report · /manual 로 들어와도 여기로 옵니다. (router.tsx)
 */
export function AnalysisPage() {
  const [tabParam] = useQueryParam('tab', 'records')
  // 주소의 값은 누구나 고칠 수 있어서, 모르는 값이면 기록 탭으로 봅니다.
  const tab = toAnalysisTab(tabParam)

  return (
    <>
      <AnalysisSubNav current={tab} />
      {/* 하위 탭 화면을 받는 동안에는 막대 아래에만 스켈레톤을 보여줍니다. */}
      {/* key={tab}: 탭을 바꾸면 새로 그려서, 한 탭에서 난 에러 안내가 다른 탭에 남지 않게 합니다. */}
      <PageBoundary key={tab}>
        {tab === 'records' && <RecordsPage />}
        {tab === 'report' && <ReportPage />}
        {tab === 'manual' && <ManualPage />}
      </PageBoundary>
    </>
  )
}
