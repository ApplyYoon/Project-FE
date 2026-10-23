import { RecordListPage } from '@/pages/RecordListPage'

/**
 * 기록 탭 화면(/records)입니다. (#386 → 2026-10-18 이름 바꿈)
 * 탭 이름이 '분석' 에서 '기록' 으로 바뀌어서 주소 · 파일 이름도 맞췄습니다. 옛 주소 /analysis · /report · /manual 은 여기로 옵니다. (router.tsx)
 *
 * 예전에는 위의 하위 탭 막대로 [기록 | 리포트] 를 오갔습니다.
 * 사용설명서 · 가설·실험 하위 탭은 2026-10-18 에, 리포트는 2026-10-23 에 빼서 [기록] 하나만 남았습니다.
 * 그래서 막대 없이 기록 화면을 바로 보여 줍니다. 옛 ?tab=report 같은 주소로 와도 기록이 보입니다.
 * (리포트의 '이번 발견' 카드는 기록 화면 아래로 옮겼습니다)
 */
export function RecordsPage() {
  return <RecordListPage />
}
