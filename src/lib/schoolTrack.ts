/**
 * 내 학과(특성화고 · 마이스터고) 또는 계열(그 밖의 고등학교)입니다. (2026-10-19)
 * 사용자: "특성화고면 내가 무슨 과인지, 일반고면 무슨 상황인지 알아야 뉴스나 공지나 학교생활을 더 도와줄 거 아냐"
 *
 * 가입 화면에서 학교를 고르면 바로 아래에서 묻고(components/ui/SchoolTrackField.tsx), 설정의 계정 묶음에서 고칠 수 있습니다.
 * 이 기기에만 저장합니다. (반 · 내가 준비하는 것과 같음) 학교를 바꾸면 예전 학교의 값은 읽지 않습니다.
 *
 * 학교 종류와 학과 목록은 서버(BE PR #345)에서 받습니다. NEIS 인증키를 FE 에 넣으면 누구나 볼 수 있어서 서버를 거칩니다.
 *
 *   GET /schools/{학교 번호}/majors   (로그인 없이 부름 — 가입 중에는 아직 계정이 없어서)
 *     -> 200 { schoolCode, schoolType, asksMajor, majors: ['웹프로그래밍과', …], complete }
 *   - asksMajor 가 true 면(특성화고 · 마이스터고) 학과를, false 면 계열을 묻습니다.
 *   - complete 가 false 면 서버에 NEIS 키가 없어서 목록이 잘렸을 수 있습니다. 그래서 [목록에 없어요] 로 직접 쓰게 합니다.
 */
import { api } from '@/lib/api'
import { loadData, removeData, saveData } from '@/lib/storage'
import { queryOptions } from '@tanstack/react-query'

/** 학과를 묻지 않는 학교(일반고 · 특목고 · 자율고)에서 고르는 계열 */
export const GENERAL_TRACKS = ['인문·사회', '자연·공학', '예체능', '아직 몰라'] as const
export type GeneralTrack = (typeof GENERAL_TRACKS)[number]

/** 직접 쓰는 학과 이름의 최대 글자 수 */
export const MAJOR_NAME_MAX = 30

/** 이 기기에 저장하는 내 학과 또는 계열 */
export interface SchoolTrack {
  /** 어느 학교에서 고른 값인지. 학교를 바꾸면 예전 값은 읽지 않으려고 같이 둡니다. */
  schoolCode: string
  /** 'major' = 학과(특성화고 · 마이스터고), 'track' = 계열(그 밖의 학교) */
  kind: 'major' | 'track'
  /** 학과 이름(예: '웹프로그래밍과') 또는 계열 이름(예: '자연·공학') */
  name: string
}

/** 서버가 알려 주는 학교 종류와 학과 목록 */
export interface SchoolMajors {
  schoolCode: string
  /** '일반고' · '특성화고' · '특목고' · '자율고'. 모르면 빈 글자 */
  schoolType: string
  /** 학과를 물어볼 학교인지 (특성화고 · 마이스터고) */
  asksMajor: boolean
  majors: string[]
  /** false 면 목록이 잘렸을 수 있습니다 */
  complete: boolean
}

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-school-track')
const STORAGE_KEY = 'school-track'

/** 서버 응답을 기다리는 최대 시간(밀리초). 처음 묻는 학교는 서버가 NEIS 를 여러 번 불러서 조금 넉넉히 기다립니다. */
const REQUEST_TIMEOUT_MS = 15000

/** 직접 쓴 학과 이름을 다듬습니다. 비었으면 null, 길면 30자까지 */
export function cleanMajorName(text: string): string | null {
  const trimmed = text.trim().slice(0, MAJOR_NAME_MAX)
  return trimmed === '' ? null : trimmed
}

/**
 * 화면에 보여 줄 한 줄입니다.
 *
 *   describeSchoolTrack({ kind: 'major', name: '웹프로그래밍과', … })  -> '웹프로그래밍과'
 *   describeSchoolTrack({ kind: 'track', name: '자연·공학', … })       -> '자연·공학 계열'
 *   describeSchoolTrack({ kind: 'track', name: '아직 몰라', … })       -> '계열은 아직 몰라'
 */
export function describeSchoolTrack(track: SchoolTrack): string {
  if (track.kind === 'major') return track.name
  return track.name === '아직 몰라' ? '계열은 아직 몰라' : `${track.name} 계열`
}

/**
 * 저장해 둔 학과 · 계열입니다. 없거나, 값이 이상하거나, 다른 학교에서 고른 값이면 null 입니다.
 *
 *   loadSchoolTrack('7530560') -> { schoolCode: '7530560', kind: 'major', name: '웹프로그래밍과' }
 *   loadSchoolTrack('7530075') -> null   (학교를 바꿨으면 예전 학교의 값은 읽지 않음)
 */
export function loadSchoolTrack(schoolCode: string | null): SchoolTrack | null {
  if (schoolCode === null) return null
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const record = saved as Record<string, unknown>
  if (record.schoolCode !== schoolCode) return null
  if (record.kind === 'track') {
    // 계열은 정해 둔 4개 중 하나여야 합니다.
    const track = GENERAL_TRACKS.find((item) => item === record.name)
    return track ? { schoolCode, kind: 'track', name: track } : null
  }
  if (record.kind === 'major' && typeof record.name === 'string') {
    const name = cleanMajorName(record.name)
    return name ? { schoolCode, kind: 'major', name } : null
  }
  return null
}

/** 학과 · 계열을 저장합니다. null 이면 지웁니다. (고른 것을 다시 눌러 취소했을 때) */
export function saveSchoolTrack(track: SchoolTrack | null): void {
  if (track === null) {
    removeData(STORAGE_KEY)
    return
  }
  saveData(STORAGE_KEY, track)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** 서버 응답이 약속한 모양인지 확인합니다. 모양이 다르면 에러를 던져 화면이 "다시 시도" 를 보여 줍니다. */
function toSchoolMajors(value: unknown): SchoolMajors {
  if (typeof value !== 'object' || value === null) throw new Error('학과 목록 응답 모양이 달라요')
  const record = value as Record<string, unknown>
  if (
    typeof record.schoolCode !== 'string' ||
    typeof record.schoolType !== 'string' ||
    typeof record.asksMajor !== 'boolean' ||
    !isStringArray(record.majors) ||
    typeof record.complete !== 'boolean'
  ) {
    throw new Error('학과 목록 응답 모양이 달라요')
  }
  return {
    schoolCode: record.schoolCode,
    schoolType: record.schoolType,
    asksMajor: record.asksMajor,
    majors: record.majors,
    complete: record.complete,
  }
}

/**
 * 학교 종류와 학과 목록의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(schoolMajorsQuery(학교 번호)) 로 씁니다.
 * 학과는 거의 안 바뀌어서 한 번 받으면 하루 동안 다시 받지 않습니다. (서버도 학교마다 24시간 받아 둡니다)
 */
export function schoolMajorsQuery(schoolCode: string) {
  return queryOptions({
    queryKey: ['school-majors', schoolCode],
    queryFn: async () => {
      const result = await api<unknown>(`/schools/${encodeURIComponent(schoolCode)}/majors`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      return toSchoolMajors(result)
    },
    staleTime: 24 * 60 * 60 * 1000,
  })
}
