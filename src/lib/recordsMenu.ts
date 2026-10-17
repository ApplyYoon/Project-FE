/**
 * "기록" 메뉴 아래에 묶인 주소들을 한 곳에 모아 둔 파일입니다. (하위 탭, #101)
 *
 * 하단 탭·헤더에는 기록·리포트·사용설명서·시험·일기가 다 들어갈 자리가 없어서
 * 전부 "기록" 탭 아래로 묶었습니다. 이 주소들에 있을 때는 "기록" 이 선택된 모양이어야 합니다.
 */

/** 기록 화면 위쪽의 하위 탭 막대에 나오는 화면 */
export const recordsTabs = [
  { to: '/records', label: '기록' },
  { to: '/report', label: '리포트' },
  { to: '/manual', label: '사용설명서' },
]

/** 기록 화면의 카드로 들어가는 화면. 하위 탭에는 없고, 위에 "‹ 기록" 돌아가기 링크가 나옵니다. */
const recordsCardPaths = ['/exams', '/diary', '/suggestions']

/**
 * pathname 이 base 이거나 그 아래 주소인지 봅니다.
 * 앞부분만 같은 다른 주소(/reports)는 아닙니다. (그래서 '/' 를 붙여서 비교합니다)
 *
 *   isUnder('/report', '/report')          -> true
 *   isUnder('/report/monthly', '/report')  -> true
 *   isUnder('/reports', '/report')         -> false
 */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** 지금 주소가 하위 탭 막대를 보여줘야 하는 화면(기록·리포트·사용설명서)인지 */
export function isRecordsTabPath(pathname: string): boolean {
  return recordsTabs.some((tab) => isUnder(pathname, tab.to))
}

/** 지금 주소가 시험 결과 입력 화면(/exams/<시험 id>/result)인지 */
export function isExamResultPath(pathname: string): boolean {
  return /^\/exams\/[^/]+\/result\/?$/.test(pathname)
}

/**
 * 지금 주소가 "‹ 기록" 돌아가기 링크를 보여줘야 하는 화면(시험·일기·개선안 고르기)인지
 * 시험 결과 화면은 "‹ 시험" 으로 돌아가는 링크를 화면 안에 따로 두어서, 여기서는 뺍니다.
 */
export function isRecordsCardPath(pathname: string): boolean {
  if (isExamResultPath(pathname)) return false
  return recordsCardPaths.some((path) => isUnder(pathname, path))
}

/**
 * 지금 주소가 "기록" 메뉴에 속하는지. 하단 탭·헤더에서 "기록" 을 선택된 모양으로 만들 때 씁니다.
 *
 *   isRecordsPath('/records')       -> true
 *   isRecordsPath('/report')        -> true
 *   isRecordsPath('/diary/write')   -> true
 *   isRecordsPath('/planner')       -> false
 */
export function isRecordsPath(pathname: string): boolean {
  return isRecordsTabPath(pathname) || isRecordsCardPath(pathname) || isExamResultPath(pathname)
}
