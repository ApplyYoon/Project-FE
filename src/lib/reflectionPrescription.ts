/**
 * 지금 내려진 성찰 일기 처방을 서버에서 받아옵니다. (#70, BE 이슈 #61)
 * 일기 화면의 처방 카드와 성찰 일기 화면이 씁니다.
 *
 * 서버(BE)와 정한 약속입니다. (BE 저장소의 docs/API.md "성찰일기 처방") 로그인이 필요합니다.
 *   GET /reflections/current  -> 200 { date, prescription: ReflectionPrescription | null }
 *
 * 처방은 서버가 내 기록(체크인에서 고른 못 채운 이유 · 타이머를 멈추며 고른 이유)을 보고 규칙으로 내립니다.
 * 질문도 서버에 미리 적어 둔 문장입니다. (AI 가 지어내지 않음) 그래서 화면은 받은 처방을 그대로 보여 주기만 합니다.
 *   - 최근 7일 중 같은 이유가 3일 이상이면, 그 이유에 맞는 질문 3개로 5일 동안
 *   - 위기 표현이 있었거나 기분이 6일 연속 처지면 처방하지 않고, 진행 중인 처방도 숨깁니다
 *
 * 개발용 가상 데이터를 넣었을 때는 서버를 부르지 않고 예시 처방을 보여줍니다. (인사이트 카드와 같은 규칙. lib/insights.ts)
 * 테스트 로그인은 서버가 모르는 사람이라(401) 처방이 없는 것으로 봅니다.
 * 답(일기 원문)은 서버로 보내지 않고 이 기기에만 저장합니다. (hooks/useReflectionEntries.ts)
 */
import { ApiError, api } from '@/lib/api'
import { mockReflectionPrescription } from '@/lib/mock'
import type { ReflectionPrescription } from '@/types'
import { queryOptions } from '@tanstack/react-query'

/** 서버 응답을 기다리는 최대 시간(밀리초) */
const REQUEST_TIMEOUT_MS = 10000

/** 서버가 준 처방이 약속한 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) */
function isReflectionPrescription(value: unknown): value is ReflectionPrescription {
  if (typeof value !== 'object' || value === null) return false
  const prescription = value as Record<string, unknown>
  return (
    typeof prescription.id === 'string' &&
    typeof prescription.startDate === 'string' &&
    typeof prescription.days === 'number' &&
    typeof prescription.reason === 'string' &&
    Array.isArray(prescription.questions) &&
    prescription.questions.every((question) => typeof question === 'string')
  )
}

/** 받아옵니다. 처방이 없거나 서버가 모르는 사람(401, 테스트 로그인)이면 null 입니다. */
async function fetchReflectionPrescription(): Promise<ReflectionPrescription | null> {
  try {
    const result = await api<unknown>('/reflections/current', {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const prescription =
      typeof result === 'object' && result !== null
        ? (result as Record<string, unknown>).prescription
        : undefined
    if (prescription === null) return null
    // 502: 서버가 이상한 응답을 줬다는 뜻으로 씁니다.
    if (!isReflectionPrescription(prescription)) {
      throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
    }
    // 화면에 쓰는 값만 꺼냅니다. (서버는 endDate · missReason · reasonDays 도 함께 줍니다)
    return {
      id: prescription.id,
      startDate: prescription.startDate,
      days: prescription.days,
      reason: prescription.reason,
      questions: prescription.questions,
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

/**
 * 지금 내려진 처방의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(reflectionPrescriptionQuery(가상 데이터인지)) 로 받아옵니다.
 * 가상 데이터일 때와 아닐 때의 결과가 섞이지 않게 queryKey 에 넣습니다.
 */
export function reflectionPrescriptionQuery(isDemo: boolean) {
  return queryOptions({
    queryKey: ['reflection-prescription', isDemo],
    queryFn: () => (isDemo ? mockReflectionPrescription : fetchReflectionPrescription()),
    // 처방은 하루에 한 번 정해지고 5일 동안 같습니다. 5분 동안은 다시 받아오지 않습니다.
    staleTime: 5 * 60 * 1000,
  })
}
