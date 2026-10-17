/**
 * 인사이트 카드에 누른 반응(#84)을 저장하고 불러옵니다.
 * 반응은 "몰랐는데 맞아" 비율을 재는 데 쓰이고, 나중에 서버로 보냅니다. (지금은 localStorage 에만 저장)
 */
import { loadData, saveData } from '@/lib/storage'
import type { InsightResponse } from '@/types'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-insight-responses' 가 됩니다)
// "모든 기록 지우기" 가 이 키도 지웁니다. 이름을 바꾸면 src/lib/myData.ts 도 같이 바꾸세요.
const STORAGE_KEY = 'insight-responses'

/** 반응 버튼 3개. 순서와 글자는 시안(홈·리포트)과 같습니다. */
export const insightResponseOptions: { value: InsightResponse; label: string }[] = [
  { value: 'surprised', label: '몰랐는데 맞아' },
  { value: 'alreadyKnew', label: '이미 알던 거야' },
  { value: 'wrong', label: '틀렸어' },
]

/** 저장된 값이 반응 종류 중 하나인지 확인합니다. (손으로 고쳤거나 깨진 값을 걸러냅니다) */
function isInsightResponse(value: unknown): value is InsightResponse {
  return insightResponseOptions.some((option) => option.value === value)
}

/** 인사이트 id 마다 누른 반응을 모아 둔 모양을 불러옵니다. 깨진 항목은 버립니다. */
export function getInsightResponses(): Record<string, InsightResponse> {
  const saved = loadData<unknown>(STORAGE_KEY, {})
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {}

  const responses: Record<string, InsightResponse> = {}
  for (const [insightId, response] of Object.entries(saved)) {
    if (isInsightResponse(response)) responses[insightId] = response
  }
  return responses
}

/**
 * 한 인사이트의 반응을 저장합니다. 이미 있으면 새 반응으로 바꿉니다.
 * 저장하는 순간에 저장소의 최신 값을 읽어서 합치기 때문에, 같은 화면의 다른 카드 반응을 덮어쓰지 않습니다.
 */
export function saveInsightResponse(insightId: string, response: InsightResponse): void {
  saveData(STORAGE_KEY, { ...getInsightResponses(), [insightId]: response })
}
