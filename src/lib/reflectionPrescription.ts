import { hasDemoData } from '@/lib/demoData'
import { mockReflectionPrescription } from '@/lib/mock'
import type { ReflectionPrescription, StudySession } from '@/types'

/**
 * 지금 내려진 성찰 일기 처방을 돌려줍니다. 처방이 없으면 null 입니다. (#70)
 *
 * 처방은 AI(서버)가 내 기록을 보고 내리는 것인데, 아직 그 서버가 없습니다.
 * 그래서 진짜 사용자에게는 처방이 없고(null), 개발용 가상 데이터를 넣었을 때만 예시 처방을 보여줍니다.
 * (예전에는 모든 사용자에게 "최근 '하기 싫음'이 3번 나와서…" 라는 예시가 진짜처럼 보였습니다)
 * 인사이트 카드도 같은 규칙입니다. (lib/insights.ts)
 */
export function getReflectionPrescription(sessions: StudySession[]): ReflectionPrescription | null {
  return hasDemoData(sessions) ? mockReflectionPrescription : null
}
