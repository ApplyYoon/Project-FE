/**
 * 통화에서 "자주 보이는 내 생각 습관(인지편향)" 을 서버에서 받아옵니다. (BE 이슈 #29)
 * 기록 화면의 "자주 보이는 내 생각 습관" 카드가 씁니다.
 *
 * 서버(BE)와 정한 약속입니다. (BE 저장소의 docs/API.md "내 통화 기록") 로그인이 필요합니다.
 *   GET /calls/habits  -> 200 ThinkingHabitSummary[]  (없으면 [])
 *
 * 서버는 최근 14일 동안의 통화 중 "서로 다른 3일 이상" 보인 습관만 돌려줍니다.
 * 한두 번은 우연일 수 있어서, "습관" 이라고 보여 주려면 근거가 쌓여야 하기 때문입니다.
 */
import { ApiError, api } from '@/lib/api'
import { queryOptions } from '@tanstack/react-query'

/** 서버 응답을 기다리는 최대 시간(밀리초) */
const REQUEST_TIMEOUT_MS = 10000

/** 자주 보이는 생각 습관 하나 */
export interface ThinkingHabitSummary {
  /** 습관을 구분하는 이름. 예: 'PLANNING_FALLACY' */
  key: string
  /** 보여 줄 이름. 예: '계획 오류' */
  label: string
  /** 어떤 생각인지 한 줄 */
  description: string
  /** 알아차린 뒤 해 볼 행동 하나 (서버에 정해 둔 문장) */
  solution: string
  /** 최근 14일 중 이 습관이 보인 서로 다른 날의 수 (3 이상) */
  days: number
  /** 가장 최근에 보인 날 'YYYY-MM-DD' */
  lastDate: string
  /** 가장 최근 근거 한 줄 (내가 한 말의 요지). 없으면 null */
  lastEvidence: string | null
}

/** 서버가 준 값이 약속한 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) */
function isThinkingHabitSummary(value: unknown): value is ThinkingHabitSummary {
  if (typeof value !== 'object' || value === null) return false
  const habit = value as Record<string, unknown>
  return (
    typeof habit.key === 'string' &&
    typeof habit.label === 'string' &&
    typeof habit.description === 'string' &&
    typeof habit.solution === 'string' &&
    typeof habit.days === 'number' &&
    typeof habit.lastDate === 'string' &&
    (habit.lastEvidence === null || typeof habit.lastEvidence === 'string')
  )
}

async function fetchThinkingHabits(): Promise<ThinkingHabitSummary[]> {
  const result = await api<unknown>('/calls/habits', {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // 502: 서버가 이상한 응답을 줬다는 뜻으로 씁니다.
  if (!Array.isArray(result) || !result.every(isThinkingHabitSummary)) {
    throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  }
  return result
}

/**
 * 자주 보이는 내 생각 습관의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(thinkingHabitsQuery()) 로 받아옵니다.
 * queryKey 에 사람을 구분하는 값이 없는 이유: 로그인한 사람의 것 하나뿐이기 때문입니다. (profileQuery 와 같음)
 */
export function thinkingHabitsQuery() {
  return queryOptions({
    queryKey: ['call-habits'],
    queryFn: fetchThinkingHabits,
    // 통화는 하루에 몇 번뿐이라 자주 바뀌지 않습니다. 5분 동안은 다시 받아오지 않습니다.
    staleTime: 5 * 60 * 1000,
  })
}
