import { StatsPage } from '@/pages/StatsPage'

/**
 * 기록 탭 화면(/records)입니다. (#386 → 2026-10-18 이름 바꿈)
 * 옛 주소 /report · /manual 은 여기로 옵니다. (/analysis 는 통계 탭으로, router.tsx)
 *
 * 2026-10-24 시안대로 기록 탭은 일간 · 주간 리포트(History) 화면이 되고,
 * 지금까지 여기 있던 그래프 · 숲 · AI 분석은 통계 탭(pages/StatsPage.tsx)으로 옮겼습니다.
 * 리포트 화면이 들어오기 전까지는 통계 화면을 그대로 보여 줍니다.
 */
export function RecordsPage() {
  return <StatsPage />
}
