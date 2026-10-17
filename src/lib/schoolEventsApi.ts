/**
 * 내 학교 학사일정을 서버(BE)에서 받아오는 함수입니다. (BE 저장소 docs/API.md "학교 학사일정", BE#282)
 *
 *   GET  /school/events          -> 200 { school: { code, name } | null, fetchedAt: number | null, events: [...] }
 *   POST /school/events/refresh  -> 같은 모양 ([새로고침]. 서버는 같은 학교를 10분에 한 번만 NEIS 에서 다시 받음)
 *   - 학교는 가입 정보에서 서버가 꺼냅니다. 학교를 안 골랐으면 school 이 null 입니다.
 *   - 서버는 NEIS 학사일정을 학교마다 저장해 두고 24시간마다 새로 받습니다. NEIS 가 멈춰도 받아 둔 것을 줍니다.
 */
import { ApiError, api } from '@/lib/api'
import type { SchoolEvent } from '@/lib/schoolEvents'
import { queryOptions } from '@tanstack/react-query'

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 처음 한 번은 NEIS 를 여러 번 불러서 조금 넉넉히 줍니다. */
const REQUEST_TIMEOUT_MS = 30000

export interface SchoolEventsResult {
  school: { code: string; name: string } | null
  /** NEIS 에서 마지막으로 받은 시각(밀리초). 한 번도 못 받았으면 null */
  fetchedAt: number | null
  events: SchoolEvent[]
}

function isSchoolEvent(value: unknown): value is SchoolEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Record<string, unknown>
  return (
    typeof event.date === 'string' &&
    typeof event.name === 'string' &&
    (event.content === null || typeof event.content === 'string') &&
    Array.isArray(event.grades) &&
    event.grades.every((grade) => typeof grade === 'number') &&
    typeof event.exam === 'boolean'
  )
}

/** 서버 응답 모양을 확인합니다. 이상하면 ApiError(502) */
function toResult(value: unknown): SchoolEventsResult {
  if (typeof value !== 'object' || value === null) {
    throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  }
  const record = value as Record<string, unknown>
  const school = record.school
  const schoolOk =
    school === null ||
    (typeof school === 'object' &&
      typeof (school as Record<string, unknown>).code === 'string' &&
      typeof (school as Record<string, unknown>).name === 'string')
  const fetchedAtOk = record.fetchedAt === null || typeof record.fetchedAt === 'number'
  if (
    !schoolOk ||
    !fetchedAtOk ||
    !Array.isArray(record.events) ||
    !record.events.every(isSchoolEvent)
  ) {
    throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  }
  return {
    school: school as SchoolEventsResult['school'],
    fetchedAt: record.fetchedAt as number | null,
    events: record.events,
  }
}

async function fetchSchoolEvents(): Promise<SchoolEventsResult> {
  const result = await api<unknown>('/school/events', {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toResult(result)
}

/** [새로고침]: 서버가 NEIS 에서 다시 받아 오늘부터 120일 일정을 돌려줍니다. */
export async function refreshSchoolEvents(): Promise<SchoolEventsResult> {
  const result = await api<unknown>('/school/events/refresh', {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toResult(result)
}

/** 내 학교 학사일정 쿼리 (오늘부터 120일) */
export function schoolEventsQuery() {
  return queryOptions({
    queryKey: ['school-events'],
    queryFn: fetchSchoolEvents,
    // 서버가 하루 단위로 새로 받아서, 화면에서는 30분 동안 다시 받지 않습니다.
    staleTime: 30 * 60 * 1000,
  })
}
