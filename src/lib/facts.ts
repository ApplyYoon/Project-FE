/**
 * 계획과 공부 기록만으로 "객관적인 숫자(팩트)" 를 계산하는 순수 함수입니다. (#244)
 * React 없이 돌아가서 `lib/` 에 둡니다. 사용자에게 따로 묻지 않고, 타이머와 계획에서 나온 값만 씁니다.
 *
 * 숫자는 코드가 계산하고, AI 는 그 숫자를 말로 풀기만 합니다.
 * 계산 규칙은 BE 와 같아야 합니다. (Project 저장소 #12 "같이 바뀌는 계산 규칙") 규칙을 바꾸면 BE 에도 알려야 합니다.
 */
import { toDateKey } from '@/lib/date'
import { getStudyMs } from '@/lib/studyTime'
import type { StudyPlan, StudySession } from '@/types'

const MS_PER_MINUTE = 60 * 1000

/*
 * 시간대를 나누는 시각(시)입니다. 타이머를 "시작한 시각" 으로 나눕니다.
 *   아침 05:00 ~ 11:59 / 낮 12:00 ~ 17:59 / 저녁 18:00 ~ 21:59 / 밤 22:00 ~ 04:59
 */
export const MORNING_START_HOUR = 5
export const AFTERNOON_START_HOUR = 12
export const EVENING_START_HOUR = 18
export const NIGHT_START_HOUR = 22

/** 시간대 — morning: 아침, afternoon: 낮, evening: 저녁, night: 밤 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

/** 숫자 하나와, 그 숫자를 몇 개의 기록으로 계산했는지(표본 수)입니다. */
export interface FactValue {
  /** 계산한 값. 계산할 수 없으면 0 이 아니라 null 입니다. ("0%" 와 "모름" 은 다릅니다) */
  value: number | null
  /** 이 값을 계산하는 데 쓴 기록(또는 계획)의 개수 */
  sampleCount: number
}

/** 어떤 기간의 팩트 숫자 묶음입니다. */
export interface Facts {
  /** 계획한 시간의 합 (분). 공부 계획만 셉니다. */
  plannedMinutes: number
  /** 실제 순공시간의 합 (분) */
  studyMinutes: number
  /** 계획 대비 실제 (%) = 실제 순공 ÷ 계획한 시간. 표본 수 = 공부 계획의 개수 */
  planRate: FactValue
  /** 목표가 있는 타이머 중 목표 시간을 채운 횟수. ("20번 중 11번" 의 11) */
  completedCount: number
  /** 완주율 (%) = 목표가 있는 타이머 중 목표를 채운 비율. 표본 수 = 목표가 있는 타이머의 개수 */
  completionRate: FactValue
  /** 평균 시작 지연 (분) = 계획한 시작 시각보다 얼마나 늦게 시작했는지. 표본 수 = 시작 시각이 있고 실제로 시작한 계획의 개수 */
  startDelayMinutes: FactValue
  /** 멈추는 지점 (%) = 중간에 그만둔 타이머가 목표의 몇 % 에서 멈췄는지의 평균. 표본 수 = 중간에 그만둔 타이머의 개수 */
  stopPoint: FactValue
  /** 요일별 완주율. 0번째 = 일요일, 1번째 = 월요일 … 6번째 = 토요일 (Date 의 getDay() 와 같은 순서) */
  completionByWeekday: FactValue[]
  /** 시간대별 완주율 */
  completionByTimeOfDay: Record<TimeOfDay, FactValue>
}

/**
 * 시(0 ~ 23)가 어느 시간대인지 알려줍니다.
 *
 *   getTimeOfDay(7)  -> 'morning'    getTimeOfDay(12) -> 'afternoon'
 *   getTimeOfDay(19) -> 'evening'    getTimeOfDay(23) -> 'night'    getTimeOfDay(2) -> 'night'
 */
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= MORNING_START_HOUR && hour < AFTERNOON_START_HOUR) return 'morning'
  if (hour >= AFTERNOON_START_HOUR && hour < EVENING_START_HOUR) return 'afternoon'
  if (hour >= EVENING_START_HOUR && hour < NIGHT_START_HOUR) return 'evening'
  return 'night'
}

/** 완주율을 세는 통입니다. total = 목표가 있는 타이머 수, completed = 그중 목표를 채운 수 */
interface CompletionCount {
  total: number
  completed: number
}

/** 통에 담긴 수로 완주율(%)을 만듭니다. 하나도 없으면 null 입니다. 소수점은 버립니다. */
function toCompletionRate(count: CompletionCount): FactValue {
  if (count.total === 0) return { value: null, sampleCount: 0 }
  return { value: Math.floor((count.completed / count.total) * 100), sampleCount: count.total }
}

/**
 * 계획의 날짜('2026-10-06')와 시작 시각('19:00')을 합쳐 시각(Date.now() 같은 숫자)으로 만듭니다.
 * 시작 시각이 없거나 모양이 틀리면 null 입니다.
 */
function getPlannedStartAt(plan: StudyPlan): number | null {
  if (plan.startTime === undefined) return null
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(plan.startTime)
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plan.date)
  if (timeMatch === null || dateMatch === null) return null

  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])]
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])]
  if (hour > 23 || minute > 59) return null
  // new Date(년, 월, 일, 시, 분) 은 내 컴퓨터의 시간대(한국 시간)로 만듭니다. (월은 0부터 시작)
  return new Date(year, month - 1, day, hour, minute).getTime()
}

/**
 * 기간(startDate ~ endDate, 두 날짜 모두 포함) 동안의 팩트 숫자를 계산합니다.
 * plans 와 sessions 는 다른 날짜가 섞여 있어도 됩니다. 이 함수가 기간에 해당하는 것만 골라서 계산합니다.
 *
 *   const facts = getFacts(plans, sessions, '2026-10-05', '2026-10-11')
 *   facts.planRate        -> { value: 64, sampleCount: 12 }   (계획의 64% 를 했다, 계획 12개로 계산)
 *   facts.completionRate  -> { value: 55, sampleCount: 20 }   (20번 중 55% 완주)
 *
 * ■ 정해 둔 규칙 (BE 도 똑같이 만들어야 같은 결과가 나옵니다)
 *
 *  1. 날짜는 한국 시간 기준이고, 'YYYY-MM-DD' 글자로 비교합니다. 시작 날짜와 끝 날짜를 모두 포함합니다.
 *  2. 계획은 계획의 날짜(date)가, 기록은 "시작한 날" 이 기간 안에 있으면 셉니다. (daySummary 와 같습니다)
 *  3. 노는 계획과 노는 기록(kind 가 'play')은 모든 숫자에서 뺍니다.
 *  4. 순공시간은 lib/studyTime.ts 의 getStudyMs 로 구합니다. (끝 − 시작 − 일시정지한 시간)
 *  5. 계획 대비 실제 = 기간의 순공 합 ÷ 기간의 계획 목표 시간 합 × 100. 소수점은 버립니다.
 *     계획 없이 켠 타이머의 순공도 "실제" 에 들어갑니다. 100 을 넘을 수 있습니다. (계획보다 더 한 것도 사실이라 자르지 않습니다)
 *     계획 목표 시간의 합이 0 이면 나눌 수 없어서 null 입니다.
 *  6. "목표가 있는 타이머" = targetMinutes 가 0 보다 큰 숫자인 공부 기록입니다.
 *     하다 만 계획을 이어서 켜면 그 기록의 targetMinutes 는 "남은 시간" 이라서, 기록 하나하나로 판단해도 됩니다.
 *  7. 완주 = 그 기록의 순공시간이 약속한 시간(targetMinutes) 이상입니다.
 *     완주율 = 완주한 수 ÷ 목표가 있는 타이머 수 × 100. 소수점은 버립니다. 목표가 있는 타이머가 없으면 null 입니다.
 *  8. 시작 지연 = 그 계획으로 처음 켠 타이머의 시작 시각 − 계획의 시작 시각. (계획에 시작 시각이 있을 때만)
 *     계획보다 일찍 시작했으면 음수가 아니라 0분으로 칩니다.
 *     일찍 시작한 날이 늦게 시작한 날을 지워서, 평균이 "늦지 않았다" 처럼 보이면 안 되기 때문입니다.
 *     한 번도 시작하지 않은 계획은 "늦은 것" 이 아니라 "안 한 것" 이라 표본에서 뺍니다.
 *     평균(분)은 모두 더해서 나눈 뒤 마지막에 한 번만 반올림합니다. 표본이 없으면 null 입니다.
 *  9. 멈추는 지점 = 완주하지 못한 "목표가 있는 타이머" 가 목표의 몇 % 에서 끝났는지(순공 ÷ 목표)의 평균.
 *     소수점은 마지막에 한 번만 버립니다. 그만둔 이유(stopReason)를 골랐는지와 상관없이 셉니다. 표본이 없으면 null 입니다.
 * 10. 요일별·시간대별 완주율은 기록을 "시작한 시각" 의 요일·시간대로 나눠서 규칙 7 을 그대로 씁니다.
 *     그 요일·시간대에 목표가 있는 타이머가 없으면 null 입니다.
 *
 * ■ 예시 (입력 → 결과) — 기간은 2026-10-05(월) ~ 2026-10-11(일)
 *
 *   예1) 계획도 기록도 없음
 *        -> plannedMinutes 0, studyMinutes 0, 숫자는 모두 { value: null, sampleCount: 0 }
 *
 *   예2) 계획 대비 실제
 *        계획: 월 60분, 화 90분 (합 150분) / 기록: 월 순공 40분, 화 순공 56분 (합 96분)
 *        -> planRate { value: 64, sampleCount: 2 }     (96 ÷ 150 = 0.64)
 *
 *   예3) 완주율과 멈추는 지점
 *        기록 3개: 목표 50분에 순공 50분(완주) / 목표 50분에 순공 31분(멈춤) / 목표 25분에 순공 30분(완주)
 *        -> completedCount 2, completionRate { value: 66, sampleCount: 3 }   (2 ÷ 3 = 66.6… 버림)
 *        -> stopPoint { value: 62, sampleCount: 1 }                        (31 ÷ 50 = 0.62)
 *
 *   예4) 시작 지연
 *        계획 A 는 19:00 인데 19:23 에 시작(23분 늦음), 계획 B 는 21:00 인데 20:50 에 시작(일찍 → 0분)
 *        -> startDelayMinutes { value: 12, sampleCount: 2 }   ((23 + 0) ÷ 2 = 11.5 → 반올림 12)
 *
 *   예5) 계획은 있는데 타이머를 한 번도 안 켬
 *        계획: 월 60분 / 기록 없음
 *        -> planRate { value: 0, sampleCount: 1 }  (계획이 있었으니 "0% 했다" 는 계산할 수 있습니다)
 *        -> completionRate · startDelayMinutes · stopPoint 는 { value: null, sampleCount: 0 }
 *
 *   예6) 노는 계획·노는 기록
 *        계획: 공부 60분 + 놀기 30분 / 기록: 공부 순공 30분 + 놀기 30분(목표 30분)
 *        -> plannedMinutes 60, studyMinutes 30, planRate { value: 50, sampleCount: 1 }
 *        -> completionRate { value: null, sampleCount: 0 }   (노는 기록은 목표가 있어도 세지 않습니다)
 *
 *   예7) 요일별·시간대별
 *        화 19:00 에 시작해 완주, 화 23:10 에 시작해 멈춤, 토 09:00 에 시작해 완주
 *        -> completionByWeekday[2](화) { value: 50, sampleCount: 2 }, [6](토) { value: 100, sampleCount: 1 }, 나머지 null
 *        -> completionByTimeOfDay.evening { value: 100, sampleCount: 1 }, night { value: 0, sampleCount: 1 },
 *           morning { value: 100, sampleCount: 1 }, afternoon { value: null, sampleCount: 0 }
 */
export function getFacts(
  plans: StudyPlan[],
  sessions: StudySession[],
  startDate: string,
  endDate: string,
): Facts {
  const isInPeriod = (dateKey: string) => dateKey >= startDate && dateKey <= endDate

  // 기간 안의 공부 계획과 공부 기록만 고릅니다. (규칙 1 ~ 3)
  const studyPlans = plans.filter((plan) => plan.kind !== 'play' && isInPeriod(plan.date))
  const studySessions = sessions.filter(
    (session) => session.kind !== 'play' && isInPeriod(toDateKey(new Date(session.startedAt))),
  )

  /* ---------- 계획 대비 실제 (규칙 5) ---------- */
  let plannedMinutes = 0
  for (const plan of studyPlans) plannedMinutes += plan.targetMinutes

  let studyMs = 0
  for (const session of studySessions) studyMs += getStudyMs(session)

  const planRate: FactValue =
    plannedMinutes > 0
      ? {
          value: Math.floor((studyMs / (plannedMinutes * MS_PER_MINUTE)) * 100),
          sampleCount: studyPlans.length,
        }
      : { value: null, sampleCount: 0 }

  /* ---------- 완주율 · 멈추는 지점 · 요일별 · 시간대별 (규칙 6, 7, 9, 10) ---------- */
  const overall: CompletionCount = { total: 0, completed: 0 }
  // 요일 7칸 (일 ~ 토). Array.from 으로 칸마다 새 통을 만듭니다. (fill 로 만들면 7칸이 같은 통 하나를 가리킵니다)
  const byWeekday: CompletionCount[] = Array.from({ length: 7 }, () => ({ total: 0, completed: 0 }))
  const byTimeOfDay: Record<TimeOfDay, CompletionCount> = {
    morning: { total: 0, completed: 0 },
    afternoon: { total: 0, completed: 0 },
    evening: { total: 0, completed: 0 },
    night: { total: 0, completed: 0 },
  }
  // 완주하지 못한 타이머가 목표의 몇 % 에서 멈췄는지를 모두 더한 값과 그 개수
  let stopPercentSum = 0
  let stoppedCount = 0

  for (const session of studySessions) {
    const target = session.targetMinutes
    // 목표가 있는 타이머만 봅니다. (규칙 6)
    if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) continue

    const targetMs = target * MS_PER_MINUTE
    const sessionMs = getStudyMs(session)
    const isCompleted = sessionMs >= targetMs

    const startedAt = new Date(session.startedAt)
    const buckets = [
      overall,
      byWeekday[startedAt.getDay()],
      byTimeOfDay[getTimeOfDay(startedAt.getHours())],
    ]
    for (const bucket of buckets) {
      bucket.total += 1
      if (isCompleted) bucket.completed += 1
    }

    if (!isCompleted) {
      stopPercentSum += (sessionMs / targetMs) * 100
      stoppedCount += 1
    }
  }

  const stopPoint: FactValue =
    stoppedCount > 0
      ? { value: Math.floor(stopPercentSum / stoppedCount), sampleCount: stoppedCount }
      : { value: null, sampleCount: 0 }

  /* ---------- 평균 시작 지연 (규칙 8) ---------- */
  // 계획마다 "그 계획으로 처음 켠 타이머의 시작 시각" 을 찾아 둡니다. 기간 밖의 기록도 봅니다.
  // (일요일 23:50 계획을 월요일 00:10 에 시작한 경우도 20분 늦은 것으로 세기 위해서입니다)
  const firstStartByPlanId = new Map<string, number>()
  for (const session of sessions) {
    if (session.kind === 'play' || session.planId === undefined) continue
    const known = firstStartByPlanId.get(session.planId)
    if (known === undefined || session.startedAt < known) {
      firstStartByPlanId.set(session.planId, session.startedAt)
    }
  }

  let delayMsSum = 0
  let delayCount = 0
  for (const plan of studyPlans) {
    const plannedStartAt = getPlannedStartAt(plan)
    const firstStartAt = firstStartByPlanId.get(plan.id)
    // 시작 시각을 안 정했거나, 한 번도 시작하지 않은 계획은 뺍니다.
    if (plannedStartAt === null || firstStartAt === undefined) continue

    // 일찍 시작했으면 0 으로 칩니다. (Math.max 가 음수를 0 으로 바꿉니다)
    delayMsSum += Math.max(0, firstStartAt - plannedStartAt)
    delayCount += 1
  }

  const startDelayMinutes: FactValue =
    delayCount > 0
      ? { value: Math.round(delayMsSum / delayCount / MS_PER_MINUTE), sampleCount: delayCount }
      : { value: null, sampleCount: 0 }

  return {
    plannedMinutes,
    studyMinutes: Math.round(studyMs / MS_PER_MINUTE),
    planRate,
    completedCount: overall.completed,
    completionRate: toCompletionRate(overall),
    startDelayMinutes,
    stopPoint,
    completionByWeekday: byWeekday.map(toCompletionRate),
    completionByTimeOfDay: {
      morning: toCompletionRate(byTimeOfDay.morning),
      afternoon: toCompletionRate(byTimeOfDay.afternoon),
      evening: toCompletionRate(byTimeOfDay.evening),
      night: toCompletionRate(byTimeOfDay.night),
    },
  }
}
