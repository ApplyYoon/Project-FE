/**
 * 고등학교 검색입니다. 교육부 NEIS(교육정보 개방 포털)의 "학교기본정보" 를 부릅니다. (가입 화면에서 씁니다)
 *
 * 우리 서버(api.ts)가 아니라 NEIS 를 브라우저에서 직접 부릅니다.
 * 인증키 없이 부르면 한 번에 5곳까지만 알려 주는데, 학교 이름을 조금만 더 적으면 5곳 안에 들어와서 지금은 충분합니다.
 * 인증키를 FE 에 넣으면 누구나 볼 수 있어서 넣지 않습니다. 더 많이 보여주려면 서버를 거쳐야 합니다.
 */

/** 검색으로 찾은 학교 한 곳 */
export interface School {
  /** NEIS 가 정한 학교 번호 (예: '7530560'). 이름이 같은 학교를 구분할 때 씁니다. */
  code: string
  /** 학교 이름 (예: '한국디지털미디어고등학교') */
  name: string
  /** 시·도 (예: '경기도') */
  region: string
  /** 도로명 주소 (예: '경기도 안산시 단원구 사세충열로 94'). 이름이 비슷한 학교를 눈으로 구분하라고 보여줍니다. */
  address: string
}

/** 검색 결과 */
export interface SchoolSearchResult {
  /** 찾은 학교들 (최대 5곳) */
  schools: School[]
  /** 조건에 맞는 학교가 모두 몇 곳인지. schools 의 개수보다 크면 "더 있다" 는 뜻입니다. */
  totalCount: number
}

export const SCHOOL_QUERY_MIN_LENGTH = 2

const SCHOOL_API_URL = 'https://open.neis.go.kr/hub/schoolInfo'
// 인증키 없이 받을 수 있는 최대 개수입니다. 더 큰 수를 적어도 5곳만 옵니다.
const MAX_RESULTS = 5
/** 응답을 기다리는 최대 시간(밀리초). NEIS 가 멈춰도 "찾는 중" 이 영원히 끝나지 않으면 안 되기 때문입니다. */
const REQUEST_TIMEOUT_MS = 8000

/**
 * 검색어를 NEIS 에 보낼 모양으로 다듬습니다. 띄어쓰기를 모두 뺍니다.
 * (NEIS 의 학교 이름에는 띄어쓰기가 없어서, '한국 디지털' 로 찾으면 하나도 안 나옵니다)
 *
 *   normalizeSchoolQuery(' 한국 디지털 ') -> '한국디지털'
 */
export function normalizeSchoolQuery(query: string): string {
  return query.replace(/\s+/g, '')
}

/**
 * 검색어가 규칙에 맞는지 확인합니다. 맞으면 null, 틀리면 화면에 보여줄 안내 문구입니다.
 *
 *   getSchoolQueryError('')       -> '학교 이름을 2자 이상 적어 주세요.'
 *   getSchoolQueryError('고')     -> '학교 이름을 2자 이상 적어 주세요.'
 *   getSchoolQueryError('디지털') -> null
 */
export function getSchoolQueryError(query: string): string | null {
  if (normalizeSchoolQuery(query).length < SCHOOL_QUERY_MIN_LENGTH) {
    return `학교 이름을 ${SCHOOL_QUERY_MIN_LENGTH}자 이상 적어 주세요.`
  }
  return null
}

/** 값이 글자면 앞뒤 공백을 뺀 글자를, 아니면 빈 글자를 돌려줍니다. (NEIS 는 빈 칸을 null 로 줍니다) */
function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * NEIS 가 준 응답에서 필요한 것(이름·지역·주소·번호)만 꺼냅니다.
 * 응답 모양이 약속과 다르면 null 입니다. (남이 준 값은 그대로 믿지 않고 확인합니다)
 *
 * NEIS 의 응답은 두 가지 모양입니다.
 *   찾았을 때   { schoolInfo: [ { head: [ { list_total_count: 6 }, ... ] }, { row: [ { SCHUL_NM: '...', ... } ] } ] }
 *   없을 때     { RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }
 *
 *   parseSchoolResponse(찾았을 때)  -> { schools: [...], totalCount: 6 }
 *   parseSchoolResponse(없을 때)    -> { schools: [], totalCount: 0 }
 *   parseSchoolResponse(에러·엉뚱한 값) -> null
 */
export function parseSchoolResponse(body: unknown): SchoolSearchResult | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>

  // 결과가 없으면 schoolInfo 없이 RESULT 만 옵니다. 'INFO-200' 이 "해당하는 데이터가 없다" 는 뜻입니다.
  const result = record.RESULT as Record<string, unknown> | undefined
  if (typeof result === 'object' && result !== null) {
    return result.CODE === 'INFO-200' ? { schools: [], totalCount: 0 } : null
  }

  // 찾았으면 schoolInfo 는 [머리말, 학교 목록] 두 칸짜리 배열입니다.
  if (!Array.isArray(record.schoolInfo)) return null
  const [headPart, rowPart] = record.schoolInfo as Record<string, unknown>[]
  const rows = rowPart?.row
  if (!Array.isArray(rows)) return null

  const schools: School[] = []
  for (const row of rows as Record<string, unknown>[]) {
    const code = toText(row?.SD_SCHUL_CODE)
    const name = toText(row?.SCHUL_NM)
    // 번호나 이름이 없는 줄은 고를 수 없으니 뺍니다.
    if (code === '' || name === '') continue
    schools.push({
      code,
      name,
      region: toText(row.LCTN_SC_NM),
      address: toText(row.ORG_RDNMA),
    })
  }

  // 전체 개수는 머리말의 첫 칸에 있습니다. 못 읽으면 받은 개수로 봅니다.
  const head = headPart?.head
  const firstHead = Array.isArray(head)
    ? (head[0] as Record<string, unknown> | undefined)
    : undefined
  const totalCount =
    typeof firstHead?.list_total_count === 'number' ? firstHead.list_total_count : schools.length

  return { schools, totalCount }
}

/**
 * 이름에 검색어가 들어간 고등학교를 찾습니다. 실패하면 에러를 던집니다. (인터넷 끊김, NEIS 오류 등)
 *
 *   const { schools, totalCount } = await searchHighSchools('디지털')
 *   -> schools: 5곳, totalCount: 6
 */
export async function searchHighSchools(query: string): Promise<SchoolSearchResult> {
  // URLSearchParams: 한글·특수문자를 주소에 넣을 수 있는 모양으로 바꿔 줍니다.
  const params = new URLSearchParams({
    Type: 'json',
    pIndex: '1',
    pSize: String(MAX_RESULTS),
    SCHUL_KND_SC_NM: '고등학교',
    SCHUL_NM: normalizeSchoolQuery(query),
  })

  const response = await fetch(`${SCHOOL_API_URL}?${params.toString()}`, {
    // 정해 둔 시간이 지나면 요청을 끊고 에러로 처리합니다.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`학교 검색에 실패했습니다 (${response.status})`)

  const result = parseSchoolResponse(await response.json())
  if (result === null) throw new Error('학교 검색 응답 모양이 올바르지 않습니다')
  return result
}
