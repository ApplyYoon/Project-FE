/**
 * 내 학교 홈페이지의 최근 가정통신문 · 공지사항을 서버(BE)에서 받아오는 곳입니다. (BE PR #340, 2026-10-18 "NEIS + 직접 크롤링")
 * NEIS 공개 API 에는 공지사항이 없어서, 서버가 하루 한 번 학교 홈페이지 목록에서 제목 · 날짜 · 주소만 읽어 둡니다.
 * 홈(/)의 "학교 공지" 칸이 씁니다.
 *
 *   GET /school/notices
 *     -> 200 { school: { code, name } | null, fetchedAt: number | null,
 *              notices: [{ title, date, kind, url }] }
 *   - school 이 null 이면 가입 때 학교를 안 고른 것입니다. (notices 는 빈 목록)
 *   - fetchedAt 이 null 이면 홈페이지를 못 읽은 것입니다. (홈페이지 모양이 달라 못 읽는 학교도 null)
 *   - notices 는 최근 30일 글, 날짜가 최근인 순서입니다.
 *   - 테스트 로그인이면 서버를 부르지 않고 시연용 예시(buildDemoSchoolNotices)를 씁니다.
 */
import { api } from '@/lib/api'
import { moveDateKey } from '@/lib/date'
import { queryOptions } from '@tanstack/react-query'

/** 서버 응답을 기다리는 최대 시간(밀리초). 받아 둔 것이 없으면 서버가 그 자리에서 홈페이지를 읽어서 넉넉히 기다립니다. */
const REQUEST_TIMEOUT_MS = 20000

/** 공지 한 줄 */
export interface SchoolNotice {
  title: string
  /** 'YYYY-MM-DD' */
  date: string
  /** '가정통신문' · '공지사항' */
  kind: string
  /** 학교 홈페이지에서 글을 여는 주소. 만들 수 없으면 null */
  url: string | null
}

export interface SchoolNotices {
  school: { code: string; name: string } | null
  /** 홈페이지에서 마지막으로 잘 받은 시각(밀리초). 못 받았으면 null */
  fetchedAt: number | null
  notices: SchoolNotice[]
  /** true 면 테스트 로그인용 시연 예시입니다. (서버에서 받은 것이 아님) */
  isDemo: boolean
}

/** 대회 글로 볼 낱말입니다. 제목에 하나라도 있으면 대회 글로 봅니다. (체육대회 같은 학교 행사도 잡힙니다) */
const CONTEST_WORDS = ['대회', '공모전', '경진', '경시', '올림피아드', '콘테스트', '해커톤']

/** 띄어쓰기를 빼고 영어는 소문자로 바꿉니다. ('정보 올림피아드' 와 '정보올림피아드' 를 같게 보려고) */
function normalize(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

/**
 * 대회 · 공모전 글인지 제목으로 봅니다.
 *
 *   isContestNotice('2026 교내 수학 경시대회 참가 신청')  -> true
 *   isContestNotice('2학기 2차 지필평가 시험 범위 안내')  -> false
 */
export function isContestNotice(title: string): boolean {
  const text = normalize(title)
  return CONTEST_WORDS.some((word) => text.includes(word))
}

/**
 * 제목에 "내가 준비하는 것" 이름(예: '정보올림피아드')이 들어 있는지 봅니다. (lib/studyFocus.ts)
 *
 *   matchesFocusName('제44회 한국정보올림피아드 안내', '정보 올림피아드')  -> true
 *   matchesFocusName('급식 식단 변경 안내', null)                          -> false
 */
export function matchesFocusName(title: string, focusName: string | null): boolean {
  if (focusName === null) return false
  const name = normalize(focusName)
  // 한 글자 이름은 아무 제목에나 걸려서 두 글자부터 봅니다.
  return name.length >= 2 && normalize(title).includes(name)
}

// 학교 홈페이지에서 읽어 온 주소라서, http · https 로 시작하는 주소만 링크로 씁니다.
// (javascript: 같은 주소가 섞여 들어와도 누르는 순간 코드가 실행되지 않게)
function toSafeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.startsWith('https://') || value.startsWith('http://') ? value : null
}

/** 'YYYY-MM-DD' 모양인지 (화면에서 '10월 15일' 로 바꿔 보여 주려면 이 모양이어야 합니다) */
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function toNotice(value: unknown): SchoolNotice | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.title !== 'string' ||
    typeof record.date !== 'string' ||
    !DATE_KEY_PATTERN.test(record.date) ||
    typeof record.kind !== 'string'
  ) {
    return null
  }
  return { title: record.title, date: record.date, kind: record.kind, url: toSafeUrl(record.url) }
}

/** 서버 응답이 약속한 모양인지 확인합니다. 모양이 다르면 에러를 던져 화면이 "다시 시도" 를 보여 줍니다. */
function toSchoolNotices(value: unknown): SchoolNotices {
  const broken = new Error('학교 공지 응답 모양이 달라요')
  if (typeof value !== 'object' || value === null) throw broken
  const record = value as Record<string, unknown>
  const school = record.school
  const schoolOk =
    school === null ||
    (typeof school === 'object' &&
      school !== null &&
      typeof (school as Record<string, unknown>).code === 'string' &&
      typeof (school as Record<string, unknown>).name === 'string')
  const fetchedAtOk = record.fetchedAt === null || typeof record.fetchedAt === 'number'
  if (!schoolOk || !fetchedAtOk || !Array.isArray(record.notices)) throw broken

  // 한 줄이 이상하면 그 줄만 빼고 나머지는 보여 줍니다.
  const notices: SchoolNotice[] = []
  for (const item of record.notices) {
    const notice = toNotice(item)
    if (notice !== null) notices.push(notice)
  }
  return {
    school: school as SchoolNotices['school'],
    fetchedAt: record.fetchedAt as number | null,
    notices,
    isDemo: false,
  }
}

async function fetchSchoolNotices(): Promise<SchoolNotices> {
  const result = await api<unknown>('/school/notices', {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return toSchoolNotices(result)
}

/**
 * 테스트 로그인으로 시연할 때 보여 줄 예시입니다. (홈의 시간표 · 급식 예시와 같은 '시연고등학교')
 * 날짜는 오늘을 기준으로 만들어서 언제 시연해도 최근 글로 보입니다. 진짜 글이 아니라서 주소는 넣지 않습니다.
 */
export function buildDemoSchoolNotices(todayKey: string): SchoolNotices {
  return {
    school: { code: 'demo', name: '시연고등학교' },
    fetchedAt: null,
    notices: [
      {
        title: '2학기 2차 지필평가 시험 범위 안내',
        date: moveDateKey(todayKey, -1),
        kind: '가정통신문',
        url: null,
      },
      {
        title: '2026 교내 정보올림피아드 참가 신청 안내',
        date: moveDateKey(todayKey, -2),
        kind: '공지사항',
        url: null,
      },
      {
        title: '급식 식단 변경 안내',
        date: moveDateKey(todayKey, -3),
        kind: '공지사항',
        url: null,
      },
      {
        title: '과학탐구 공모전 작품 모집',
        date: moveDateKey(todayKey, -6),
        kind: '가정통신문',
        url: null,
      },
      {
        title: '학부모 상담주간 운영 안내',
        date: moveDateKey(todayKey, -9),
        kind: '가정통신문',
        url: null,
      },
      {
        title: '겨울방학 방과후학교 수강 신청',
        date: moveDateKey(todayKey, -12),
        kind: '가정통신문',
        url: null,
      },
    ],
    isDemo: true,
  }
}

/**
 * 학교 공지 쿼리 설정입니다. 화면에서는 useSuspenseQuery(schoolNoticesQuery(...)) 로 씁니다.
 * 테스트 로그인(isServerData 가 false)이면 서버 대신 시연 예시를 돌려줍니다.
 */
export function schoolNoticesQuery(isServerData: boolean, todayKey: string) {
  return queryOptions({
    queryKey: ['school-notices', todayKey, isServerData],
    queryFn: () => (isServerData ? fetchSchoolNotices() : buildDemoSchoolNotices(todayKey)),
    // 서버가 하루 한 번 받아 두므로, 화면에서는 1시간 동안 다시 받지 않습니다.
    staleTime: 60 * 60 * 1000,
  })
}
