import { getChecklistRate, PATTERN_MIN_SAMPLES } from '@/lib/cardResult'
import { moveDateKey, toDayKey } from '@/lib/date'
import type { Card, CardAlert, CardPriority, CardType, ChecklistItem, StudySession } from '@/types'

/**
 * 카드 만들기 · 고치기 폼(최종 기획서 「4.3 카드」, #392)에서 쓰는 순수 함수들입니다.
 * 화면은 pages/CardEditPage.tsx 입니다.
 */

/** 폼이 들고 있는 값. 저장할 때 buildCard 로 카드 모양으로 바꿉니다. */
export interface CardFormValues {
  title: string
  /** 1회성이면 그 날짜, 반복이면 반복을 시작할 날짜 */
  date: string
  /** true 면 요일마다 반복, false 면 1회성 */
  repeat: boolean
  repeatDays: number[]
  /** 시작 시각 'HH:MM' (필수) */
  startTime: string
  durationMinutes: number
  /** 체크리스트. 빈 줄은 저장할 때 뺍니다 */
  checklist: ChecklistItem[]
  /** 연결한 목표의 id. 빈 글자('')면 "목표 없음" */
  goalId: string
  priority: CardPriority
  type: CardType
  /** 예상 달성 개수. null 이면 "체크리스트 전부" */
  expectedDone: number | null
  /** 예상 달성 개수를 낮춘 이유 (EXPECTED_DONE_REASONS 중 하나) */
  expectedDoneReason: string
  /** 예상 실패 원인 (쉼표로 여러 개) */
  failCauses: string
  alertMethod: CardAlert['method']
  alertMinutesBefore: number
  alertText: string
}

/** 폼에서 틀린 칸과 안내 문구 */
export type CardFormErrors = Partial<
  Record<'title' | 'startTime' | 'repeatDays' | 'expectedDoneReason' | 'failCauses', string>
>

export const CARD_TITLE_MAX_LENGTH = 40
export const CHECKLIST_ITEM_MAX_LENGTH = 60
export const ALERT_TEXT_MAX_LENGTH = 60

/** 예상 달성 개수를 낮췄을 때 고르는 이유 태그 (1개) */
export const EXPECTED_DONE_REASONS = [
  '처음 해 보는 거라',
  '어려운 부분이라',
  '시간이 빠듯해서',
  '컨디션이 안 좋아서',
  '기타',
]

/** 알림을 몇 분 전에 할지 고르는 버튼 */
export const ALERT_MINUTES_OPTIONS = [0, 5, 10, 30]

/** 계획 정확도는 최근 며칠 기록으로 보는지 (4주) */
export const PLAN_ACCURACY_DAYS = 28

/** 'HH:MM' 모양인지 (00:00 ~ 23:59) */
function isTimeText(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** 새 카드 폼의 처음 값. 체크리스트는 빈 줄 하나로 시작합니다 */
export function createEmptyForm(dateKey: string, now: number, goalId = ''): CardFormValues {
  return {
    title: '',
    date: dateKey,
    repeat: false,
    repeatDays: [],
    startTime: '',
    durationMinutes: 60,
    checklist: [{ id: `item-${now}-0`, text: '' }],
    goalId,
    priority: 'flexible',
    type: 'self',
    expectedDone: null,
    expectedDoneReason: '',
    failCauses: '',
    alertMethod: 'message',
    alertMinutesBefore: 0,
    alertText: '',
  }
}

/** 이미 있는 카드를 고칠 때 폼의 처음 값 */
export function cardToForm(card: Card): CardFormValues {
  const repeatDays = card.repeatDays ?? []
  return {
    title: card.title,
    date: card.date,
    repeat: repeatDays.length > 0,
    repeatDays,
    startTime: card.startTime ?? '',
    durationMinutes: card.durationMinutes,
    checklist: card.checklist,
    goalId: card.goalId ?? '',
    priority: card.priority,
    type: card.type,
    // 예상이 "전부" 와 같으면 전부(null)로 보여 줍니다.
    expectedDone:
      card.expectedDone === undefined || card.expectedDone >= card.checklist.length
        ? null
        : card.expectedDone,
    expectedDoneReason: card.expectedDoneReason ?? '',
    failCauses: (card.expectedFailCauses ?? []).join(', '),
    alertMethod: card.alert?.method ?? 'message',
    alertMinutesBefore: card.alert?.minutesBefore ?? 0,
    alertText: card.alert?.text ?? '',
  }
}

/** 글자가 있는 체크리스트 항목만 (앞뒤 공백 정리) */
export function getFilledChecklist(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist
    .map((item) => ({ ...item, text: item.text.trim() }))
    .filter((item) => item.text !== '')
}

/** '수학, 영어 ,' → ['수학', '영어'] */
export function splitFailCauses(text: string): string[] {
  return text
    .split(',')
    .map((cause) => cause.trim())
    .filter((cause) => cause !== '')
}

/**
 * 저장 전에 틀린 칸을 찾습니다. 빈 객체면 저장해도 됩니다.
 * 필수는 제목 · 시작 시각(+ 반복이면 요일)뿐입니다. 체크리스트는 비어 있으면 제목으로 채웁니다.
 *
 *   제목 ''                                  -> { title: '무엇을 할지 적어 주세요' }
 *   반복인데 요일 없음                        -> { repeatDays: '반복할 요일을 하나 이상 골라 주세요' }
 *   체크리스트 3개, 예상 2개, 이유 없음        -> { expectedDoneReason: '왜 낮췄는지 하나 골라 주세요' }
 *   failCauseRequired 인데 실패 원인 비어 있음 -> { failCauses: '…' }
 */
export function validateCardForm(
  values: CardFormValues,
  options: { failCauseRequired: boolean },
): CardFormErrors {
  const errors: CardFormErrors = {}
  if (values.title.trim() === '') errors.title = '무엇을 할지 적어 주세요'
  if (!isTimeText(values.startTime)) errors.startTime = '시작 시각을 정해 주세요'
  if (values.repeat && values.repeatDays.length === 0) {
    errors.repeatDays = '반복할 요일을 하나 이상 골라 주세요'
  }
  const filledCount = getFilledChecklist(values.checklist).length
  const lowered = values.expectedDone !== null && values.expectedDone < filledCount
  if (lowered && values.expectedDoneReason === '') {
    errors.expectedDoneReason = '왜 낮췄는지 하나 골라 주세요'
  }
  if (options.failCauseRequired && splitFailCauses(values.failCauses).length === 0) {
    errors.failCauses = '내 행동에서 나올 수 있는 원인을 하나 이상 적어 주세요'
  }
  return errors
}

/**
 * 폼 값을 카드로 바꿉니다. (validateCardForm 을 통과한 값만 넣습니다)
 *
 * - 체크리스트가 비면 제목 1개로 채웁니다. (AI 기본값 #413 이 생기면 그걸로 바꿉니다)
 * - 예상 달성 개수는 그대로 둬도 "전부" 라는 예측으로 저장합니다. (「4.3」)
 * - 1회성이면 repeatDays 를 undefined 로 둡니다. (고칠 때 반복 → 1회성으로 바꾼 것이 지워지도록)
 *
 *   buildCard({ title: '수학', checklist: [], … }, { id: 'c1', createdAt: 1, planningMs: 5000 })
 *     -> { id: 'c1', title: '수학', checklist: [{ id: 'c1-item-0', text: '수학' }], expectedDone: 1, planningMs: 5000, … }
 */
export function buildCard(
  values: CardFormValues,
  base: { id: string; createdAt: number; planningMs: number },
): Card {
  const title = values.title.trim()
  const filled = getFilledChecklist(values.checklist)
  const checklist = filled.length > 0 ? filled : [{ id: `${base.id}-item-0`, text: title }]
  const expectedDone =
    values.expectedDone === null
      ? checklist.length
      : Math.min(values.expectedDone, checklist.length)
  const failCauses = splitFailCauses(values.failCauses)
  const alertText = values.alertText.trim()

  return {
    id: base.id,
    title,
    date: values.date,
    repeatDays: values.repeat ? [...values.repeatDays].sort((a, b) => a - b) : undefined,
    startTime: values.startTime,
    durationMinutes: values.durationMinutes,
    checklist,
    goalId: values.goalId !== '' ? values.goalId : undefined,
    priority: values.priority,
    type: values.type,
    expectedDone,
    // 낮추지 않았으면 이유는 남기지 않습니다.
    expectedDoneReason: expectedDone < checklist.length ? values.expectedDoneReason : undefined,
    expectedFailCauses: failCauses.length > 0 ? failCauses : undefined,
    alert: {
      method: values.alertMethod,
      minutesBefore: values.alertMinutesBefore,
      ...(alertText !== '' ? { text: alertText } : {}),
    },
    planningMs: base.planningMs,
    createdAt: base.createdAt,
  }
}

/** 종료 팝업을 거친 카드 하루치 하나 (계획 정확도 · 계획 패턴에 씁니다) */
export interface ReportedCardDay {
  card: Card
  dateKey: string
  sessions: StudySession[]
}

/**
 * 최근 4주(오늘 포함 28일) 동안 종료 팝업(endReport)을 거친 카드 하루치를 모읍니다.
 * 체크한 기록이 없는 옛 세션까지 세면 0% 로 보이기 때문에, endReport 가 있는 세션만 봅니다.
 * 한 카드를 같은 날 두 번 켰으면 한 하루치로 묶습니다.
 *
 *   카드 A 를 10/15 에 두 번, 10/16 에 한 번 켜고 끝냄 -> [ A·10/15 (세션 2개), A·10/16 (세션 1개) ]
 */
export function getRecentReportedCardDays(
  cards: Card[],
  sessions: StudySession[],
  todayKey: string,
): ReportedCardDay[] {
  const fromKey = moveDateKey(todayKey, -(PLAN_ACCURACY_DAYS - 1))
  const cardById = new Map(cards.map((card) => [card.id, card]))

  // 카드 id + 날짜 → 그날 그 카드의 세션들
  const groups = new Map<string, ReportedCardDay>()
  for (const session of sessions) {
    if (!session.cardId || !session.endReport) continue
    const card = cardById.get(session.cardId)
    if (!card) continue
    const dateKey = toDayKey(session.startedAt)
    if (dateKey < fromKey || dateKey > todayKey) continue
    const groupKey = `${session.cardId}|${dateKey}`
    const group = groups.get(groupKey) ?? { card, dateKey, sessions: [] }
    group.sessions.push(session)
    groups.set(groupKey, group)
  }
  return [...groups.values()]
}

/**
 * 최근 4주 계획 정확도 — 카드 하루치마다 체크리스트를 몇 % 했는지의 평균입니다. (더닝-크루거 대응, 「4.3」)
 * 종료 팝업(endReport)을 거친 세션만 셉니다. (getRecentReportedCardDays)
 * 카드 하루치가 5개보다 적으면 null 입니다. (그 전에는 숫자로 말하지 않습니다, 「2 수집 원칙」)
 *
 *   카드 하루치 5개, 체크리스트 달성률 [1, 0.5, 0.5, 1, 0.1] -> { rate: 0.62, samples: 5 }
 *   카드 하루치 2개                                          -> null
 */
export function getRecentPlanAccuracy(
  cards: Card[],
  sessions: StudySession[],
  todayKey: string,
): { rate: number; samples: number } | null {
  const rates = getRecentReportedCardDays(cards, sessions, todayKey).map((day) =>
    getChecklistRate(day),
  )
  if (rates.length < PATTERN_MIN_SAMPLES) return null
  const rate = rates.reduce((sum, value) => sum + value, 0) / rates.length
  return { rate, samples: rates.length }
}
