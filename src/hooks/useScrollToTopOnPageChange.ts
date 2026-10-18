import { scrollToTop } from '@/lib/scroll'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * 다른 화면으로 옮기면 스크롤을 맨 위로 올립니다. 공통 틀(Layout · PlainLayout)에서 한 번씩 부릅니다.
 *
 * 이 앱은 화면을 옮겨도 브라우저가 새 문서를 여는 게 아니라 내용만 바꿔 끼웁니다.
 * 그래서 가만히 두면 스크롤 위치가 그대로 남아, 아래로 내린 채 다른 탭을 누르면 새 화면도 중간부터 보입니다.
 *
 * ■ 규칙
 *  1. 주소의 경로(/records 같은 부분)가 바뀔 때만 올립니다.
 *     ?view=monthly 처럼 물음표 뒤만 바뀌는 것(같은 화면 안의 탭 · 날짜)은 보던 자리를 그대로 둡니다.
 *  2. 뒤로 가기 · 앞으로 가기로 왔으면 올리지 않습니다. 보던 자리로 돌아가는 게 자연스럽기 때문입니다.
 *
 * ■ 예시
 *   홈에서 아래로 내린 뒤 "기록" 탭을 누름       -> 기록 화면이 맨 위부터 보임
 *   리포트에서 주간 → 월간 (?view=monthly)        -> 그대로 (경로는 /records 그대로)
 *   분석 안에서 기록 → 리포트 (?tab=report)       -> 그대로 (하위 탭 막대가 맨 위에 있어서 이미 위쪽입니다)
 *   카드 → 분석 → 뒤로 가기                       -> 올리지 않음
 */
export function useScrollToTopOnPageChange() {
  const { pathname } = useLocation()
  // 이 화면에 어떻게 왔는지 알려줍니다. 'PUSH'(링크를 누름) · 'REPLACE'(주소 바꿔치기) · 'POP'(뒤로 · 앞으로 가기, 새로고침)
  const navigationType = useNavigationType()
  // 바로 전에 보던 경로를 기억해 둡니다. (useRef: 값이 바뀌어도 화면을 다시 그리지 않는 기억 칸)
  // 처음에는 null 이라서, 이 틀이 처음 나타날 때도 "경로가 바뀐 것" 으로 봅니다.
  const previousPathname = useRef<string | null>(null)

  useEffect(() => {
    const isSamePage = previousPathname.current === pathname
    previousPathname.current = pathname

    // 규칙 1. 경로가 그대로면 아무것도 하지 않습니다.
    if (isSamePage) return
    // 규칙 2. 뒤로 · 앞으로 가기와 새로고침은 브라우저가 보던 자리를 찾아 주게 둡니다.
    if (navigationType === 'POP') return

    scrollToTop()
  }, [pathname, navigationType])
}
