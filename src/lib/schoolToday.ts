/**
 * 오늘 학교 정보(우리 반 시간표 · 급식 · 다가오는 학사일정)를 서버(BE)에서 받아오는 곳입니다. (BE PR #305 · #306)
 * 홈(/)의 시간표 · 급식 · 일정 칸과 AI 코치의 아침 브리핑이 씁니다.
 *
 *   GET /school/today?grade=2&classNo=1
 *     -> 200 { date, school: { code, name } | null,
 *              timetable: [{ period, subject }] | null, timetablePartial,
 *              meals: [{ date, kind, dishes: [] }],
 *              events: [{ date, name, grades: [], exam, dDay }] }
 *   - grade · classNo 는 둘 다 보내거나 둘 다 뺍니다. 빼면 timetable 이 null 입니다.
 *   - timetablePartial 이 true 면 뒤 교시가 잘렸을 수 있습니다. (서버에 NEIS 키가 없으면 5교시까지만 옴)
 *   - 반은 서버에 저장하지 않고 이 기기에 저장해 두었다가 요청마다 보냅니다. (loadSchoolClass · saveSchoolClass)
 *   - 테스트 로그인이면 서버를 부르지 않고 시연용 예시(buildDemoSchoolToday)를 씁니다. 화면에 "시연용 예시" 라고 붙입니다.
 */
import { ApiError, api } from '@/lib/api'
import { moveDateKey } from '@/lib/date'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { gradeNumberOf } from '@/lib/schoolEvents'
import { loadData, saveData } from '@/lib/storage'
import { queryOptions } from '@tanstack/react-query'

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 NEIS 를 부르는 동안 조금 넉넉히 기다립니다. */
const REQUEST_TIMEOUT_MS = 20000

/** 반 번호로 받는 가장 큰 값 (서버와 같은 기준) */
export const MAX_CLASS_NO = 30

/** 시간표 한 칸 */
export interface SchoolPeriod {
  /** 교시 (1, 2, …) */
  period: number
  subject: string
}

/** 급식 한 끼 */
export interface SchoolMeal {
  /** 'YYYY-MM-DD' */
  date: string
  /** '조식' · '중식' · '석식' */
  kind: string
  dishes: string[]
}

/** 다가오는 학사일정 하나 */
export interface SchoolTodayEvent {
  date: string
  name: string
  /** 해당 학년들. 빈 목록이면 학년 구분이 없는 행사 */
  grades: number[]
  exam: boolean
  /** 오늘부터 며칠 남았는지 (오늘이면 0) */
  dDay: number
}

export interface SchoolToday {
  date: string
  school: { code: string; name: string } | null
  /** 학년 · 반을 안 보냈으면 null, 수업이 없는 날은 빈 목록 */
  timetable: SchoolPeriod[] | null
  timetablePartial: boolean
  meals: SchoolMeal[]
  events: SchoolTodayEvent[]
  /** true 면 테스트 로그인용 시연 예시입니다. (서버에서 받은 것이 아님) */
  isDemo: boolean
}

/** 이 기기에 저장해 두는 학년 · 반 */
export interface SchoolClass {
  /** 1 ~ 3 */
  grade: number
  /** 1 ~ 30 */
  classNo: number
}

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-school-class' 가 됩니다)
const CLASS_STORAGE_KEY = 'school-class'

function isWholeNumberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/** 저장해 둔 학년 · 반. 없거나 값이 이상하면 null 입니다. */
export function loadSchoolClass(): SchoolClass | null {
  const saved = loadData<unknown>(CLASS_STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const record = saved as Record<string, unknown>
  if (!isWholeNumberBetween(record.grade, 1, 3)) return null
  if (!isWholeNumberBetween(record.classNo, 1, MAX_CLASS_NO)) return null
  return { grade: record.grade, classNo: record.classNo }
}

/** 학년 · 반을 이 기기에 저장합니다. */
export function saveSchoolClass(schoolClass: SchoolClass): void {
  saveData(CLASS_STORAGE_KEY, schoolClass)
}

/** 오늘의 미션 · 미션 알림이 쓰는 하루 시간표 요약 (lib/dailyMission.ts) */
export interface SchoolDay {
  /** 'YYYY-MM-DD' */
  date: string
  /** 그날 과목 (교시 순서, 겹치지 않게) */
  subjects: string[]
  /** 마지막 교시. 시간표를 모르면 null */
  lastPeriod: number | null
}

// 저장소에 넣는 이름입니다. (실제 키는 'study-school-day')
const SCHOOL_DAY_STORAGE_KEY = 'school-day'

/**
 * 받아 온 오늘 학교 정보에서 과목 · 마지막 교시만 이 기기에 적어 둡니다.
 * 미션 알림은 화면 밖(hooks/useAppBridge.ts 의 10초 확인)에서 만들어서, 쿼리 대신 저장소에서 읽습니다.
 */
function saveSchoolDay(today: SchoolToday): void {
  const subjects: string[] = []
  for (const period of today.timetable ?? []) {
    if (!subjects.includes(period.subject)) subjects.push(period.subject)
  }
  const lastPeriod = (today.timetable ?? []).reduce<number | null>(
    (last, period) => (last === null || period.period > last ? period.period : last),
    null,
  )
  saveData(SCHOOL_DAY_STORAGE_KEY, { date: today.date, subjects, lastPeriod })
}

/** 적어 둔 하루 시간표 요약. 다른 날 것이거나 없으면 null */
export function loadSchoolDay(dateKey: string): SchoolDay | null {
  const saved = loadData<unknown>(SCHOOL_DAY_STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const record = saved as Record<string, unknown>
  if (record.date !== dateKey || !isStringArray(record.subjects)) return null
  const lastPeriod = typeof record.lastPeriod === 'number' ? record.lastPeriod : null
  return { date: dateKey, subjects: record.subjects, lastPeriod }
}

/** 반을 고르는 칸에 처음 넣어 둘 학년. 온보딩에서 고른 학년(고1~고3)이 있으면 그 값, 없으면 2학년입니다. */
export function getDefaultGrade(): number {
  return gradeNumberOf(loadOnboardingAnswers()?.grade) ?? 2
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPeriod(value: unknown): value is SchoolPeriod {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.period === 'number' && typeof record.subject === 'string'
}

function isMeal(value: unknown): value is SchoolMeal {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.date === 'string' &&
    typeof record.kind === 'string' &&
    isStringArray(record.dishes)
  )
}

function isEvent(value: unknown): value is SchoolTodayEvent {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.date === 'string' &&
    typeof record.name === 'string' &&
    Array.isArray(record.grades) &&
    record.grades.every((grade) => typeof grade === 'number') &&
    typeof record.exam === 'boolean' &&
    typeof record.dDay === 'number'
  )
}

/** 서버 응답 모양을 확인합니다. (서버 응답도 그대로 믿지 않습니다) 이상하면 ApiError(502) */
function toSchoolToday(value: unknown): SchoolToday {
  const broken = new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  if (typeof value !== 'object' || value === null) throw broken
  const record = value as Record<string, unknown>
  const school = record.school
  const schoolOk =
    school === null ||
    (typeof school === 'object' &&
      typeof (school as Record<string, unknown>).code === 'string' &&
      typeof (school as Record<string, unknown>).name === 'string')
  const timetableOk =
    record.timetable === null ||
    (Array.isArray(record.timetable) && record.timetable.every(isPeriod))
  if (
    typeof record.date !== 'string' ||
    !schoolOk ||
    !timetableOk ||
    typeof record.timetablePartial !== 'boolean' ||
    !Array.isArray(record.meals) ||
    !record.meals.every(isMeal) ||
    !Array.isArray(record.events) ||
    !record.events.every(isEvent)
  ) {
    throw broken
  }
  return {
    date: record.date,
    school: school as SchoolToday['school'],
    timetable: record.timetable as SchoolPeriod[] | null,
    timetablePartial: record.timetablePartial,
    meals: record.meals,
    events: record.events,
    isDemo: false,
  }
}

async function fetchSchoolToday(schoolClass: SchoolClass | null): Promise<SchoolToday> {
  const query = schoolClass ? `?grade=${schoolClass.grade}&classNo=${schoolClass.classNo}` : ''
  const result = await api<unknown>(`/school/today${query}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toSchoolToday(result)
}

/**
 * 테스트 로그인으로 시연할 때 보여 줄 예시입니다. 서버 없이도 홈 · 코치 브리핑이 굴러가게 합니다.
 * 날짜는 오늘을 기준으로 만들어서, 언제 시연해도 "오늘 · 내일 · D-12" 가 맞게 나옵니다.
 */
export function buildDemoSchoolToday(todayKey: string): SchoolToday {
  return {
    date: todayKey,
    school: { code: 'demo', name: '시연고등학교' },
    timetable: [
      { period: 1, subject: '미적분Ⅰ' },
      { period: 2, subject: '문학' },
      { period: 3, subject: '영어Ⅰ' },
      { period: 4, subject: '물리학Ⅰ' },
      { period: 5, subject: '체육' },
      { period: 6, subject: '정보' },
      { period: 7, subject: '창의적 체험활동' },
    ],
    timetablePartial: false,
    meals: [
      {
        date: todayKey,
        kind: '중식',
        dishes: ['흑미밥', '나주곰탕', '메추리알장조림', '배추김치'],
      },
      {
        date: moveDateKey(todayKey, 1),
        kind: '중식',
        dishes: ['보리밥', '돈가스', '양배추샐러드', '깍두기'],
      },
    ],
    events: [
      { date: moveDateKey(todayKey, 5), name: '진로 체험의 날', grades: [], exam: false, dDay: 5 },
      {
        date: moveDateKey(todayKey, 12),
        name: '2학기 2차 정기시험',
        grades: [],
        exam: true,
        dDay: 12,
      },
      {
        date: moveDateKey(todayKey, 13),
        name: '2학기 2차 정기시험',
        grades: [],
        exam: true,
        dDay: 13,
      },
    ],
    isDemo: true,
  }
}

/**
 * 오늘 학교 정보 쿼리.
 * isServerData 가 false(테스트 로그인)면 서버를 부르지 않고 시연용 예시를 돌려줍니다.
 */
export function schoolTodayQuery(
  schoolClass: SchoolClass | null,
  isServerData: boolean,
  todayKey: string,
) {
  return queryOptions({
    queryKey: [
      'school-today',
      todayKey,
      schoolClass?.grade ?? null,
      schoolClass?.classNo ?? null,
      isServerData,
    ],
    queryFn: async () => {
      const today = isServerData
        ? await fetchSchoolToday(schoolClass)
        : buildDemoSchoolToday(todayKey)
      // 오늘의 미션(복습 과목 · 하교 알림 시각)이 쓰도록 과목과 마지막 교시를 적어 둡니다.
      saveSchoolDay(today)
      return today
    },
    // 서버가 6시간마다 새로 받아서, 화면에서는 30분 동안 다시 받지 않습니다.
    staleTime: 30 * 60 * 1000,
  })
}

/**
 * 코치 브리핑용 오늘 학교 정보 쿼리. 못 받으면 에러 대신 null 을 줍니다.
 * 학교 정보가 없어도 코치와의 대화는 열려야 해서, 실패를 화면 전체의 에러로 만들지 않습니다.
 */
export function schoolTodayOrNullQuery(
  schoolClass: SchoolClass | null,
  isServerData: boolean,
  todayKey: string,
) {
  const base = schoolTodayQuery(schoolClass, isServerData, todayKey)
  return queryOptions({
    queryKey: ['school-today-or-null', ...base.queryKey.slice(1)],
    queryFn: async (): Promise<SchoolToday | null> => {
      try {
        const today = isServerData
          ? await fetchSchoolToday(schoolClass)
          : buildDemoSchoolToday(todayKey)
        saveSchoolDay(today)
        return today
      } catch {
        return null
      }
    },
    staleTime: 30 * 60 * 1000,
  })
}
