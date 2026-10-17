/**
 * 통화 대본의 "조건부 모듈" 을 고르는 규칙입니다. (기획서 「4.5 상담」 통화 4번, #414)
 * 통화 한 번에 모듈은 **최대 1개** 이고, 아래 우선순위에서 조건이 맞는 첫 번째를 고릅니다.
 * 서버(BE#28 대본)도 같은 규칙을 씁니다. 순서를 바꾸면 BE 에도 알려 주세요.
 *
 *   1. safetyBrake        안전 브레이크 — 위기 표현을 감지했을 때
 *   2. recovery           회복 모드(What if) — 오늘 관리 단계가 회복(0)일 때
 *   3. review4            4칸 회고 — 지난 통화 이후 재발 신호가 났을 때
 *   4. goalCheck          목표 점검 — 2주마다 (lib/goalProgress.ts 의 isGoalCheckDue)
 *   5. distortionFeedback 왜곡 경향 피드백 — 주 1~2회 (설정의 distortionFeedbackPerWeek)
 *   6. predictReveal      예측 후 공개 질문 — 주 1회
 *
 * React 도 저장소도 쓰지 않는 순수 함수입니다.
 */

/** 조건부 모듈 이름 (서버와 같은 글자) */
export type CallModule =
  'safetyBrake' | 'recovery' | 'review4' | 'goalCheck' | 'distortionFeedback' | 'predictReveal'

/** 우선순위 (앞일수록 먼저) */
export const CALL_MODULE_PRIORITY: CallModule[] = [
  'safetyBrake',
  'recovery',
  'review4',
  'goalCheck',
  'distortionFeedback',
  'predictReveal',
]

/** 모듈마다 "이번 통화에 넣을 조건이 됐는지" */
export type CallModuleConditions = Record<CallModule, boolean>

/**
 * 조건이 맞는 모듈 중 우선순위가 가장 높은 것 하나. 하나도 없으면 null
 *
 *   { safetyBrake: true, review4: true, … }       -> 'safetyBrake'   (안전이 먼저)
 *   { recovery: true, goalCheck: true, … }        -> 'recovery'
 *   { review4: false, goalCheck: true, predictReveal: true } -> 'goalCheck'
 *   모두 false                                     -> null
 */
export function pickCallModule(conditions: CallModuleConditions): CallModule | null {
  return CALL_MODULE_PRIORITY.find((module) => conditions[module]) ?? null
}

/** 예측 후 공개 질문을 넣는 간격 (일) */
export const PREDICT_REVEAL_EVERY_DAYS = 7

/** 최근 며칠 동안 왜곡 피드백 · 예측 질문을 몇 번 했는지 셀 때 보는 기간 (일) */
export const MODULE_COUNT_DAYS = 7

/**
 * 최근 7일 동안 그 모듈을 넣은 횟수. log 는 통화마다 넣은 모듈 기록(lib/callLog.ts)입니다.
 *
 *   log [{ dateKey: '2026-10-15', module: 'distortionFeedback' }], 오늘 10/17 -> 1
 *   log [{ dateKey: '2026-10-09', … }], 오늘 10/17                         -> 0 (7일 지남)
 */
export function countRecentModule(
  log: { dateKey: string; module: CallModule | null }[],
  module: CallModule,
  fromKey: string,
): number {
  return log.filter((entry) => entry.module === module && entry.dateKey >= fromKey).length
}
