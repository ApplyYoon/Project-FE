/**
 * 인사이트 카드의 "근거 보기" (#84) 에 쓰는 순수 함수들입니다.
 * 결론이 나온 날짜마다 그날의 순공시간과 컨디션을 보여줘서, 근거가 눈에 보이게 합니다.
 *
 * 읽기만 하는 함수들이라, 저장하는 일은 하지 않습니다.
 */
import { getDaySummary } from '@/lib/daySummary'
import { loadData } from '@/lib/storage'
import type { CheckIn, StudySession } from '@/types'

/** 근거 한 줄. 날짜마다 그날의 순공시간과 컨디션을 보여줍니다. */
export interface EvidenceRow {
  /** 날짜 ('YYYY-MM-DD') */
  date: string
  /** 그날 순공시간 (분). 공부 기록이 없으면 0 */
  studyMinutes: number
  /** 그날 체크인에 적은 컨디션 (1~5). 체크인을 안 했으면 null */
  condition: number | null
}

/**
 * 근거 날짜들로 한 줄씩 만듭니다. 최근 날짜가 맨 위에 오고, 같은 날짜가 여러 번 있어도 한 줄입니다.
 *
 *   buildEvidenceRows(['2026-10-03', '2026-10-05'], sessions, checkIns)
 *   -> [{ date: '2026-10-05', ... }, { date: '2026-10-03', ... }]
 */
export function buildEvidenceRows(
  dates: string[],
  sessions: StudySession[],
  checkIns: Record<string, CheckIn>,
): EvidenceRow[] {
  const uniqueDates = [...new Set(dates)].sort((a, b) => b.localeCompare(a))

  return uniqueDates.map((date) => ({
    date,
    // 계획은 순공시간 계산에 필요 없어서 빈 배열을 넘깁니다.
    studyMinutes: getDaySummary(date, [], sessions).studyMinutes,
    condition: checkIns[date]?.condition ?? null,
  }))
}

/**
 * 저장해 둔 체크인을 날짜별로 불러옵니다. (저장 이름은 lib/quickCheckIn.ts 의 'checkins' 와 같습니다)
 * 저장된 값이 깨져 있거나 객체가 아니면 빈 객체로 처리합니다.
 */
export function loadCheckInsByDate(): Record<string, CheckIn> {
  const saved = loadData<unknown>('checkins', {})
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {}
  return saved as Record<string, CheckIn>
}

/** 'YYYY-MM-DD' 를 '10/5 (일)' 처럼 짧게 보여줍니다. */
export function formatShortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).toLocaleDateString('ko-KR', { weekday: 'short' })
  return `${month}/${day} (${weekday})`
}
