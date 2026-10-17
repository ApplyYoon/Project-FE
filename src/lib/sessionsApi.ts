/**
 * 공부 기록(타이머로 한 번 잰 기록)을 서버(BE)에 저장하고, 기간별로 · 오늘 합계로 · 계획별로 받아오는 함수들입니다. (#203)
 * 화면은 아직 이 함수를 쓰지 않습니다. (타이머 · 기록 · 홈 등은 지금 localStorage 의 useStudySessions 훅을 씁니다)
 * 화면을 서버 기록으로 옮길 때 이 파일의 createSession · sessionsByRangeQuery · todayTotalQuery · planProgressQuery 를 씁니다.
 *
 * 서버와 정한 약속입니다. (BE 저장소의 docs/API.md "공부 기록", BE 이슈 #13 · #14) 전부 로그인이 필요합니다.
 *   타이머 기록 저장  POST /study-sessions   { subjectId?, startedAt, endedAt, pauseCount, pausedMs?, planId?, targetMinutes?, stopReason?, kind? } -> 201 StudySession
 *   기간 안의 기록    GET  /study-sessions?from=2026-10-01&to=2026-10-07   -> 200 StudySession[] (시작이 빠른 순, 없으면 [])
 *   오늘 순공 합계    GET  /study-sessions/today/total                     -> 200 { date, studyMinutes, subjects: [{ subjectId, studyMinutes }] }
 *   계획별 실제 시간  GET  /study-sessions/by-plan?date=2026-10-05         -> 200 [{ planId, actualMinutes, percent, isReached, remainingMinutes }]
 *   실패              400 값이 틀림 · 401 로그인 풀림 · 404 없는 과목·계획(남의 것 포함) · 409 이미 저장된 기록과 시간이 겹침
 *   서버가 준 message 는 사람이 읽는 한국어 문장이라 화면에 그대로 보여줘도 됩니다. (getApiErrorMessage)
 *
 * ⚠️ 이슈 #203 에는 주소가 /sessions 로 적혀 있는데, BE 가 만든 주소는 /study-sessions 입니다. BE 문서를 따랐습니다.
 *
 * ■ 서버가 주는 모양과 FE 의 StudySession 이 다른 곳 (이 파일이 바꿔 줍니다)
 *   - 값이 없으면 서버는 null, FE 의 StudySession 은 칸이 없음(undefined)입니다. (planId · targetMinutes · stopReason)
 *   - 시각(startedAt · endedAt)은 둘 다 밀리초 숫자(Date.now() 값)라 그대로 씁니다.
 *   - 순공은 서버도 같은 식입니다: 끝 − 시작 − 일시정지한 시간(pausedMs). 그리고 1분 미만은 저장하지 않습니다.
 *
 * ■ 저장에 실패해도 방금 공부한 기록이 사라지면 안 됩니다. (이슈 완료 조건)
 *   createSession 은 실패하면 에러를 던질 뿐, 보낸 값은 호출한 쪽에 그대로 있습니다.
 *   화면은 저장에 성공할 때까지 방금 잰 기록을 들고 있다가, 실패하면 같은 값으로 다시 보내게 해야 합니다.
 *   (useMutation 의 variables · mutate 를 다시 부르면 됩니다. hooks/useSessionMutations.ts)
 */
import { ApiError, api } from '@/lib/api'
import { isDateKey } from '@/lib/date'
import { missReasonOptions } from '@/lib/missReasons'
import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type { MissReason, PlanKind, StudySession } from '@/types'

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 멈춰도 로딩이 영원히 끝나지 않으면 안 되기 때문입니다. */
const REQUEST_TIMEOUT_MS = 10000

/** 순공이 이보다 짧으면(1분 미만) 서버가 저장하지 않습니다. 타이머(TimerPage)의 MIN_SAVE_SECONDS 와 같은 규칙입니다. */
export const SESSION_MIN_STUDY_SECONDS = 60
/** 시작 시각이 이보다 앞서면(2020-01-01 UTC 이전) 서버가 거절합니다. (시계가 초기화된 기기의 1970년 기록 등) */
export const SESSION_MIN_STARTED_AT = Date.UTC(2020, 0, 1)
/** 기간별 목록은 한 번에 31일까지만 받을 수 있습니다. (시작일과 끝일을 모두 센 날 수) */
export const SESSION_MAX_RANGE_DAYS = 31

/** 저장할 때 서버에 보내는 값. 노는 기록은 과목을 안 보냅니다. */
export interface SessionCreateInput {
  /** 공부 기록은 필수(내 과목의 id). 노는 기록이면 없거나 빈 글자 */
  subjectId?: string
  /** 시작한 시각 (Date.now() 값) */
  startedAt: number
  /** 끝낸 시각 (Date.now() 값). 시작보다 뒤이고 미래가 아니어야 합니다 */
  endedAt: number
  /** 일시정지를 누른 횟수 */
  pauseCount: number
  /** 일시정지해 있던 시간의 합 (밀리초). 안 보내면 0 */
  pausedMs?: number
  /** 어느 계획을 하려고 켠 타이머인지. 계획 없이 켰으면 없음 */
  planId?: string
  /** 시작할 때 약속한 목표 시간(분). 목표 없이 켰으면 없음 */
  targetMinutes?: number
  /** 목표 전에 그만둔 이유. 안 골랐으면 없음 */
  stopReason?: MissReason
  /** 안 보내면 서버가 공부(study)로 봅니다 */
  kind?: PlanKind
}

/** 오늘 순공 합계 (타이머 화면의 "오늘 총 공부 시간") */
export interface TodayTotal {
  /** 서버가 "오늘" 로 본 날짜 'YYYY-MM-DD' (새벽 4시 기준) */
  date: string
  /** 오늘 순공시간(분). 노는 기록은 넣지 않습니다 */
  studyMinutes: number
  /** 과목별 순공시간(분). 과목 번호가 작은 순서. 과목별을 더한 값이 전체와 1~2분 다를 수 있습니다 */
  subjects: { subjectId: string; studyMinutes: number }[]
}

/** 계획 하나의 실제 시간과 진행률 (계획 줄의 "32 / 50분" 과 진행 막대) */
export interface ServerPlanProgress {
  planId: string
  /** 그 계획으로 켠 기록들의 순공 합(분). 1분이 안 되는 나머지는 버립니다 */
  actualMinutes: number
  /** 목표 대비 진행률 (0 ~ 100). 소수점은 버립니다 */
  percent: number
  /** 목표 시간을 채웠는지 */
  isReached: boolean
  /** 목표까지 남은 시간(분). 올림. 채웠으면 0 */
  remainingMinutes: number
}

const MISS_REASON_KEYS: string[] = missReasonOptions.map((option) => option.key)

/** 값이 유한한 숫자인지 확인합니다. (NaN · Infinity · 글자는 아닙니다) */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 502: 서버가 이상한 응답을 줬다는 뜻으로 씁니다. */
function badResponse(): ApiError {
  return new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
}

/**
 * 서버가 준 기록 하나를 FE 의 StudySession 으로 바꿉니다. 모양이 이상하면 502 에러입니다.
 * 값이 없을 때 서버가 주는 null 은 StudySession 에서 칸을 비워 둡니다. (planId · targetMinutes · stopReason)
 *
 *   { id: '12', subjectId: '3', startedAt, endedAt, pauseCount: 2, pausedMs: 300000, planId: '7', targetMinutes: 50, stopReason: 'phone', kind: 'study' }
 *     -> 그대로
 *   { ..., planId: null, targetMinutes: null, stopReason: null, kind: 'play' }
 *     -> planId · targetMinutes · stopReason 칸이 없는 StudySession
 */
export function toStudySession(value: unknown): StudySession {
  if (typeof value !== 'object' || value === null) throw badResponse()
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string' ||
    typeof item.subjectId !== 'string' ||
    !isNumber(item.startedAt) ||
    !isNumber(item.endedAt) ||
    !isNumber(item.pauseCount) ||
    !isNumber(item.pausedMs) ||
    (item.planId !== null && typeof item.planId !== 'string') ||
    (item.targetMinutes !== null && !isNumber(item.targetMinutes)) ||
    (item.stopReason !== null && !MISS_REASON_KEYS.includes(item.stopReason as string)) ||
    (item.kind !== 'study' && item.kind !== 'play')
  ) {
    throw badResponse()
  }

  const session: StudySession = {
    id: item.id,
    subjectId: item.subjectId,
    startedAt: item.startedAt,
    endedAt: item.endedAt,
    pauseCount: item.pauseCount,
    pausedMs: item.pausedMs,
    kind: item.kind,
  }
  if (item.planId !== null) session.planId = item.planId
  if (item.targetMinutes !== null) session.targetMinutes = item.targetMinutes
  if (item.stopReason !== null) session.stopReason = item.stopReason as MissReason
  return session
}

function toStudySessions(value: unknown): StudySession[] {
  if (!Array.isArray(value)) throw badResponse()
  return value.map(toStudySession)
}

/**
 * 순공 시간(초)을 셉니다. 끝 − 시작 − 일시정지한 시간입니다. (서버와 같은 식. 음수가 되면 0)
 *
 *   19:00 시작 ~ 20:10 정지, 40분 멈춤 -> 30분 = 1800초
 *   getStudySeconds({ startedAt: 0, endedAt: 4200000, pausedMs: 2400000 }) -> 1800
 */
export function getStudySeconds(
  input: Pick<SessionCreateInput, 'startedAt' | 'endedAt' | 'pausedMs'>,
): number {
  return Math.max(0, Math.floor((input.endedAt - input.startedAt - (input.pausedMs ?? 0)) / 1000))
}

/**
 * 이 기록을 저장해도 되는지(순공이 1분 이상인지) 알려 줍니다. 타이머가 "저장할지 버릴지" 정할 때 씁니다.
 *
 *   순공 59초 -> false   /   순공 60초 -> true
 */
export function isSavableSession(
  input: Pick<SessionCreateInput, 'startedAt' | 'endedAt' | 'pausedMs'>,
): boolean {
  return getStudySeconds(input) >= SESSION_MIN_STUDY_SECONDS
}

/**
 * 저장할 기록을 서버가 받는 모양으로 만듭니다.
 *   - 노는 기록은 과목을 보내지 않습니다. (보내도 서버가 비웁니다)
 *   - 없는 값(undefined · 빈 글자)은 보내지 않습니다.
 *
 *   { subjectId: '3', startedAt, endedAt, pauseCount: 2, pausedMs: 300000, planId: '7', targetMinutes: 50, stopReason: 'phone' }
 *     -> 그대로
 *   { subjectId: '', startedAt, endedAt, pauseCount: 0, planId: '', kind: 'play' }
 *     -> { startedAt, endedAt, pauseCount: 0, kind: 'play' }
 */
export function toCreateBody(input: SessionCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    pauseCount: input.pauseCount,
  }
  if (input.kind !== undefined) body.kind = input.kind
  if (input.kind !== 'play' && input.subjectId !== undefined && input.subjectId !== '') {
    body.subjectId = input.subjectId
  }
  if (input.pausedMs !== undefined) body.pausedMs = input.pausedMs
  if (input.planId !== undefined && input.planId !== '') body.planId = input.planId
  if (input.targetMinutes !== undefined) body.targetMinutes = input.targetMinutes
  if (input.stopReason !== undefined) body.stopReason = input.stopReason
  return body
}

/**
 * 타이머 기록 하나를 저장하고, 서버가 저장한 기록(id 가 붙어 있음)을 돌려줍니다. 실패하면 에러를 던집니다.
 *
 * 순공이 1분 미만이면 서버를 부르지 않고 400 에러를 던집니다. (서버도 400 인 같은 규칙. 헛된 요청을 줄입니다)
 * 이미 저장된 내 기록과 시간이 겹치면 서버가 409 를 줍니다. (끝과 시작이 딱 붙은 것은 괜찮습니다)
 * 실패해도 보낸 값은 호출한 쪽에 그대로 있으니, 같은 값으로 다시 보내면 됩니다.
 */
export async function createSession(input: SessionCreateInput): Promise<StudySession> {
  if (!isSavableSession(input)) {
    throw new ApiError('1분 미만의 기록은 저장하지 않아요', 400, 'VALIDATION_ERROR')
  }
  const result = await api<unknown>('/study-sessions', {
    method: 'POST',
    body: JSON.stringify(toCreateBody(input)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toStudySession(result)
}

/** 'YYYY-MM-DD' 두 날짜 사이의 날 수(시작일과 끝일을 모두 센 것)입니다. 같은 날이면 1 입니다. */
function countDaysInclusive(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const ms = new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1
}

/** 날짜 모양이 아니면 서버를 부르지 않고 400 에러를 던집니다. */
function assertDate(date: string): void {
  if (!isDateKey(date)) throw new ApiError('날짜를 다시 확인해 주세요', 400, 'VALIDATION_ERROR')
}

/**
 * 기간(from ~ to, 둘 다 포함)이 서버가 받는 기간인지 확인합니다. 아니면 서버를 부르지 않고 400 에러를 던집니다.
 *   날짜 모양이 틀림 · from 이 to 보다 늦음 · 31일보다 김
 */
function assertRange(from: string, to: string): void {
  assertDate(from)
  assertDate(to)
  if (from > to) {
    throw new ApiError('시작 날짜는 끝 날짜보다 늦을 수 없어요', 400, 'VALIDATION_ERROR')
  }
  if (countDaysInclusive(from, to) > SESSION_MAX_RANGE_DAYS) {
    throw new ApiError(
      `한 번에 ${SESSION_MAX_RANGE_DAYS}일까지만 조회할 수 있어요`,
      400,
      'VALIDATION_ERROR',
    )
  }
}

async function fetchSessionsByRange(from: string, to: string): Promise<StudySession[]> {
  assertRange(from, to)
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const result = await api<unknown>(`/study-sessions?${query}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toStudySessions(result)
}

/**
 * 기간 안의 내 기록 목록의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(sessionsByRangeQuery('2026-10-01', '2026-10-07')) 로 받아옵니다.
 * (docs/DATA-FETCHING.md) from · to 는 그날도 포함하고, 하루는 새벽 4시 기준입니다.
 * 시작이 빠른 순서(오래된 것이 앞)로 옵니다. 최근 날짜를 위에 보여주려면 화면에서 뒤집어 씁니다.
 * 노는 기록(kind: 'play')도 들어 있으니, 순공을 셀 때는 빼야 합니다.
 */
export function sessionsByRangeQuery(from: string, to: string) {
  return queryOptions({
    queryKey: ['study-sessions', 'range', from, to],
    queryFn: () => fetchSessionsByRange(from, to),
    // 400 같은 거절은 다시 시도해도 같아서, 다시 시도하지 않습니다.
    retry: false,
  })
}

async function fetchTodayTotal(): Promise<TodayTotal> {
  const result = await api<unknown>('/study-sessions/today/total', {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (typeof result !== 'object' || result === null) throw badResponse()
  const total = result as Record<string, unknown>
  if (
    typeof total.date !== 'string' ||
    !isDateKey(total.date) ||
    !isNumber(total.studyMinutes) ||
    !Array.isArray(total.subjects) ||
    !total.subjects.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).subjectId === 'string' &&
        isNumber((item as Record<string, unknown>).studyMinutes),
    )
  ) {
    throw badResponse()
  }
  return {
    date: total.date,
    studyMinutes: total.studyMinutes,
    subjects: (total.subjects as { subjectId: string; studyMinutes: number }[]).map((item) => ({
      subjectId: item.subjectId,
      studyMinutes: item.studyMinutes,
    })),
  }
}

/**
 * 오늘 순공시간과 과목별 합계의 쿼리 설정입니다. 타이머 화면의 "오늘 총 공부 시간" 이 씁니다.
 * "오늘" 도 하루의 기준(새벽 4시)을 따라서, 자정을 넘겨 공부해도 날짜가 안 바뀝니다. (서버가 정한 날짜가 date 로 옵니다)
 * 기록을 저장하면 바뀌어야 해서 30초만 보관합니다. (저장한 뒤에는 invalidateSessions 로 바로 낡게 합니다)
 */
export function todayTotalQuery() {
  return queryOptions({
    queryKey: ['study-sessions', 'today-total'],
    queryFn: fetchTodayTotal,
    staleTime: 30 * 1000,
    retry: false,
  })
}

async function fetchPlanProgress(date: string): Promise<ServerPlanProgress[]> {
  assertDate(date)
  const result = await api<unknown>(`/study-sessions/by-plan?date=${encodeURIComponent(date)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!Array.isArray(result)) throw badResponse()
  return result.map((value) => {
    if (typeof value !== 'object' || value === null) throw badResponse()
    const item = value as Record<string, unknown>
    if (
      typeof item.planId !== 'string' ||
      !isNumber(item.actualMinutes) ||
      !isNumber(item.percent) ||
      typeof item.isReached !== 'boolean' ||
      !isNumber(item.remainingMinutes)
    ) {
      throw badResponse()
    }
    return {
      planId: item.planId,
      actualMinutes: item.actualMinutes,
      percent: item.percent,
      isReached: item.isReached,
      remainingMinutes: item.remainingMinutes,
    }
  })
}

/**
 * 그날 계획마다 실제 시간과 진행률의 쿼리 설정입니다. 계획 줄의 "32 / 50분" 과 진행 막대에 씁니다.
 * 계획 번호 순서로 오고, 기록이 없는 계획도 actualMinutes 0 으로 들어 있습니다. 계획이 없는 날은 [] 입니다.
 * 노는 계획의 실제 시간은 노는 기록의 길이입니다.
 */
export function planProgressQuery(date: string) {
  return queryOptions({
    queryKey: ['study-sessions', 'by-plan', date],
    queryFn: () => fetchPlanProgress(date),
    retry: false,
  })
}

/**
 * 보관해 둔 기록 관련 값(기간별 목록 · 오늘 합계 · 계획별 실제 시간)을 모두 "낡았다" 고 표시해서,
 * 화면이 서버에서 새로 받아오게 합니다. 기록 저장이 성공한 뒤에 부릅니다. (hooks/useSessionMutations.ts 가 대신 불러 줍니다)
 * 세 가지가 모두 같은 기록에서 계산돼서 한꺼번에 낡게 합니다.
 */
export function invalidateSessions(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['study-sessions'] })
}
