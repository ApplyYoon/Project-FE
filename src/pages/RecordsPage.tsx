import { RecordsSubNav } from '@/components/layout/RecordsSubNav'
import { PageBoundary } from '@/components/layout/PageBoundary'
import { useQueryParam } from '@/hooks/useQueryParam'
import { toRecordsTab } from '@/lib/tabMenu'
import { lazy } from 'react'

/*
 * 하위 탭 화면도 router.tsx 처럼 그 탭을 처음 열 때 받아옵니다. (Lazy Load)
 * 기록 탭을 열 때 [기록] 화면만 받고, 리포트는 그 탭을 누를 때 받습니다.
 */
const RecordListPage = lazy(() =>
  import('@/pages/RecordListPage').then((m) => ({ default: m.RecordListPage })),
)
const ReportPage = lazy(() => import('@/pages/ReportPage').then((m) => ({ default: m.ReportPage })))

/**
 * 기록 탭 화면(/records)입니다. 위의 하위 탭 막대로 [기록 | 리포트] 를 오갑니다. (#386 → 2026-10-18 이름 바꿈)
 * 보고 있는 하위 탭은 주소에 둡니다. (/records = 기록, /records?tab=report = 리포트)
 * 탭 이름이 '분석' 에서 '기록' 으로 바뀌어서 주소 · 파일 이름도 맞췄습니다. 옛 주소 /analysis · /report · /manual 은 여기로 옵니다. (router.tsx)
 * 사용설명서 · 가설·실험 하위 탭은 2026-10-18 에 지웠습니다. 옛 ?tab=manual · ?tab=experiment 는 [기록] 으로 보입니다.
 */
export function RecordsPage() {
  const [tabParam] = useQueryParam('tab', 'records')
  // 주소의 값은 누구나 고칠 수 있어서, 모르는 값이면 기록 탭으로 봅니다.
  const tab = toRecordsTab(tabParam)

  return (
    <>
      <RecordsSubNav current={tab} />
      {/* 하위 탭 화면을 받는 동안에는 막대 아래에만 스켈레톤을 보여줍니다. */}
      {/* key={tab}: 탭을 바꾸면 새로 그려서, 한 탭에서 난 에러 안내가 다른 탭에 남지 않게 합니다. */}
      <PageBoundary key={tab}>
        {tab === 'records' && <RecordListPage />}
        {tab === 'report' && <ReportPage />}
      </PageBoundary>
    </>
  )
}
