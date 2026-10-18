/**
 * 하루 한 번 하는 "1탭 체크인" 의 규칙입니다. (#242 → #387 → 2026-10-18)
 *
 * 코치 채팅이 "오늘 컨디션은 어때?" 를 칩으로 묻고(pages/CoachPage.tsx, lib/coachBriefing.ts 의 CONDITION_CHIPS),
 * 누른 칩으로 오늘의 체크인을 만듭니다. 예전처럼 화면 맨 위의 한 줄로 묻지 않습니다. (오늘의 미션, lib/dailyMission.ts)
 * (예상 시간·약속까지 적던 자세한 체크인(/check)은 최종 기획서에서 빠져서 #417 에서 지웠습니다)
 */
import { toDayKey } from '@/lib/date'
import { loadData, saveData } from '@/lib/storage'
import type { CheckIn, EmotionTag } from '@/types'

// 저장소에 넣는 이름입니다. insightEvidence · diarySafety · callSummary 도 이 이름('study-checkins')으로 읽습니다.
const CHECKINS_KEY = 'checkins'

/** 기분 버튼 5개. 이모지 + 한국어 설명으로 보여줍니다. (1 이 가장 처짐, 5 가 가장 좋음) */
export const MOOD_OPTIONS = [
  { value: 1, emoji: '😞', label: '많이 처짐' },
  { value: 2, emoji: '🙁', label: '처짐' },
  { value: 3, emoji: '😐', label: '보통' },
  { value: 4, emoji: '🙂', label: '좋음' },
  { value: 5, emoji: '😄', label: '아주 좋음' },
]

/** 감정 태그 6개. (이름은 BE#220 과 같습니다) */
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
 * 그 날짜에 체크인을 했는지 알려줍니다. 1탭 체크인이든 통화 · 예전 체크인이든 하나라도 있으면 true 입니다.
 *
 *   hasCheckIn('2026-10-10') -> true  (오늘 이미 했음)
 */
export function hasCheckIn(dateKey: string): boolean {
  const checkIn = loadByDate(CHECKINS_KEY)[dateKey]
  return typeof checkIn === 'object' && checkIn !== null
}

/**
 * 컨디션과 감정 태그로 체크인을 만듭니다.
 * 기분(mood)은 따로 묻지 않아서 컨디션과 같은 값으로 채웁니다. 안전 브레이크·통화 카드·관리 강도가 아직 mood 를 읽기 때문입니다.
 * (옛 1탭 체크인은 기분을 물어 condition 에 같은 값을 넣었으니, 옛 기록도 condition 으로 그대로 읽힙니다)
 *
 *   makeQuickCheckIn('2026-10-10', 4, ['CALM'])
 *   -> { date: '2026-10-10', condition: 4, mood: 4, emotions: ['CALM'], isQuick: true }
 */
export function makeQuickCheckIn(
  dateKey: string,
  condition: number,
  emotions: EmotionTag[] = [],
): CheckIn {
  return { date: dateKey, condition, mood: condition, emotions, isQuick: true }
}

/**
 * 체크인 하나를 이 기기의 저장소에 바로 씁니다. 같은 날이 있으면 덮어씁니다.
 * 코치의 컨디션 칩 · 서버에서 받아 오기 · 서버로 다시 보내기(useCheckInSync)에서 씁니다.
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
 * 고른 컨디션·감정 태그로 오늘의 체크인을 만들어 저장하고, 만든 체크인을 돌려줍니다. (코치의 컨디션 칩에서 부릅니다)
 * 같은 날 다시 부르면 덮어씁니다.
 * 돌려받은 체크인은 서버로도 보냅니다. (pages/CoachPage.tsx)
 * 날짜는 새벽 4시 기준입니다. (새벽 1시에 누르면 전날의 체크인으로 저장됩니다)
 */
export function saveQuickCheckIn(
  condition: number,
  emotions: EmotionTag[] = [],
  today: Date = new Date(),
): CheckIn {
  const dateKey = toDayKey(today)
  const checkIn = makeQuickCheckIn(dateKey, condition, emotions)
  saveLocalCheckIn(checkIn)
  return checkIn
}
