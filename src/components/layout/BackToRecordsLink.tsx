import { Link } from 'react-router-dom'

/**
 * 시험·일기·개선안 고르기 화면 위에 나오는 "‹ 기록" 돌아가기 링크입니다. (#101)
 * Layout 이 /exams, /diary, /suggestions 에서만 이 링크를 보여줍니다.
 */
export function BackToRecordsLink() {
  return (
    // h-11 = 44px: 손가락으로 누르기 쉬운 높이
    <Link
      to="/records"
      className="text-brand mb-2 inline-flex h-11 items-center gap-1 text-sm font-medium hover:underline"
    >
      <span aria-hidden>‹</span> 기록
    </Link>
  )
}
