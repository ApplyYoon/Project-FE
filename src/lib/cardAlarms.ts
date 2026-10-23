import type { Alarm } from '@/lib/appBridge'
import { getCardsOnDate, loadSavedCards, migratePlansToCards } from '@/lib/cards'
import {
  LONG_PAUSE_MINUTES,
  getEndAtWithPauses,
  loadActiveCardSession,
  type ActiveCardSession,
} from '@/lib/cardSession'
import { loadAllSessions } from '@/lib/dailyRecords'
import { moveDateKey, toDayKey } from '@/lib/date'
import { getPlannedStartAt } from '@/lib/facts'
import { getMessageSettings } from '@/lib/messageSettings'
import { toQuietHours } from '@/lib/notifications'
import { loadRoutines } from '@/lib/routines'
import { isWithinQuietHours, type QuietHours } from '@/lib/safetyBrake'
import { loadData, loadRecord } from '@/lib/storage'
import type { Card, StudyPlan } from '@/types'

/**
 * 카드로 휴대폰 앱의 예약 알림(Alarm) 목록을 만듭니다. (#349, 최종 기획서 「4.4 타이머」)
 * 앱에 보내는 곳은 hooks/useAppBridge.ts 입니다. 앱을 닫아 둬도 이 시각에 휴대폰 알림이 옵니다.
 */

/** 오늘부터 며칠 치를 예약할지 */
export const ALARM_DAYS = 7
/** 앱이 한 번에 예약하는 최대 개수 (BRIDGE.md 의 alarms.set) */
export const MAX_ALARMS = 48

const MINUTE_MS = 60 * 1000

/**
 * 카드 알림을 누르면 갈 주소
 * - 시작: 카드 타이머는 ?card=id 를 받으면 그 카드로 바로 시작합니다. (CardTimerPage)
 * - 미루기 · 실패로 기록: 타이머 대기 화면에 [미루기] · [실패로 기록] 이 있어서 그 화면으로 보냅니다. (#400)
 *   (옛 주소 /timer?plan= · /planner 는 #417 에서 지웠습니다)
 */
export function getCardAlarmUrls(cardId: string) {
  return { start: `/timer?card=${encodeURIComponent(cardId)}`, postpone: '/timer', fail: '/timer' }
}

/** 카드 하루치의 이름. 예) toCardDayKey('c1', '2026-10-17') -> 'c1 2026-10-17' */
export function toCardDayKey(cardId: string, dateKey: string): string {
  return `${cardId} ${dateKey}`
}

export interface CardAlarmsInput {
  cards: Card[]
  /** 이미 시작한(또는 지금 하는 중인) 카드 하루치 (toCardDayKey 모양). 그날은 알림을 보내지 않습니다. */
  startedCardDays: Set<string>
  /** 연락 금지 시간. 이 시간에 울릴 알림은 뺍니다. */
  quietHours: QuietHours
  /** 지금 (Date.now() 값) */
  now: number
}

/**
 * 카드 → 예약 알림 목록. React 도 저장소도 쓰지 않는 순수 함수라서, now 만 바꿔 넣어 확인할 수 있습니다.
 *
 * ■ 카드 하루치마다 알림 2개
 *  1. 시작: 시작 시각 (카드 알림을 "몇 분 전" 으로 정했으면 그만큼 앞). 카드에 쓴 문장 그대로 [시작]
 *  2. 끝:   카드가 끝나는 시각. 유연 카드 [미루기][실패로 기록], 절대 카드 [실패로 기록]
 *  (예전의 "시작 3분 뒤 늦음" 알림은 뺐습니다. 2026-10-18 #578 — 알림이 너무 많아서. 코치 알림은 lib/coachNudges.ts)
 * ■ 빼는 것: 시작 시각이 없는 카드, 이미 시작한 카드 하루치, 이미 지난 시각, 연락 금지 시간
 * ■ 날짜는 새벽 4시 기준입니다. '10-17' 카드의 '01:00' 은 달력으로 10-18 새벽 1시입니다. (lib/facts.ts 의 getPlannedStartAt)
 * ■ 가까운 순서로 정렬해서 48개까지만 돌려줍니다.
 *
 * 예) 지금 10-17 17:00, 연락 금지 23:00~07:00,
 *     카드 c1 = { title: '수학', date: '2026-10-17', startTime: '18:00', durationMinutes: 50, priority: 'flexible' }
 *   buildCardAlarms({ cards: [c1], startedCardDays: new Set(), quietHours, now })
 *     -> [ { id: 'card-c1-2026-10-17-start', at: 18:00, body: '지금 시작할 시간이에요', category: 'card-start' },
 *          { id: 'card-c1-2026-10-17-end',   at: 18:50, category: 'card-missed', actionUrls: { postpone, fail } } ]
 *   startedCardDays 에 'c1 2026-10-17' 이 있으면 -> []  (이미 시작함)
 */
export function buildCardAlarms({
  cards,
  startedCardDays,
  quietHours,
  now,
}: CardAlarmsInput): Alarm[] {
  const alarms: Alarm[] = []
  const todayKey = toDayKey(now)

  for (let day = 0; day < ALARM_DAYS; day++) {
    const dateKey = moveDateKey(todayKey, day)
    for (const card of getCardsOnDate(cards, dateKey)) {
      if (startedCardDays.has(toCardDayKey(card.id, dateKey))) continue
      const startAt = getPlannedStartAt({ date: dateKey, startTime: card.startTime })
      if (startAt === null) continue
      alarms.push(...makeCardDayAlarms(card, dateKey, startAt))
    }
  }

  return alarms
    .filter((alarm) => alarm.at > now)
    .filter((alarm) => !isWithinQuietHours(new Date(alarm.at), quietHours))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_ALARMS)
}

/** 카드 하루치의 알림 2개 (buildCardAlarms 의 설명) */
function makeCardDayAlarms(card: Card, dateKey: string, startAt: number): Alarm[] {
  const urls = getCardAlarmUrls(card.id)
  const idPrefix = `card-${card.id}-${dateKey}`
  const minutesBefore = card.alert?.minutesBefore ?? 0
  const isAbsolute = card.priority === 'absolute'
  const defaultStartText =
    minutesBefore > 0 ? `${minutesBefore}분 뒤에 시작해요` : '지금 시작할 시간이에요'

  return [
    {
      id: `${idPrefix}-start`,
      at: startAt - minutesBefore * MINUTE_MS,
      title: card.title,
      body: card.alert?.text?.trim() || defaultStartText,
      url: urls.start,
      category: 'card-start',
      actionUrls: { start: urls.start },
    },
    {
      id: `${idPrefix}-end`,
      at: startAt + card.durationMinutes * MINUTE_MS,
      title: card.title,
      body: isAbsolute
        ? '카드 시간이 끝났어요. 못 했다면 실패로 기록해 주세요.'
        : '카드 시간이 끝났어요. 미룰지, 실패로 기록할지 골라 주세요.',
      url: urls.fail,
      // 절대 카드는 미룰 수 없어서 [실패로 기록] 만 둡니다.
      category: isAbsolute ? 'card-missed-absolute' : 'card-missed',
      actionUrls: isAbsolute ? { fail: urls.fail } : { postpone: urls.postpone, fail: urls.fail },
    },
  ]
}

/** 진행 중 세션 알림을 누르면 갈 주소 (타이머 세션 화면) */
const SESSION_URL = '/timer'

/**
 * 진행 중인 공부 세션의 예약 알림입니다. (2026-10-18, Project-App 세션 제안)
 * 공부 끝 · 15분 일시정지 알림은 원래 웹 화면이 돌아야 울려서, 앱이 뒤에 있으면(아이폰은 몇 초 만에 웹이 멈춤)
 * 폰을 잠그고 공부할 때 아무것도 오지 않았습니다. 앱에 미리 예약해 두면 웹이 멈춰도 휴대폰이 띄웁니다.
 *
 *   - 공부 끝: 세션이 끝나는 시각(시작 + 카드 길이 + 멈춘 시간, getEndAtWithPauses)
 *     멈춰 있는 동안은 언제 끝날지 몰라서 넣지 않습니다. [다시 시작] 하면 늦춰진 시각으로 다시 예약됩니다.
 *   - 15분 멈춤: 일시정지 중이고 아직 복귀 알림을 안 보냈으면 멈춘 지 15분 뒤
 *   - 학생이 스스로 시작한 공부라 연락 금지 시간에도 빼지 않고 보냅니다. 이미 지난 시각은 뺍니다.
 *
 *   buildSessionAlarms(null, '수학', now) -> []
 *   buildSessionAlarms({ startedAt: 19:00, endAt: 19:30, … }, '수학', 19:05)
 *     -> [ { id: 'session-…-end', at: 19:30, title: '공부 끝! 🎉', body: '수학 30분을 마쳤어요. 들어와서 마무리해요.' } ]
 *   19:10 에 멈춘 채로 19:12 -> [ { id: 'session-…-pause', at: 19:25, … } ]   (공부 끝 알림은 다시 시작할 때)
 */
export function buildSessionAlarms(
  active: ActiveCardSession | null,
  cardTitle: string | undefined,
  now: number,
): Alarm[] {
  if (active === null) return []
  const title = cardTitle?.trim() || '공부'
  const idPrefix = `session-${active.startedAt}`
  const alarms: Alarm[] = []
  const paused = active.pausedNow
  if (!paused) {
    alarms.push({
      id: `${idPrefix}-end`,
      at: getEndAtWithPauses(active, now),
      title: '공부 끝! 🎉',
      body: `${title} ${active.plannedMinutes}분을 마쳤어요. 들어와서 마무리해요.`,
      url: SESSION_URL,
    })
  } else if (!paused.alerted) {
    alarms.push({
      id: `${idPrefix}-pause`,
      at: paused.startedAt + LONG_PAUSE_MINUTES * MINUTE_MS,
      title: `${LONG_PAUSE_MINUTES}분째 멈춰 있어요`,
      body: '다시 시작할까요? 남은 시간은 멈춘 그대로예요.',
      url: SESSION_URL,
    })
  }
  return alarms.filter((alarm) => alarm.at > now)
}

/** 저장소의 진행 중 세션으로 세션 알림을 만듭니다. 문제가 생기면 빈 목록입니다. (hooks/useAppBridge.ts 가 부릅니다) */
export function loadSessionAlarms(now: number): Alarm[] {
  try {
    const active = loadActiveCardSession()
    if (active === null) return []
    const card = (loadSavedCards() ?? []).find((item) => item.id === active.cardId)
    return buildSessionAlarms(active, card?.title, now)
  } catch {
    return []
  }
}

/**
 * 저장소에서 카드 · 기록 · 연락 금지 시간을 읽어 지금의 예약 알림 목록을 만듭니다. (hooks/useAppBridge.ts 가 부릅니다)
 * 저장된 값이 깨져 있어도 앱이 멈추지 않게, 문제가 생기면 빈 목록을 돌려줍니다.
 */
export function loadCardAlarms(now: number): Alarm[] {
  try {
    const plansByDate = loadRecord<StudyPlan[]>('plans')
    const plans = Object.values(plansByDate).flat()
    // 아직 카드를 저장한 적이 없으면 옛 계획·루틴을 카드 모양으로 바꿔서 씁니다. (저장은 hooks/useCards.ts 가 맡습니다)
    const cards = loadSavedCards() ?? migratePlansToCards(plansByDate, loadRoutines(), now)
    return buildCardAlarms({
      cards,
      startedCardDays: loadStartedCardDays(plans),
      quietHours: toQuietHours(getMessageSettings()),
      now,
    })
  } catch {
    return []
  }
}

/**
 * 이미 시작한 카드 하루치를 모읍니다. 그날은 시작 · 끝 알림을 보내지 않습니다.
 * - 끝낸 기록: 카드 id(cardId)로, 옛 기록은 계획 id(planId)로 찾습니다. 루틴이 만든 계획이면 루틴 id 가 카드 id 입니다.
 * - 지금 재는 중: 카드 타이머(#395)가 저장해 둔 진행 중 세션('card-session')의 카드 id · 날짜.
 *   (예전에는 옛 타이머 키만 봐서, 카드로 공부하는 중에도 "지금 시작해요" · "카드 시간이 끝났어요" 가 울렸습니다)
 * - 옛 타이머 키('timer-plan' · 'timer')도 남아 있을 수 있어서 같이 봅니다.
 */
function loadStartedCardDays(plans: StudyPlan[]): Set<string> {
  function toCardId(planId: string): string {
    return plans.find((plan) => plan.id === planId)?.routineId ?? planId
  }

  const started = new Set<string>()
  for (const session of loadAllSessions()) {
    const cardId = session.cardId ?? (session.planId ? toCardId(session.planId) : undefined)
    if (cardId) started.add(toCardDayKey(cardId, toDayKey(session.startedAt)))
  }

  const runningPlanId = loadData<unknown>('timer-plan', null)
  const stopwatch = loadData<unknown>('timer', null)
  const runningSince =
    typeof stopwatch === 'object' && stopwatch !== null
      ? (stopwatch as Record<string, unknown>).startedAt
      : null
  if (typeof runningPlanId === 'string' && typeof runningSince === 'number') {
    started.add(toCardDayKey(toCardId(runningPlanId), toDayKey(runningSince)))
  }

  const active = loadActiveCardSession()
  if (active !== null) started.add(toCardDayKey(active.cardId, active.dateKey))
  return started
}
