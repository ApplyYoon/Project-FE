import { toDayKey } from '@/lib/date'
import { getPlannedStartAt } from '@/lib/facts'
import { ON_TIME_GRACE_MINUTES } from '@/lib/planResult'
import { getStudyMs } from '@/lib/studyTime'
import type { Card, StudySession } from '@/types'

/**
 * 카드 결과 판정 (최종 기획서 「5.1 카드 결과」, #381)
 *
 * 카드 하루치(그 카드 · 그 날짜)를 두 축으로 봅니다.
 * - 실행 축: 제때 시작해서 끝까지 했는지 → 결과 7가지 + 실행률
 * - 계획 축: 체크리스트를 얼마나 했는지 → 계획 과대 / 실행 축 문제
 * 체크리스트가 남은 날을 '실패'라고 부르지 않습니다. 앱이 흑백 사고(6번 오류)를 하게 되기 때문입니다.
 *
 * 숫자는 모두 출발값입니다. 바꿀 때는 이 파일의 상수와 BE(Project-BE#229)를 같이 고칩니다.
 */

/**
 * 카드 하루치의 결과
 * - done: 실행 (예정 시각 10분 안에 시작, 예정 종료까지)
 * - late: 지연 실행 (10분 넘게 늦게 시작, 카드 시간 안)
 * - endedEarly: 중도 종료 (예정 종료 전에 [끝내기])
 * - postponed: 미루기 / failed: 실패로 기록 / rest: 사후 휴식 처리 (모든 집계에서 뺌)
 * - selfReport: 사후 입력
 * - unhandled: 카드 시간이 끝났는데 시작도, 처리도 안 함 → 다음 통화에서 묻고 실패로 기록 (집계에서는 실패로 셈)
 */
export type CardResult =
  'done' | 'late' | 'endedEarly' | 'postponed' | 'failed' | 'rest' | 'selfReport' | 'unhandled'

/** 결과마다 화면에 보일 글자. 혼내는 말투가 되지 않게 "했어요" 로 씁니다 */
export const CARD_RESULT_LABELS: Record<CardResult, string> = {
  done: '제때 했어요',
  late: '늦게 시작했어요',
  endedEarly: '중간에 끝냈어요',
  postponed: '미뤘어요',
  failed: '못 했어요',
  rest: '쉬었어요',
  selfReport: '나중에 적었어요',
  unhandled: '아직 정리 안 했어요',
}

/** 사람이 직접 처리한 표시 (미루기 #400 · 실패 기록 #400 · 휴식 처리 #407 이 저장합니다) */
export type CardDayMark = 'postponed' | 'failed' | 'rest'

/** 판정에 넣는 카드 하루치 */
export interface CardDay {
  card: Pick<Card, 'startTime' | 'durationMinutes' | 'checklist' | 'expectedDone'>
  /** 그 카드를 하는 날짜 ('YYYY-MM-DD') */
  dateKey: string
  /** 그 카드 · 그 날짜의 공부 세션 (노는 기록 빼고) */
  sessions: StudySession[]
  /** 사람이 처리한 표시 */
  mark?: CardDayMark
}

/** 실행률이 이만큼 이상인데 체크리스트가 남으면 '계획 과대' 입니다 */
export const PLAN_AXIS_RUN_RATE = 0.8
/** 증빙 없는 자기 보고는 실행률을 이 값으로 넣습니다 (「4.4 타이머」 사후 입력) */
export const SELF_REPORT_RUN_RATE = 0.5
/** 계획 패턴: 최근 4주 체크리스트 달성률 기준 */
export const PATTERN_LOOSE_OVER = 0.9
export const PATTERN_OVER_UNDER = 0.6
/** 계획 패턴을 말하려면 카드가 이만큼은 있어야 합니다 (그 전에는 '가설'로만 말한다, 「2 수집 원칙」) */
export const PATTERN_MIN_SAMPLES = 5

const MS_PER_MINUTE = 60 * 1000

/** 미루기 · 실패 · 미처리 = 미실행. 재발 신호와 미루기·실패 비율에 씁니다 */
export function isMissResult(result: CardResult): boolean {
  return result === 'postponed' || result === 'failed' || result === 'unhandled'
}

/**
 * 카드 하루치의 결과를 정합니다. 아직 판정할 수 없으면 null 입니다 (카드 시간 전이거나 하는 중).
 *
 * ■ 규칙 (위에서부터 먼저 맞는 것)
 * 1. 사람이 처리한 표시가 있으면 그것 (휴식 → rest, 미루기 → postponed, 실패 → failed)
 * 2. 세션이 없으면: 카드 시간이 끝났으면 unhandled, 아니면 null
 *    (시작 시각이 없는 옛 카드는 그날이 끝나면(새벽 4시) 끝난 것으로 봅니다)
 * 3. 세션이 증빙 없는 사후 입력뿐이면 selfReport (증빙이 있으면 일반 실행과 똑같이 봅니다, 「4.4」 사후 입력)
 * 4. [끝내기] 로 끝낸 세션이 있고 실행률이 1 이 안 되면 endedEarly
 * 5. 처음 시작한 시각이 예정 시각 + 10분 안이면 done, 더 늦으면 late (일찍 시작해도 done, 시작 시각이 없으면 done)
 *
 * ■ 예시 (10/17 19:00 시작 · 60분 카드)
 *   세션 19:05 ~ 20:00                       -> 'done'
 *   세션 18:50 ~ 20:00 (일찍 시작)            -> 'done'
 *   세션 19:20 ~ 20:00                       -> 'late'
 *   세션 19:00 ~ 19:30, [끝내기]             -> 'endedEarly'
 *   세션 없음, 지금 19:30                    -> null
 *   세션 없음, 지금 20:01                    -> 'unhandled'
 *   표시 'rest' (세션과 상관없이)             -> 'rest'
 *   사후 입력 세션만                          -> 'selfReport'
 */
export function getCardResult(day: CardDay, now: number): CardResult | null {
  // 규칙 1
  if (day.mark) return day.mark

  const scheduledStartAt = getPlannedStartAt({ date: day.dateKey, startTime: day.card.startTime })

  // 규칙 2
  if (day.sessions.length === 0) {
    if (scheduledStartAt === null) return toDayKey(now) > day.dateKey ? 'unhandled' : null
    const scheduledEndAt = scheduledStartAt + day.card.durationMinutes * MS_PER_MINUTE
    return now >= scheduledEndAt ? 'unhandled' : null
  }

  // 규칙 3
  if (day.sessions.every((session) => session.mode === 'selfReport' && !hasProof(session))) {
    return 'selfReport'
  }

  // 규칙 4
  if (day.sessions.some((session) => session.endedEarly) && getRunRate(day) < 1) return 'endedEarly'

  // 규칙 5
  if (scheduledStartAt === null) return 'done'
  const firstStartAt = Math.min(...day.sessions.map((session) => session.startedAt))
  const isOnTime = firstStartAt - scheduledStartAt <= ON_TIME_GRACE_MINUTES * MS_PER_MINUTE
  return isOnTime ? 'done' : 'late'
}

/**
 * 정시에 시작했는지 (예정 시각 + 10분 안에 처음 시작). 의지력의 '정시 시작 비율' 에 씁니다 (「5.3」).
 * 시작하지 않았거나(세션 없음) 사후 입력뿐이거나 시작 시각이 없는 카드면 null 입니다 (비율 계산에서 뺌).
 *
 *   19:00 카드, 19:05 시작 -> true    19:00 카드, 19:20 시작 -> false    세션 없음 -> null
 */
export function isStartedOnTime(day: CardDay): boolean | null {
  const measured = day.sessions.filter((session) => session.mode !== 'selfReport')
  if (measured.length === 0) return null
  const scheduledStartAt = getPlannedStartAt({ date: day.dateKey, startTime: day.card.startTime })
  if (scheduledStartAt === null) return null
  const firstStartAt = Math.min(...measured.map((session) => session.startedAt))
  return firstStartAt - scheduledStartAt <= ON_TIME_GRACE_MINUTES * MS_PER_MINUTE
}

/** 산출물 증빙(링크나 요약)이 있는 기록인지 */
function hasProof(session: StudySession): boolean {
  return Boolean(session.endReport?.proof?.link || session.endReport?.proof?.summary)
}

/**
 * 실행률 = 실제 실행 시간(일시정지 제외) ÷ 계획 시간, 최대 1
 * - 증빙 없는 사후 입력은 0.5 로 넣습니다 (증빙이 있으면 다른 세션과 똑같이 계산)
 * - 계획 시간이 0분이면 0
 *
 *   60분 카드, 45분 공부            -> 0.75
 *   60분 카드, 70분 공부            -> 1
 *   60분 카드, 증빙 없는 사후 입력   -> 0.5
 */
export function getRunRate(day: CardDay): number {
  const plannedMs = day.card.durationMinutes * MS_PER_MINUTE
  if (plannedMs <= 0) return 0
  const unprovenSelfReport = day.sessions.some(
    (session) => session.mode === 'selfReport' && !hasProof(session),
  )
  if (unprovenSelfReport) return SELF_REPORT_RUN_RATE
  const runMs = day.sessions.reduce((sum, session) => sum + getStudyMs(session), 0)
  return Math.min(1, runMs / plannedMs)
}

/** 그날 체크한 체크리스트 항목 수 (여러 세션에 나뉘어 있어도 한 번씩만 셈) */
export function getCheckedCount(day: CardDay): number {
  const itemIds = new Set(day.card.checklist.map((item) => item.id))
  const checked = new Set<string>()
  for (const session of day.sessions) {
    for (const itemId of Object.keys(session.endReport?.checked ?? {})) {
      if (itemIds.has(itemId)) checked.add(itemId)
    }
  }
  return checked.size
}

/** 체크리스트 달성률 (0 ~ 1). 체크리스트가 비어 있으면 1 */
export function getChecklistRate(day: CardDay): number {
  const total = day.card.checklist.length
  return total === 0 ? 1 : getCheckedCount(day) / total
}

/**
 * 계획 축 — 체크리스트가 남았을 때 어느 쪽 문제인지
 * - complete: 다 했음
 * - overPlanned: 실행률 80% 이상인데 남음 → 계획이 컸음 (채찍 재료가 아니라 계획 크기를 고칠 재료)
 * - execution: 실행률 80% 미만이고 남음 → 늦은 시작·중도 종료 (실행 축 문제)
 * 세션이 없으면 null
 *
 *   체크 3/3, 실행률 1     -> 'complete'
 *   체크 2/3, 실행률 0.9   -> 'overPlanned'
 *   체크 2/3, 실행률 0.5   -> 'execution'
 */
export function getPlanAxis(day: CardDay): 'complete' | 'overPlanned' | 'execution' | null {
  if (day.sessions.length === 0) return null
  if (getChecklistRate(day) >= 1) return 'complete'
  return getRunRate(day) >= PLAN_AXIS_RUN_RATE ? 'overPlanned' : 'execution'
}

/**
 * 예측 정확도 — 실제로 체크한 개수 − 예상 달성 개수 (예상이 없으면 체크리스트 전부)
 * 음수면 예상보다 덜 했다는 뜻입니다. 세션이 없으면 null
 *
 *   체크리스트 5개, 예상 없음, 3개 체크  -> -2
 *   체크리스트 5개, 예상 3개, 3개 체크   -> 0
 */
export function getPredictionGap(day: CardDay): number | null {
  if (day.sessions.length === 0) return null
  const expected = day.card.expectedDone ?? day.card.checklist.length
  return getCheckedCount(day) - expected
}

/** 계획 패턴 — 과대 / 적정 / 느슨 */
export type PlanPattern = 'over' | 'fit' | 'loose'

/**
 * 같은 목표 카드의 최근 4주 체크리스트 달성률(카드 하루치마다 0 ~ 1)로 계획 패턴을 정합니다.
 * 평균이 90% 를 넘으면 느슨, 60% 밑이면 과대, 그 사이는 적정입니다.
 * (기획서의 적정 구간은 70~90% 입니다. 60~70% 는 과대라고 할 만큼은 아니라 적정에 넣었습니다)
 * 5개보다 적으면 아직 말하지 않습니다 (null).
 *
 *   [1, 1, 1, 1, 0.95]        -> 'loose'
 *   [0.8, 0.7, 0.9, 0.8, 0.8] -> 'fit'
 *   [0.5, 0.4, 0.6, 0.5, 0.7] -> 'over'
 *   [1, 1]                    -> null
 */
export function getPlanPattern(checklistRates: number[]): PlanPattern | null {
  if (checklistRates.length < PATTERN_MIN_SAMPLES) return null
  const average = checklistRates.reduce((sum, rate) => sum + rate, 0) / checklistRates.length
  if (average > PATTERN_LOOSE_OVER) return 'loose'
  if (average < PATTERN_OVER_UNDER) return 'over'
  return 'fit'
}
