/**
 * 하루 한 번 하는 "1탭 체크인" 의 규칙입니다. (#242 → #387)
 *
 * 그날 처음 연 화면이 어디든 맨 위에 한 줄로 컨디션 1 ~ 5 와 감정 태그를 묻고(components/layout/DailyTagBar.tsx),
 * 그 답으로 오늘의 체크인을 만듭니다. 건너뛸 수 있고, 건너뛰면 그날은 다시 묻지 않습니다.
 * 예상 시간·약속까지 적는 자세한 체크인은 /check 화면(pages/CheckPage.tsx)에 그대로 있습니다.
 */
import { toDayKey } from '@/lib/date'
import { loadInitialPlan } from '@/lib/initialPlan'
import { loadData, saveData } from '@/lib/storage'
import type { CheckIn, EmotionTag, StudyPlan } from '@/types'

// 저장소에 넣는 이름입니다. hooks/useCheckIns.ts · hooks/usePlans.ts 와 같은 값이어야 합니다.
const CHECKINS_KEY = 'checkins'
const PLANS_KEY = 'plans'

/** 기분 버튼 5개. 이모지 + 한국어 설명으로 보여줍니다. (1 이 가장 처짐, 5 가 가장 좋음) 하루 첫 한 줄의 컨디션 버튼에도 씁니다. */
export const MOOD_OPTIONS = [
  { value: 1, emoji: '😞', label: '많이 처짐' },
  { value: 2, emoji: '🙁', label: '처짐' },
  { value: 3, emoji: '😐', label: '보통' },
  { value: 4, emoji: '🙂', label: '좋음' },
  { value: 5, emoji: '😄', label: '아주 좋음' },
]

/** 감정 태그 6개. 하루 첫 한 줄에 이 순서로 보입니다. (이름은 BE#220 과 같습니다) */
export const EMOTION_OPTIONS: { tag: EmotionTag; label: string }[] = [
  { tag: 'STUCK', label: '막막함' },
  { tag: 'ANXIOUS', label: '불안함' },
  { tag: 'TIRED', label: '피곤함' },
  { tag: 'ANNOYED', label: '짜증남' },
  { tag: 'CALM', label: '평온함' },
  { tag: 'MOTIVATED', label: '의욕 있음' },
]

/** 감정 태그 이름이 맞는지. 서버나 저장소에서 꺼낸 값을 쓰기 전에 확인합니다. */
export function isEmotionTag(value: unknown): value is EmotionTag {
  return EMOTION_OPTIONS.some((option) => option.tag === value)
}

/** 저장소에서 꺼낸 값이 { 날짜: 값 } 모양의 객체면 그대로, 아니면 빈 객체를 돌려줍니다. (깨진 값이 섞여도 앱이 멈추지 않게) */
function loadByDate(key: string): Record<string, unknown> {
  const saved = loadData<unknown>(key, {})
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {}
  return saved as Record<string, unknown>
}

/**
 * 그 날짜에 체크인을 했는지 알려줍니다. 1탭 체크인이든 자세한 체크인이든 하나라도 있으면 true 입니다.
 *
 *   hasCheckIn('2026-10-10') -> true  (오늘 이미 했음)
 */
export function hasCheckIn(dateKey: string): boolean {
  const checkIn = loadByDate(CHECKINS_KEY)[dateKey]
  return typeof checkIn === 'object' && checkIn !== null
}

/**
 * 오늘 예상 순공시간(분)을 정합니다. 따로 묻지 않고 이미 있는 숫자를 씁니다.
 *   1) 오늘 공부 계획의 목표 시간을 모두 더한 값 (노는 계획은 뺍니다)
 *   2) 오늘 계획이 아직 없으면 fallbackMinutes (온보딩에서 정한 하루 목표)
 *
 *   getPlannedMinutes([수학 60분, 영어 30분, 놀기 20분], 120) -> 90
 *   getPlannedMinutes([], 120)                               -> 120
 */
export function getPlannedMinutes(plans: StudyPlan[], fallbackMinutes: number): number {
  let total = 0
  for (const plan of plans) {
    if (plan.kind !== 'play') total += plan.targetMinutes
  }
  return total > 0 ? total : fallbackMinutes
}

/**
 * 컨디션과 감정 태그로 체크인을 만듭니다.
 * 기분(mood)은 따로 묻지 않아서 컨디션과 같은 값으로 채웁니다. 안전 브레이크·통화 카드·관리 강도가 아직 mood 를 읽기 때문입니다.
 * (옛 1탭 체크인은 기분을 물어 condition 에 같은 값을 넣었으니, 옛 기록도 condition 으로 그대로 읽힙니다)
 *
 *   makeQuickCheckIn('2026-10-10', 4, 90, ['CALM'])
 *   -> { date: '2026-10-10', condition: 4, mood: 4, emotions: ['CALM'], expectedMinutes: 90, isQuick: true }
 */
export function makeQuickCheckIn(
  dateKey: string,
  condition: number,
  expectedMinutes: number,
  emotions: EmotionTag[] = [],
): CheckIn {
  return { date: dateKey, condition, mood: condition, emotions, expectedMinutes, isQuick: true }
}

/**
 * 그 날짜의 예상 순공시간(분). 그날 공부 계획의 목표 합, 계획이 없으면 온보딩에서 정한 하루 목표입니다. (getPlannedMinutes)
 * 서버에서 받은 체크인에 예상 시간이 비어 있을 때도 씁니다. (lib/checkInsApi.ts)
 */
export function getPlannedMinutesOf(dateKey: string): number {
  const dayPlans = loadByDate(PLANS_KEY)[dateKey]
  const plans = Array.isArray(dayPlans) ? (dayPlans as StudyPlan[]) : []
  return getPlannedMinutes(plans, loadInitialPlan()?.dailyMinutes ?? 0)
}

/**
 * 체크인 하나를 이 기기의 저장소에 바로 씁니다. 같은 날이 있으면 덮어씁니다.
 * useCheckIns 훅이 없는 곳(하루 첫 한 줄 · 서버로 다시 보내기)에서 씁니다.
 */
export function saveLocalCheckIn(checkIn: CheckIn): void {
  saveData(CHECKINS_KEY, { ...loadByDate(CHECKINS_KEY), [checkIn.date]: checkIn })
}

/** 그 날짜의 이 기기 체크인. 없거나 모양이 틀리면 undefined 입니다. */
export function loadLocalCheckIn(dateKey: string): CheckIn | undefined {
  const checkIn = loadByDate(CHECKINS_KEY)[dateKey]
  return typeof checkIn === 'object' && checkIn !== null ? (checkIn as CheckIn) : undefined
}

/**
 * 고른 컨디션·감정 태그로 오늘의 체크인을 만들어 저장하고, 만든 체크인을 돌려줍니다. (하루 첫 한 줄에서 부릅니다)
 * 컨디션을 고른 뒤 태그를 더 누르면 다시 불러서 덮어씁니다.
 * 저장소를 바로 읽고 써서, 체크인 화면(/check)을 열면 방금 저장한 값이 그대로 보입니다.
 * 돌려받은 체크인은 서버로도 보냅니다. (components/layout/DailyTagBar.tsx)
 * 날짜는 새벽 4시 기준입니다. (새벽 1시에 누르면 전날의 체크인으로 저장됩니다)
 */
export function saveQuickCheckIn(
  condition: number,
  emotions: EmotionTag[] = [],
  today: Date = new Date(),
): CheckIn {
  const dateKey = toDayKey(today)
  const checkIn = makeQuickCheckIn(dateKey, condition, getPlannedMinutesOf(dateKey), emotions)
  saveLocalCheckIn(checkIn)
  return checkIn
}

// 하루 첫 한 줄을 [건너뛰기] 한 날짜를 넣어 두는 이름입니다. 건너뛰면 체크인은 저장하지 않습니다. (그날 통화가 묻습니다)
const SKIPPED_KEY = 'daily-tag-skipped'

/** 그 날짜에 하루 첫 한 줄을 건너뛰었는지 */
export function isDailyTagSkipped(dateKey: string): boolean {
  return loadData<unknown>(SKIPPED_KEY, null) === dateKey
}

/** 그 날짜에 하루 첫 한 줄을 건너뛰었다고 적어 둡니다. (마지막 하루만 기억합니다) */
export function markDailyTagSkipped(dateKey: string): void {
  saveData(SKIPPED_KEY, dateKey)
}
