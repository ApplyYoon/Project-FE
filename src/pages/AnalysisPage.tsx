import { AnalysisSubNav } from '@/components/layout/AnalysisSubNav'
import { useQueryParam } from '@/hooks/useQueryParam'
import { toAnalysisTab } from '@/lib/tabMenu'
import { ManualPage } from '@/pages/ManualPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { ReportPage } from '@/pages/ReportPage'

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
      {tab === 'records' && <RecordsPage />}
      {tab === 'report' && <ReportPage />}
      {tab === 'manual' && <ManualPage />}
    </>
  )
}
