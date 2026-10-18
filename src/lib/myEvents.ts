/**
 * 내 일정 — 대회 · 자격증 시험처럼 학교 학사일정에 없는 내 날짜 (2026-10-18)
 * 사용자: "채팅으로 자연스레 '나 이거 준비하고 있어' 하면 달력에도 일정이 뜨게"
 *
 * 코치가 준비하는 것(대회 · 기타)의 이름을 들은 뒤 날짜를 물어서 여기에 저장합니다. (pages/CoachPage.tsx)
 * 오늘 탭의 "다가오는 일정" 에 학교 일정과 같이 D-day 로 보이고, 코치가 오늘 계획을 짤 때 재료로 씁니다.
 * 읽을 때는 loadMyEvents(전부) · getUpcomingMyEvents(며칠 안, D-day 포함) · nearestMyEvent(가장 가까운 것)를 씁니다.
 * 이 기기에만 저장합니다. '모든 기록 지우기' 에 들어 있습니다. (lib/myData.ts)
 */
import { loadData, saveData } from '@/lib/storage'

/** 내 일정 하나 */
export interface MyEvent {
  /** 'YYYY-MM-DD' */
  date: string
  /** 예: '정보올림피아드' */
  name: string
  /** focus = 준비하는 것(lib/studyFocus.ts)에서 온 일정 */
  kind: 'focus'
}

// 저장소에 넣는 이름입니다. (실제 키는 'study-my-events')
const STORAGE_KEY = 'my-events'
// 너무 많이 쌓이지 않게 이만큼만 남깁니다. (가까운 날짜부터)
const MAX_EVENTS = 20

function isMyEvent(value: unknown): value is MyEvent {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    typeof record.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    record.kind === 'focus'
  )
}

/** 저장해 둔 내 일정 (날짜 순서). 깨진 값은 뺍니다. */
export function loadMyEvents(): MyEvent[] {
  const saved = loadData<unknown>(STORAGE_KEY, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(isMyEvent).sort((a, b) => a.date.localeCompare(b.date))
}

/** 내 일정을 저장합니다. 같은 이름의 일정이 있으면 날짜를 바꿉니다. */
export function saveMyEvent(event: MyEvent): void {
  const others = loadMyEvents().filter((item) => item.name !== event.name)
  const next = [...others, event].sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_EVENTS)
  saveData(STORAGE_KEY, next)
}

/** 'YYYY-MM-DD' 두 날짜 사이의 날 수 (to - from) */
function daysFrom(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * 오늘부터 withinDays 일 안의 내 일정과 남은 날(dDay). 지난 일정은 뺍니다.
 *
 *   getUpcomingMyEvents('2026-10-18', 60) -> [{ name: '정보올림피아드', date: '2026-10-30', kind: 'focus', dDay: 12 }]
 */
export function getUpcomingMyEvents(
  todayKey: string,
  withinDays: number,
): (MyEvent & { dDay: number })[] {
  return loadMyEvents()
    .map((event) => ({ ...event, dDay: daysFrom(todayKey, event.date) }))
    .filter((event) => event.dDay >= 0 && event.dDay <= withinDays)
}

/** 가장 가까운 내 일정 (60일 안). 없으면 null */
export function nearestMyEvent(todayKey: string): { name: string; dDay: number } | null {
  const [nearest] = getUpcomingMyEvents(todayKey, 60)
  return nearest ? { name: nearest.name, dDay: nearest.dDay } : null
}
