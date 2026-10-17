/**
 * 공부 계획을 서버(BE)에서 받아오고, 추가·수정·삭제하는 함수들입니다. (#202)
 * 화면은 아직 이 함수를 쓰지 않습니다. (계획을 쓰는 화면들은 지금 localStorage 의 usePlans 훅을 씁니다)
 * 화면을 서버 계획으로 옮길 때 이 파일의 plansByDateQuery · createPlan · createPlans · updatePlan · deletePlan 을 씁니다.
 *
 * 서버와 정한 약속입니다. (BE 저장소의 docs/API.md "공부 계획", BE 이슈 #11 · #12) 전부 로그인이 필요합니다.
 *   그날의 계획   GET    /study-plans?date=2026-10-05                    -> 200 StudyPlan[] (없는 날은 [])
 *   계획 추가     POST   /study-plans          { date, content, targetMinutes, subjectId?, startTime?, kind? } -> 201 StudyPlan
 *   여러 개 추가  POST   /study-plans/batch    { plans: [...] }          -> 201 StudyPlan[] (1 ~ 50개, 하나라도 틀리면 전부 안 함)
 *   바꾸기·완료   PATCH  /study-plans/:id      { done?, content?, targetMinutes?, startTime?, kind?, subjectId? } -> 200 StudyPlan
 *   삭제          DELETE /study-plans/:id                                -> 204
 *   실패          400 값이 틀림 · 401 로그인 풀림 · 404 없는 계획·과목(남의 것 포함)
 *   서버가 준 message 는 사람이 읽는 한국어 문장이라 화면에 그대로 보여줘도 됩니다. (getApiErrorMessage)
 *
 * ⚠️ 이슈 #202 에는 주소가 /plans 로 적혀 있는데, BE 가 만든 주소는 /study-plans 입니다. BE 문서를 따랐습니다.
 *
 * ■ 서버가 주는 모양과 FE 의 StudyPlan 이 다른 곳 (이 파일이 바꿔 줍니다)
 *   - 시작 시각 · 루틴이 없을 때 서버는 null, FE 의 StudyPlan 은 칸이 없음(undefined)입니다.
 *   - FE 의 StudyPlan.googleEventId (구글 캘린더 일정 번호)는 서버에 없습니다. 이 기기에서만 아는 값이라
 *     화면을 서버 계획으로 옮길 때 따로 보관해야 합니다. (아니면 새로고침 뒤에 구글 일정과의 연결이 끊깁니다)
 *   - 서버 id 는 글자("7")입니다. FE 의 StudyPlan.id 도 글자라 그대로 씁니다.
 *   - 날짜는 바꿀 수 없습니다. 다른 날로 옮기려면 지우고 새로 만듭니다.
 */
import { ApiError, api } from '@/lib/api'
import { MAX_TARGET_MINUTES } from '@/lib/countdown'
import { isDateKey } from '@/lib/date'
import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type { PlanKind, StudyPlan } from '@/types'

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 멈춰도 로딩이 영원히 끝나지 않으면 안 되기 때문입니다. */
const REQUEST_TIMEOUT_MS = 10000

/** 서버가 받는 할 일 내용의 최대 글자 수 (앞뒤 공백을 지운 뒤 1 ~ 200자) */
export const PLAN_CONTENT_MAX_LENGTH = 200
/** 서버가 받는 목표 시간 범위(분). 최대는 타이머와 같습니다. (lib/countdown.ts) */
export const PLAN_MIN_MINUTES = 1
export const PLAN_MAX_MINUTES = MAX_TARGET_MINUTES
/** 한 번에 추가할 수 있는 계획 수 */
export const PLAN_BATCH_MAX = 50

/** 계획을 추가할 때 서버에 보내는 값. 노는 계획은 과목을 안 보냅니다. 시작 시각은 안 정했으면 안 보냅니다. */
export interface PlanCreateInput {
  /** 계획한 날짜 'YYYY-MM-DD' */
  date: string
  content: string
  targetMinutes: number
  /** 공부 계획은 필수(내 과목의 id). 노는 계획이면 없거나 빈 글자 */
  subjectId?: string
  /** 'HH:MM'. 안 정했으면 없거나 빈 글자 (시간 미정) */
  startTime?: string
  /** 안 보내면 서버가 공부(study)로 봅니다 */
  kind?: PlanKind
}

/**
 * 계획을 고칠 때 서버에 보내는 값. 바꿀 것만 적습니다. (전부 비면 보내지 않고 에러입니다)
 * startTime 에 빈 글자('')를 주면 시작 시각을 지웁니다. (시간 미정. usePlans 의 changeStartTime('') 과 같은 약속)
 */
export interface PlanUpdateInput {
  done?: boolean
  content?: string
  targetMinutes?: number
  startTime?: string
  kind?: PlanKind
  subjectId?: string
}

const TIME_PATTERN = /^\d{2}:\d{2}$/

/** 서버가 준 값이 계획 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) */
function isServerPlan(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const plan = value as Record<string, unknown>
  return (
    typeof plan.id === 'string' &&
    typeof plan.date === 'string' &&
    isDateKey(plan.date) &&
    typeof plan.subjectId === 'string' &&
    typeof plan.content === 'string' &&
    typeof plan.targetMinutes === 'number' &&
    Number.isFinite(plan.targetMinutes) &&
    typeof plan.done === 'boolean' &&
    (plan.startTime === null ||
      (typeof plan.startTime === 'string' && TIME_PATTERN.test(plan.startTime))) &&
    (plan.kind === 'study' || plan.kind === 'play') &&
    (plan.routineId === null || typeof plan.routineId === 'string')
  )
}

/** 502: 서버가 이상한 응답을 줬다는 뜻으로 씁니다. */
function badResponse(): ApiError {
  return new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
}

/** 서버가 준 계획 하나를 FE 의 StudyPlan 으로 바꿉니다. 이상하면 502 에러입니다. */
export function toStudyPlan(value: unknown): StudyPlan {
  if (!isServerPlan(value)) throw badResponse()
  const plan: StudyPlan = {
    id: value.id as string,
    date: value.date as string,
    subjectId: value.subjectId as string,
    content: value.content as string,
    targetMinutes: value.targetMinutes as number,
    done: value.done as boolean,
    kind: value.kind as PlanKind,
  }
  // 서버는 값이 없으면 null 을 줍니다. StudyPlan 은 없는 칸을 비워 두므로, 있을 때만 넣습니다.
  if (value.startTime !== null) plan.startTime = value.startTime as string
  if (value.routineId !== null) plan.routineId = value.routineId as string
  return plan
}

/** 서버가 준 계획 목록을 StudyPlan[] 으로 바꿉니다. 배열이 아니거나 하나라도 이상하면 502 에러입니다. */
function toStudyPlans(value: unknown): StudyPlan[] {
  if (!Array.isArray(value)) throw badResponse()
  return value.map(toStudyPlan)
}

/**
 * 추가할 계획을 서버가 받는 모양으로 만듭니다.
 *   - 노는 계획은 과목을 보내지 않습니다. (보내도 서버가 비웁니다)
 *   - 시작 시각이 비어 있으면(시간 미정) 보내지 않습니다.
 *   - kind 를 안 정했으면 보내지 않습니다. (서버가 공부로 봅니다)
 *
 *   { date, content, targetMinutes, subjectId: '3', startTime: '19:00' }
 *     -> { date, content, targetMinutes, subjectId: '3', startTime: '19:00' }
 *   { date, content, targetMinutes, subjectId: '', startTime: '', kind: 'play' }
 *     -> { date, content, targetMinutes, kind: 'play' }
 */
export function toCreateBody(input: PlanCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    date: input.date,
    content: input.content,
    targetMinutes: input.targetMinutes,
  }
  if (input.kind !== undefined) body.kind = input.kind
  if (input.kind !== 'play' && input.subjectId !== undefined && input.subjectId !== '') {
    body.subjectId = input.subjectId
  }
  if (input.startTime !== undefined && input.startTime !== '') body.startTime = input.startTime
  return body
}

/** 날짜 모양('YYYY-MM-DD')이 아니면 서버를 부르지 않고 400 에러를 던집니다. */
function assertDate(date: string): void {
  if (!isDateKey(date)) throw new ApiError('날짜를 다시 확인해 주세요', 400, 'VALIDATION_ERROR')
}

async function fetchPlansByDate(date: string): Promise<StudyPlan[]> {
  assertDate(date)
  const result = await api<unknown>(`/study-plans?date=${encodeURIComponent(date)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toStudyPlans(result)
}

/**
 * 그날의 계획 목록의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(plansByDateQuery('2026-10-05')) 로 받아옵니다.
 * (docs/DATA-FETCHING.md) 서버가 정렬해서 줍니다: 시작 시각이 있는 계획이 빠른 순, 그 뒤에 시각이 없는 계획이 만든 순.
 * queryKey 에 날짜가 들어 있어서 날짜를 바꾸면 그날 것을 따로 받아옵니다.
 */
export function plansByDateQuery(date: string) {
  return queryOptions({
    queryKey: ['study-plans', date],
    queryFn: () => fetchPlansByDate(date),
    // 400·404 같은 거절은 다시 시도해도 같아서, 다시 시도하지 않습니다.
    retry: false,
  })
}

/** 계획을 추가하고, 서버가 만든 계획(id 가 붙어 있음)을 돌려줍니다. 실패하면 에러를 던집니다. */
export async function createPlan(input: PlanCreateInput): Promise<StudyPlan> {
  assertDate(input.date)
  const result = await api<unknown>('/study-plans', {
    method: 'POST',
    body: JSON.stringify(toCreateBody(input)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toStudyPlan(result)
}

/**
 * 계획 여러 개를 한 번에 추가하고, 만들어진 계획들을 보낸 순서대로 돌려줍니다. (어제 계획 가져오기 · 말로 계획 세우기가 씁니다)
 * 1 ~ 50개만 보낼 수 있습니다. 벗어나면 서버를 부르지 않고 400 에러입니다.
 * 하나라도 틀리면 서버가 하나도 저장하지 않고 처음 걸린 이유 하나만 알려 줍니다.
 */
export async function createPlans(inputs: PlanCreateInput[]): Promise<StudyPlan[]> {
  if (inputs.length < 1 || inputs.length > PLAN_BATCH_MAX) {
    throw new ApiError(
      `한 번에 1 ~ ${PLAN_BATCH_MAX}개까지 추가할 수 있어요`,
      400,
      'VALIDATION_ERROR',
    )
  }
  inputs.forEach((input) => assertDate(input.date))
  const result = await api<unknown>('/study-plans/batch', {
    method: 'POST',
    body: JSON.stringify({ plans: inputs.map(toCreateBody) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toStudyPlans(result)
}

/**
 * 계획의 내용 · 목표 시간 · 시작 시각 · 종류 · 과목을 바꾸거나 완료 체크를 하고, 바뀐 계획을 돌려줍니다.
 * 바꿀 것만 서버에 보냅니다. 하나도 없으면 서버를 부르지 않고 400 에러를 던집니다.
 *
 *   updatePlan('7', { done: true })                 -> PATCH /study-plans/7  { "done": true }
 *   updatePlan('7', { startTime: '20:00' })         -> PATCH ...             { "startTime": "20:00" }
 *   updatePlan('7', { startTime: '' })              -> PATCH ...             { "startTime": "" }   (시작 시각을 지움)
 *   updatePlan('7', { content: '4단원', targetMinutes: 60 }) -> { "content": "4단원", "targetMinutes": 60 }
 *   updatePlan('7', {})                             -> 서버를 부르지 않고 ApiError(400)
 */
export async function updatePlan(id: string, input: PlanUpdateInput): Promise<StudyPlan> {
  const body: PlanUpdateInput = {}
  if (input.done !== undefined) body.done = input.done
  if (input.content !== undefined) body.content = input.content
  if (input.targetMinutes !== undefined) body.targetMinutes = input.targetMinutes
  if (input.startTime !== undefined) body.startTime = input.startTime
  if (input.kind !== undefined) body.kind = input.kind
  if (input.subjectId !== undefined) body.subjectId = input.subjectId
  if (Object.keys(body).length === 0) {
    throw new ApiError('바꿀 값을 정해 주세요', 400, 'VALIDATION_ERROR')
  }

  const result = await api<unknown>(`/study-plans/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toStudyPlan(result)
}

/** 계획을 지웁니다. 실패하면 에러를 던집니다. (없는 계획이거나 남의 계획이면 404) */
export async function deletePlan(id: string): Promise<void> {
  await api<void>(`/study-plans/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

/**
 * 보관해 둔 계획 목록(모든 날짜)을 "낡았다" 고 표시해서, 화면이 서버에서 새 목록을 다시 받아오게 합니다.
 * 추가 · 수정 · 삭제가 성공한 뒤에 부릅니다. (hooks/usePlanMutations.ts 가 대신 불러 줍니다)
 * 날짜를 바꿀 수는 없어서 한 날짜만 낡게 해도 되지만, 홈 · 기록 같은 화면이 다른 날짜를 같이 쓰므로 전부 낡게 합니다.
 */
export function invalidatePlans(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['study-plans'] })
}
