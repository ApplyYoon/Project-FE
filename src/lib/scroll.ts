/**
 * 화면을 맨 위로 올립니다. 부드럽게 움직이지 않고 바로 올라갑니다.
 *
 * 화면을 옮겼을 때(hooks/useScrollToTopOnPageChange.ts)와, 메뉴 탭을 눌렀을 때(하단 탭 · 헤더 메뉴) 씁니다.
 *
 *   <NavLink to="/records" onClick={scrollToTop}>기록</NavLink>
 */
export function scrollToTop() {
  window.scrollTo(0, 0)
}
