import { toDayKey } from '@/lib/date'
import { loadData } from '@/lib/storage'
import type { AwayRecord } from '@/types'

/** 딴짓(자리 비움) 안내에 쓰는, React 와 상관없는 작은 함수들입니다. */

/** 밀리초를 '12분', '45초', '1시간 5분' 처럼 읽기 쉬운 글자로 바꿉니다. */
export function formatAwayDuration(ms: number): string {
  // 0초라고 쓰면 어색해서 최소 1초로 보여줍니다.
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}초`

  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** 시각(밀리초)을 '14:02' 처럼 시:분으로 바꿉니다. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    // h23: 0~23시로 보여줍니다. (hour12: false 는 브라우저에 따라 자정을 '24:05' 로 보여줘서 쓰지 않습니다)
    hourCycle: 'h23',
  })
}

/** 시각(밀리초)이 몇 월 며칠에 속하는지 'YYYY-MM-DD' 로 바꿉니다. 새벽 4시 전은 전날입니다. (lib/date.ts 의 toDayKey) */
export function toDateString(ms: number): string {
  return toDayKey(ms)
}

// 딴짓 기록 목록을 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-away-records' 가 됩니다)
export const AWAY_RECORDS_KEY = 'away-records'

/** 저장소에서 꺼낸 값이 우리가 저장한 딴짓 기록 모양이 맞는지 확인합니다. (깨진 값이 섞여도 앱이 멈추지 않게) */
function isAwayRecord(value: unknown): value is AwayRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    (record.subjectId === null || typeof record.subjectId === 'string') &&
    typeof record.leftAt === 'number' &&
    typeof record.returnedAt === 'number' &&
    typeof record.awayMs === 'number'
  )
}

/**
 * 저장해 둔 딴짓 기록(공부 중에 나갔다 온 기록)을 불러옵니다. 없으면 빈 목록입니다. 모양이 틀린 기록은 걸러냅니다.
 * 기록을 쌓던 옛 타이머(useAwayDetection)는 #417 에서 지웠습니다. 지금은 남아 있는 옛 기록만 읽습니다.
 */
export function loadAwayRecords(): AwayRecord[] {
  const saved = loadData<unknown>(AWAY_RECORDS_KEY, [])
  return Array.isArray(saved) ? saved.filter(isAwayRecord) : []
}
