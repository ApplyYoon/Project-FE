import { api } from '@/lib/api'
import { queryOptions } from '@tanstack/react-query'
import type { Goal, GoalTargetSnapshot } from '@/types'

/**
 * 목표를 서버(BE `/api/v1/goals`, docs/API.md 「목표」)와 주고받는 함수들입니다. (#516)
 * 이 기기의 목표 모양(Goal)과 서버의 목표 모양을 서로 바꾸는 일도 여기서 합니다.
 * 언제 보내고 받을지는 lib/goalSync.ts 가 정합니다.
 *
 * 서버에는 목표를 지우는 주소가 없습니다. (그만두면 "포기" 로 상태를 바꿉니다)
 * 진척(progressLog) · 마지막 점검(lastCheckedAt)은 아직 서버에 없어서 이 기기에만 둡니다.
 */

/** 서버를 기다리는 최대 시간(밀리초) */
const REQUEST_TIMEOUT_MS = 10000

/** 서버의 목표 한 개 */
export interface ServerGoal {
  id: string
  kind: Goal['kind']
  title: string
  dDay: string
  currentScore: string | null
  totalAmount: number | null
  amountUnit: string | null
  benefit: string
  cost: string
  obstacle: string
  plan: string
  status: Goal['status']
  result: string | null
  givenUpReason: string | null
  history: {
    title: string
    dDay: string
    currentScore: string | null
    totalAmount: number | null
    amountUnit: string | null
    changedAt: number
    reason: string
  }[]
  createdAt: number
}

/** 서버가 준 값이 목표 모양인지 확인합니다. (꼭 쓰는 칸만 봅니다) */
function isServerGoal(value: unknown): value is ServerGoal {
  if (typeof value !== 'object' || value === null) return false
  const goal = value as Record<string, unknown>
  return (
    typeof goal.id === 'string' &&
    typeof goal.title === 'string' &&
    typeof goal.dDay === 'string' &&
    typeof goal.status === 'string' &&
    Array.isArray(goal.history)
  )
}

/**
 * 다른 기기에서 만든 목표를 이 기기에 들일 때 붙이는 id 입니다.
 * 카드(lib/cardsApi.ts)도 같은 규칙으로 목표를 찾아서, 목표보다 카드가 먼저 들어와도 연결이 맞습니다.
 *
 *   localGoalIdOf('4') -> 'goal-s4'
 */
export function localGoalIdOf(serverId: string): string {
  return `goal-s${serverId}`
}

/**
 * 서버로 보낼 목표 본문을 만듭니다. 점수형은 지금 점수만, 완주형은 분량 · 단위만 보냅니다. (반대 칸을 보내면 서버가 400)
 * - create(만들기): 목표값 · WOOP 글만 보냅니다. 상태는 서버가 "진행 중" 으로 만듭니다.
 * - update(바꾸기): 상태 · 결과도 보내서 서버를 이 기기의 목표와 똑같이 맞춥니다.
 *   목표값이 바뀌었으면 서버가 이유를 꼭 받아서, 이 기기의 마지막 이력의 이유를 같이 보냅니다.
 *   (목표값이 그대로면 서버는 이유를 쓰지 않습니다)
 */
export function toServerGoalBody(goal: Goal, mode: 'create' | 'update'): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: goal.title,
    dDay: goal.dDay,
    benefit: goal.benefit,
    cost: goal.cost,
    obstacle: goal.obstacle,
    plan: goal.plan,
  }
  if (goal.kind === 'score') {
    body.currentScore = goal.currentScore ?? ''
  } else {
    body.totalAmount = goal.totalAmount
    body.amountUnit = goal.amountUnit ?? ''
  }
  if (mode === 'create') {
    body.kind = goal.kind
    return body
  }
  body.status = goal.status
  // 포기는 이유가 꼭 있어야 서버가 받습니다. (이 기기에서도 이유를 받고 포기합니다, lib/goalProgress.ts)
  if (goal.status === 'givenUp') body.givenUpReason = goal.givenUpReason?.trim() ?? ''
  if (goal.result) body.result = goal.result
  const lastChange = goal.history.at(-1)
  if (lastChange) body.reason = lastChange.reason
  return body
}

/** 서버의 null 을 이 기기의 "칸 없음" 으로 바꿉니다. */
function orUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value
}

/**
 * 서버의 목표를 이 기기의 목표 모양으로 바꿉니다.
 * local 은 이 기기에 이미 있는 같은 목표입니다. 서버에 없는 칸(진척 · 마지막 점검)은 local 의 것을 그대로 둡니다.
 *
 *   fromServerGoal({ id: '4', title: '수학 3등급', … })                  -> { id: 'goal-s4', serverId: '4', … }   (다른 기기에서 만든 목표)
 *   fromServerGoal({ id: '4', … }, { id: 'goal-1', progressLog: [...] }) -> { id: 'goal-1', serverId: '4', progressLog: [...], … }
 */
export function fromServerGoal(server: ServerGoal, local?: Goal): Goal {
  const history: GoalTargetSnapshot[] = server.history.map((item) => ({
    title: item.title,
    dDay: item.dDay,
    currentScore: orUndefined(item.currentScore),
    totalAmount: orUndefined(item.totalAmount),
    amountUnit: orUndefined(item.amountUnit),
    changedAt: item.changedAt,
    reason: item.reason,
  }))
  const goal: Goal = {
    id: local?.id ?? localGoalIdOf(server.id),
    serverId: server.id,
    kind: server.kind === 'completion' ? 'completion' : 'score',
    title: server.title,
    dDay: server.dDay,
    benefit: server.benefit,
    cost: server.cost,
    obstacle: server.obstacle,
    plan: server.plan,
    status: server.status,
    history,
    createdAt: local?.createdAt ?? server.createdAt,
  }
  if (server.currentScore !== null) goal.currentScore = server.currentScore
  if (server.totalAmount !== null) goal.totalAmount = server.totalAmount
  if (server.amountUnit !== null) goal.amountUnit = server.amountUnit
  if (server.result !== null) goal.result = server.result
  if (server.givenUpReason !== null) goal.givenUpReason = server.givenUpReason
  if (local?.progressLog) goal.progressLog = local.progressLog
  if (local?.lastCheckedAt !== undefined) goal.lastCheckedAt = local.lastCheckedAt
  return goal
}

/** 내 목표 전부를 서버에서 받습니다. 실패하면 에러를 던집니다. */
export async function fetchServerGoals(): Promise<ServerGoal[]> {
  const result = await api<unknown>('/goals', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  return Array.isArray(result) ? result.filter(isServerGoal) : []
}

/** 서버의 목표 목록 쿼리 설정입니다. 앱을 열 때 한 번 받아 이 기기의 목표와 맞춥니다. (hooks/useGoalSync.ts) */
export function serverGoalsQuery() {
  return queryOptions({
    queryKey: ['server-goals'],
    queryFn: fetchServerGoals,
    // 앱을 쓰는 동안에는 이 기기에서 바꾼 것을 바로 보내므로, 자주 다시 받지 않습니다.
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

/** 서버에 목표를 만들고, 만들어진 목표를 돌려줍니다. 진행 중 목표가 이미 3개면 ApiError(409) 입니다. */
export async function createServerGoal(goal: Goal): Promise<ServerGoal> {
  const result = await api<unknown>('/goals', {
    method: 'POST',
    body: JSON.stringify(toServerGoalBody(goal, 'create')),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!isServerGoal(result)) throw new Error('서버가 준 목표의 모양이 달라요')
  return result
}

/** 서버의 목표를 이 기기의 목표와 똑같이 바꾸고, 바뀐 목표를 돌려줍니다. 서버에 없으면 ApiError(404) 입니다. */
export async function updateServerGoal(serverId: string, goal: Goal): Promise<ServerGoal> {
  const result = await api<unknown>(`/goals/${encodeURIComponent(serverId)}`, {
    method: 'PATCH',
    body: JSON.stringify(toServerGoalBody(goal, 'update')),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!isServerGoal(result)) throw new Error('서버가 준 목표의 모양이 달라요')
  return result
}
