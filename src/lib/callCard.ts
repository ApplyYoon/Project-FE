/**
 * AI 통화를 시작할 때 서버에 같이 보내는 "학생 카드" 를 만듭니다. React 없이 돌아가는 계산입니다.
 *
 * 통화는 쌓인 기록을 보고 질문과 말투가 달라져야 합니다. 그런데 기록이 아직 이 브라우저에만 있어서,
 * 여기서 숫자로 정리해 한 장으로 보냅니다. 서버는 이 카드로 AI 의 지침(대본)을 만듭니다.
 * (서버의 약속: BE 저장소의 docs/API.md "AI 통화", BE 이슈 #27 · #28)
 *
 * ⚠️ 카드에는 숫자와 정해진 분류값만 담습니다. 계획 내용·일기·이름·약속 문장 같은 "내가 쓴 글" 은 넣지 않습니다.
 *    글은 AI 회사(OpenAI)로 그대로 넘어가기 때문입니다. 새 값을 더할 때도 이 원칙을 지켜 주세요.
 */
import { getTodayKey, moveDateKey } from '@/lib/date'
import { getDaySummary } from '@/lib/daySummary'
import { getFacts } from '@/lib/facts'
import { loadList, loadRecord } from '@/lib/storage'
import { getStudyStreak } from '@/lib/streak'
import { MIN_COMPLETION_SAMPLES, getMondayKey } from '@/lib/weeklyFacts'
import type { CheckIn, MissReason, StudyPlan, StudySession } from '@/types'

/** 서버에 보내는 학생 카드. 모르는 값은 null 입니다. (0 과 "모름" 은 다릅니다) */
export interface CallCard {
  /** 어제의 순공시간 (분) */
  yesterdayStudyMinutes: number | null
  /** 어제 계획의 목표 시간 합계 (분). 계획이 없었으면 0 */
  yesterdayPlanMinutes: number | null
  /** 어제 계획을 못 채운 이유로 오늘 체크인에서 고른 것. 안 골랐으면 null */
  yesterdayMissReason: MissReason | null
  /** 오늘 계획의 개수 */
  todayPlanCount: number | null
  /** 오늘 계획의 목표 시간 합계 (분) */
  todayPlanMinutes: number | null
  /** 오늘 첫 계획의 시작 시각 'HH:MM'. 시각을 정한 계획이 없으면 null */
  todayFirstStart: string | null
  /** 이번 주 계획 대비 실제 (%) */
  weekPlanRate: number | null
  /** 이번 주 완주율 (%). 목표가 있는 타이머가 5번 미만이면 숫자가 크게 흔들려서 보내지 않습니다(null) */
  weekCompletionRate: number | null
  /** 이번 주 평균 시작 지연 (분) */
  weekStartDelayMinutes: number | null
  /** 최근 7일의 기분 (1 ~ 5). 오래된 날부터 */
  recentMoods: number[]
  /** 연속으로 공부한 날 수 */
  streakDays: number | null
}

// 서버가 받는 범위입니다. 저장된 값이 깨져서 범위를 벗어나면 통화 자체가 400 으로 막히기 때문에, 보내기 전에 맞춥니다.
const MAX_MINUTES_PER_DAY = 1440
const MAX_START_DELAY_MINUTES = 600
const MAX_PLAN_COUNT = 50
const MAX_STREAK_DAYS = 3650
const MOOD_DAYS = 7

/** 숫자를 정수로 만들고 min ~ max 안으로 맞춥니다. 숫자가 아니면 null 입니다. */
function clampOrNull(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 'HH:MM' 모양(00:00 ~ 23:59)인지 확인합니다. */
function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/**
 * 계획·공부 기록·체크인으로 학생 카드를 만듭니다. 기록이 하나도 없으면 null 입니다. (처음 온 사람)
 *
 * ■ 예시 — 오늘이 2026-10-07(수)
 *   어제(10/06) 계획 240분, 순공 190분 · 오늘 체크인에서 못 채운 이유로 '폰·SNS' 를 고름
 *   오늘 계획 3개(합쳐서 180분, 가장 이른 시작 19:00) · 최근 기분 3, 2, 4 · 4일 연속 공부
 *   -> { yesterdayStudyMinutes: 190, yesterdayPlanMinutes: 240, yesterdayMissReason: 'phone',
 *        todayPlanCount: 3, todayPlanMinutes: 180, todayFirstStart: '19:00',
 *        weekPlanRate: (이번 주 월 ~ 오늘 계산), weekCompletionRate: (타이머 5번 미만이면 null), weekStartDelayMinutes: …,
 *        recentMoods: [3, 2, 4], streakDays: 4 }
 *
 * ■ 규칙
 *  - "오늘·어제" 는 하루의 기준(새벽 4시, lib/date.ts)을 따릅니다. todayKey 로 받습니다.
 *  - 노는 계획·노는 기록은 세지 않습니다. (getDaySummary · getFacts 와 같은 규칙)
 *  - 이번 주 숫자는 월요일부터 오늘까지로 계산합니다. (주간 리포트와 같은 규칙)
 */
export function buildCallCard(
  plans: StudyPlan[],
  sessions: StudySession[],
  checkIns: Record<string, CheckIn>,
  todayKey: string = getTodayKey(),
  now: Date = new Date(),
): CallCard | null {
  const checkInDates = Object.keys(checkIns)
  if (plans.length === 0 && sessions.length === 0 && checkInDates.length === 0) return null

  const yesterdayKey = moveDateKey(todayKey, -1)
  const yesterday = getDaySummary(yesterdayKey, plans, sessions)
  const yesterdayPlans = plans.filter((plan) => plan.date === yesterdayKey && plan.kind !== 'play')
  const todayPlans = plans.filter((plan) => plan.date === todayKey && plan.kind !== 'play')

  // 오늘 계획 중 시작 시각을 정한 것만 골라 가장 이른 시각을 찾습니다. 'HH:MM' 은 글자 순서가 곧 시간 순서입니다.
  const startTimes = todayPlans
    .map((plan) => plan.startTime)
    .filter(isClockTime)
    .sort()

  const week = getFacts(plans, sessions, getMondayKey(now), todayKey)

  // 최근 7일 안에 체크인한 날의 기분을 오래된 날부터 모읍니다.
  const oldestMoodDate = moveDateKey(todayKey, -(MOOD_DAYS - 1))
  const recentMoods = checkInDates
    .filter((date) => date >= oldestMoodDate && date <= todayKey)
    .sort()
    .map((date) => checkIns[date].mood)
    .filter((mood) => Number.isInteger(mood) && mood >= 1 && mood <= 5)

  const sumMinutes = (items: StudyPlan[]) =>
    items.reduce(
      (sum, plan) => sum + (Number.isFinite(plan.targetMinutes) ? plan.targetMinutes : 0),
      0,
    )

  return {
    yesterdayStudyMinutes: clampOrNull(yesterday.studyMinutes, 0, MAX_MINUTES_PER_DAY),
    yesterdayPlanMinutes: clampOrNull(sumMinutes(yesterdayPlans), 0, MAX_MINUTES_PER_DAY),
    yesterdayMissReason: checkIns[todayKey]?.missReason ?? null,
    todayPlanCount: clampOrNull(todayPlans.length, 0, MAX_PLAN_COUNT),
    todayPlanMinutes: clampOrNull(sumMinutes(todayPlans), 0, MAX_MINUTES_PER_DAY),
    todayFirstStart: startTimes[0] ?? null,
    weekPlanRate: clampOrNull(week.planRate.value, 0, 100),
    weekCompletionRate:
      week.completionRate.sampleCount >= MIN_COMPLETION_SAMPLES
        ? clampOrNull(week.completionRate.value, 0, 100)
        : null,
    weekStartDelayMinutes: clampOrNull(week.startDelayMinutes.value, 0, MAX_START_DELAY_MINUTES),
    recentMoods,
    streakDays: clampOrNull(getStudyStreak(sessions, now), 0, MAX_STREAK_DAYS),
  }
}

/** 이 브라우저에 저장된 기록으로 학생 카드를 만듭니다. 통화 화면이 통화를 시작할 때 부릅니다. */
export function loadCallCard(): CallCard | null {
  try {
    return buildCallCard(
      loadList<StudyPlan>('plans'),
      loadList<StudySession>('sessions'),
      loadRecord<CheckIn>('checkins'),
    )
  } catch {
    // 저장된 값이 깨져 있어도 통화는 걸려야 합니다. 카드 없이(처음 온 사람처럼) 겁니다.
    return null
  }
}
