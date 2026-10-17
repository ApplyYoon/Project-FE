import type { Routine, SessionPause, StudyPlan, StudySession } from '@/types'

/**
 * 카드 기준으로 넓힌 세션 기록(#380)을 읽고 쓸 때 쓰는 순수 함수들입니다.
 * 실행 시간(순공)은 지금처럼 lib/studyTime.ts 의 getStudyMs 로 구합니다.
 */

/**
 * 일시정지 목록으로 옛 칸(pauseCount · pausedMs)을 계산합니다.
 * 새 세션을 저장할 때 pauses 와 같이 넣어 두면, 옛 칸을 읽는 화면·계산(getStudyMs 등)이 그대로 맞습니다.
 * 끝이 시작보다 빠른 잘못된 일시정지는 0분으로 칩니다.
 *
 *   summarizePauses([])                                                -> { pauseCount: 0, pausedMs: 0 }
 *   summarizePauses([{ 19:20 ~ 19:25, 'toilet' }, { 19:40 ~ 19:50, 'phone' }])
 *                                                                      -> { pauseCount: 2, pausedMs: 15분 }
 */
export function summarizePauses(pauses: SessionPause[]): { pauseCount: number; pausedMs: number } {
  const pausedMs = pauses.reduce(
    (sum, pause) => sum + Math.max(0, pause.endedAt - pause.startedAt),
    0,
  )
  return { pauseCount: pauses.length, pausedMs }
}

/**
 * 옛 계획 id → 카드 id 표를 만듭니다. lib/cards.ts 의 migratePlansToCards 와 같은 규칙입니다.
 * - 아직 있는 루틴이 만든 계획 → 그 루틴 id (반복 카드)
 * - 그 밖의 계획 → 계획 id 그대로 (1회성 카드)
 *
 *   루틴 R, 계획 P1(routineId R), 계획 P2(루틴 없음), 계획 P3(routineId 'gone' — 지워진 루틴)
 *   buildCardIdByPlanId({ …: [P1, P2, P3] }, [R]) -> { P1: R, P2: P2, P3: P3 }
 */
export function buildCardIdByPlanId(
  plansByDate: Record<string, StudyPlan[]>,
  routines: Routine[],
): Record<string, string> {
  const routineIds = new Set(routines.map((routine) => routine.id))
  const table: Record<string, string> = {}
  for (const plan of Object.values(plansByDate).flat()) {
    const fromRoutine = plan.routineId !== undefined && routineIds.has(plan.routineId)
    table[plan.id] = fromRoutine ? (plan.routineId as string) : plan.id
  }
  return table
}

/**
 * 세션이 어느 카드의 것인지 돌려줍니다. 카드에 붙지 않은 옛 기록(계획 없이 켠 타이머)이면 undefined 입니다.
 *
 *   getSessionCardId({ cardId: 'c1' }, {})                -> 'c1'
 *   getSessionCardId({ planId: 'P1' }, { P1: 'R' })       -> 'R'
 *   getSessionCardId({ planId: 'P9' }, {})                -> 'P9'   (표에 없는 계획 → 계획 id)
 *   getSessionCardId({}, {})                              -> undefined
 */
export function getSessionCardId(
  session: Pick<StudySession, 'cardId' | 'planId'>,
  cardIdByPlanId: Record<string, string>,
): string | undefined {
  if (session.cardId) return session.cardId
  if (session.planId) return cardIdByPlanId[session.planId] ?? session.planId
  return undefined
}
