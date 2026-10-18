/**
 * 아래 탭(홈·카드·타이머·상담·분석) 하나에 어떤 주소들이 묶이는지 한 곳에 모아 둔 파일입니다. (#386)
 *
 * 탭에는 화면이 다 들어갈 자리가 없어서, 시험·일기 같은 화면은 가까운 탭 아래에 묶었습니다.
 * 이 주소들에 있을 때는 그 탭이 선택된 모양이어야 하고, 화면 위에 "‹ 분석" 같은 돌아가기 링크가 나옵니다.
 *
 *   분석 탭: /analysis (하위 탭: 기록 · 리포트) + 시험
 *   (사용설명서 · 가설·실험 하위 탭은 시연 범위 밖이라 2026-10-18 에 지웠습니다)
 *   상담 탭: /counsel + 일기
 */

/** 분석 탭의 주소 */
export const ANALYSIS_PATH = '/analysis'

/** 분석 탭 안의 하위 탭 이름. 주소의 ?tab= 값입니다. */
export type AnalysisTab = 'records' | 'report'

/** 분석 탭 위쪽의 하위 탭 막대에 나오는 순서와 글자. 첫 번째(기록)가 기본입니다. */
export const analysisTabs: { tab: AnalysisTab; label: string }[] = [
  { tab: 'records', label: '기록' },
  { tab: 'report', label: '리포트' },
]

/**
 * 주소에서 받은 ?tab= 값을 하위 탭 이름으로 바꿉니다. 모르는 값이면 기본(기록)으로 봅니다.
 * (주소는 누구나 손으로 고칠 수 있어서, 받은 값을 그대로 믿지 않습니다)
 *
 *   toAnalysisTab('report')  -> 'report'
 *   toAnalysisTab('hello')   -> 'records'
 */
export function toAnalysisTab(value: string): AnalysisTab {
  const found = analysisTabs.find((item) => item.tab === value)
  return found ? found.tab : 'records'
}

/**
 * 하위 탭으로 가는 주소. 기본 탭(기록)은 ?tab= 을 적지 않습니다. (useQueryParam 이 기본값을 주소에 안 적는 것과 같게)
 *
 *   getAnalysisTabPath('records')  -> '/analysis'
 *   getAnalysisTabPath('report')   -> '/analysis?tab=report'
 */
export function getAnalysisTabPath(tab: AnalysisTab): string {
  return tab === 'records' ? ANALYSIS_PATH : `${ANALYSIS_PATH}?tab=${tab}`
}

/** 분석 탭 아래에 묶인 화면. 위에 "‹ 분석" 돌아가기 링크가 나옵니다. */
const analysisCardPaths = ['/exams']

/** 상담 탭 아래에 묶인 화면. 위에 "‹ 상담" 돌아가기 링크가 나옵니다. (일기 · 성찰일기는 #417 에서 지워서 지금은 없습니다) */
const counselCardPaths: string[] = []

/**
 * pathname 이 base 이거나 그 아래 주소인지 봅니다.
 * 앞부분만 같은 다른 주소(/exams-old)는 아닙니다. (그래서 '/' 를 붙여서 비교합니다)
 *
 *   isUnder('/exams', '/exams')             -> true
 *   isUnder('/exams/3/result', '/exams')    -> true
 *   isUnder('/exams-old', '/exams')         -> false
 */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** 지금 주소가 시험 결과 입력 화면(/exams/<시험 id>/result)인지 */
export function isExamResultPath(pathname: string): boolean {
  return /^\/exams\/[^/]+\/result\/?$/.test(pathname)
}

/**
 * 지금 주소가 "분석" 탭에 속하는지. 하단 탭·헤더에서 "분석" 을 선택된 모양으로 만들 때 씁니다.
 *
 *   isAnalysisPath('/analysis')        -> true
 *   isAnalysisPath('/exams/3/result')  -> true
 *   isAnalysisPath('/counsel')         -> false
 */
export function isAnalysisPath(pathname: string): boolean {
  return (
    isUnder(pathname, ANALYSIS_PATH) || analysisCardPaths.some((path) => isUnder(pathname, path))
  )
}

/**
 * 지금 주소가 "상담" 탭에 속하는지.
 *
 *   isCounselPath('/counsel')            -> true
 *   isCounselPath('/counsel/chat')       -> true
 */
export function isCounselPath(pathname: string): boolean {
  return isUnder(pathname, '/counsel') || counselCardPaths.some((path) => isUnder(pathname, path))
}

/**
 * 화면 위에 보여 줄 돌아가기 링크. 탭 아래에 묶인 화면(시험)에서만 있고, 나머지는 null 입니다.
 * 시험 결과 화면은 "‹ 시험" 으로 돌아가는 링크를 화면 안에 따로 두어서 뺍니다.
 *
 *   getBackToTabLink('/exams')   -> { to: '/analysis', label: '분석' }
 *   getBackToTabLink('/timer')   -> null
 */
export function getBackToTabLink(pathname: string): { to: string; label: string } | null {
  if (isExamResultPath(pathname)) return null
  if (analysisCardPaths.some((path) => isUnder(pathname, path))) {
    return { to: ANALYSIS_PATH, label: '분석' }
  }
  if (counselCardPaths.some((path) => isUnder(pathname, path))) {
    return { to: '/counsel', label: '상담' }
  }
  return null
}
