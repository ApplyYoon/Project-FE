/**
 * 지난 통화 기록 — 언제 통화했고 그때 어떤 조건부 모듈을 넣었는지. (#414)
 * 학생 카드(callCard.ts)를 "어제" 가 아니라 "지난 통화 이후" 로 모으는 데 씁니다.
 * 통화가 끝나 결과를 받으면(CallResultPage) 적습니다.
 */
import type { CallModule } from '@/lib/callModules'
import { toDayKey } from '@/lib/date'
import { loadData, saveData } from '@/lib/storage'

// 저장 이름. (실제 키는 'study-call-log')
const CALL_LOG_KEY = 'call-log'

/** 통화 한 번의 기록 */
export interface CallLogEntry {
  /** 통화가 끝난 시각 (Date.now() 숫자) */
  endedAt: number
  /** 그 통화의 날짜 ('YYYY-MM-DD', 새벽 4시 기준) */
  dateKey: string
  /** 그 통화에 넣은 조건부 모듈. 없었으면 null */
  module: CallModule | null
  /** 서버가 정리한 통화 요약 2~3문장 (AI 가 쓴 글, #415 상담 탭의 요약 카드). 없으면 없음 */
  summary?: string | null
}

/** 남겨 두는 통화 기록 수 (최근 것만) */
const MAX_LOG = 60

/** 통화 기록 (오래된 것부터). 없거나 깨졌으면 빈 목록 */
export function loadCallLog(): CallLogEntry[] {
  const saved = loadData<unknown>(CALL_LOG_KEY, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(
    (entry): entry is CallLogEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as CallLogEntry).endedAt === 'number' &&
      typeof (entry as CallLogEntry).dateKey === 'string',
  )
}

/** 지난 통화가 끝난 시각. 통화한 적이 없으면 null */
export function loadLastCallAt(): number | null {
  const log = loadCallLog()
  return log.length === 0 ? null : log[log.length - 1].endedAt
}

/** 통화가 끝났다고 적습니다. 넣은 모듈도 같이 남겨서, 주 1~2회 모듈의 횟수를 셉니다. 요약은 상담 탭에 보여 줍니다. */
export function recordFinishedCall(
  module: CallModule | null,
  now: number,
  summary: string | null = null,
): void {
  const entry: CallLogEntry = { endedAt: now, dateKey: toDayKey(now), module, summary }
  saveData(CALL_LOG_KEY, [...loadCallLog(), entry].slice(-MAX_LOG))
}

/** 요약이 있는 가장 최근 통화. 없으면 undefined (상담 탭의 "지난 통화 요약", #415) */
export function loadLastCallSummary(): { dateKey: string; summary: string } | undefined {
  const entry = [...loadCallLog()]
    .reverse()
    .find((item) => typeof item.summary === 'string' && item.summary !== '')
  return entry ? { dateKey: entry.dateKey, summary: entry.summary as string } : undefined
}
