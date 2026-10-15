import { getPlannedStartAt } from '@/lib/facts'
import type { CalendarEventInput } from '@/lib/googleCalendar'
import type { StudyPlan, Subject } from '@/types'

const MS_PER_MINUTE = 60 * 1000

/**
 * 계획 하나를 구글 캘린더 일정으로 바꿉니다. (#316) 시작 시각이 없으면 넣을 시간이 없어서 null 입니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * ■ 규칙
 *  - 제목: 공부 = "과목 · 할 일", 노는 계획 = "놀기 · 할 일", 과목이 지워졌으면 "할 일" 만
 *  - 시간: 시작 시각 ~ 시작 시각 + 목표 시간
 *    (00:00 ~ 03:59 시작 시각은 다음 날 새벽입니다 — lib/facts.ts 의 getPlannedStartAt)
 *
 * ■ 예시
 *   10/15 19:00 · 수학 · 문제집 · 50분 -> { title: '수학 · 문제집', start: 10/15 19:00, end: 10/15 19:50 }
 *   10/15 01:00 · 놀기 · 게임 · 60분    -> { title: '놀기 · 게임', start: 10/16 01:00, end: 10/16 02:00 }
 *   시작 시각 없는 계획                  -> null
 */
export function toCalendarEvent(
  plan: StudyPlan,
  subject: Subject | undefined,
): CalendarEventInput | null {
  const start = getPlannedStartAt(plan)
  if (start === null) return null

  const label = plan.kind === 'play' ? '놀기' : subject?.name
  return {
    title: label ? `${label} · ${plan.content}` : plan.content,
    start,
    end: start + Math.max(1, plan.targetMinutes) * MS_PER_MINUTE,
    planId: plan.id,
  }
}

/**
 * 이 계획을 구글 캘린더와 맞출지. 시작 시각이 있고, 오늘이거나 앞으로의 계획만 맞춥니다.
 * (지난 계획을 캘린더에 새로 넣는 것은 의미가 없어서 뺍니다)
 */
export function canSyncPlan(plan: StudyPlan, todayKey: string): boolean {
  return plan.startTime !== undefined && plan.date >= todayKey
}
