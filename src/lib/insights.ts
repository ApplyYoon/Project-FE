import { hasDemoData } from '@/lib/demoData'
import { mockInsights } from '@/lib/mock'
import type { Insight, StudySession } from '@/types'

/** 화면에 보여줄 인사이트 목록과, 그것이 예시인지 여부 */
export interface InsightsToShow {
  insights: Insight[]
  /** true 면 진짜 발견이 아니라 화면을 미리 보기 위한 예시입니다. 카드에 "예시" 표시를 붙입니다. */
  isExample: boolean
}

/**
 * 화면(홈·리포트)에 보여줄 인사이트를 고릅니다.
 *
 * 진짜 인사이트는 서버가 내 기록을 분석해서 만들어 줍니다. 서버 연결 전에는 보여줄 진짜 인사이트가 없습니다.
 * 내 기록과 상관없는 예시 문장을 진짜처럼 보여주면 분석 전체를 믿을 수 없게 되므로, 이렇게 정했습니다.
 *
 *  - 가상 데이터(리포트 화면의 "개발용: 가상 데이터")를 넣었을 때만 예시 인사이트를 "예시" 표시와 함께 보여줍니다.
 *  - 그 밖에는 빈 목록입니다. 화면은 "기록이 쌓이면 발견이 생겨요" 를 보여줍니다.
 *
 *   const { insights, isExample } = getInsightsToShow(sessions)
 */
export function getInsightsToShow(sessions: StudySession[]): InsightsToShow {
  if (hasDemoData(sessions)) {
    return { insights: mockInsights.slice(0, 2), isExample: true }
  }
  return { insights: [], isExample: false }
}
