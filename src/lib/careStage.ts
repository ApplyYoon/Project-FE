import { getCareLevelInfo } from '@/lib/careLevelInfo'
import type { RelapseReason, RelapseSignal } from '@/lib/relapseSignal'
import { loadRecord, saveData } from '@/lib/storage'
import type { CareLevel, MissReason } from '@/types'

/**
 * 관리 단계 매일 판정 (최종 기획서 「5.4 관리 단계」, #384)
 *
 * 하루 1번(통화 때, 통화가 없으면 다음 날 첫 진입 때) 판정합니다. 위에서부터 먼저 맞는 것:
 *   1. 안전 조건(위기 표현, 기분 저하) → 0 고정
 *   2. 회복 조건 → 0
 *   3. 재발 신호 + 주원인이 내 쪽(폰·SNS, 하기 싫음, 미루다 보니) → 지금 단계 +1 (최대 4, 제재 한도 안)
 *   4. 재발 신호 + 주원인이 어쩔 수 없음(아픔, 행사·약속) → 그대로 + 계획 축소 제안
 *   5. 재발 신호 + 주원인이 계획 과다·피곤 → 그대로 + 계획 축소 제안
 *   6. 재발 신호 없음 → 기준 단계(lib/willpower.ts getBaseStage) 쪽으로 한 칸
 * 그리고 상한: 제재 최대 한도, 시험 직전 3일·직후 2일은 2, 처음 7일은 2.
 * 하루에 한 칸까지만 올라가고, 성공하면 그 자리에서 한 칸 내려갑니다(stepDownOnSuccess).
 *
 * 왜 이 단계인지 홈과 통화에서 항상 한 줄로 말합니다(reason).
 * 같은 규칙이 BE(Project-BE#62)에도 있습니다.
 */

/** 주원인의 성격 — 내 쪽 / 어쩔 수 없음 / 계획이 많았거나 피곤 / 모름 */
export type CauseKind = 'internal' | 'unavoidable' | 'overload' | 'unknown'

/**
 * 미실행 원인 태그의 성격. '미루다 보니'(#400 에서 더함)도 내 쪽입니다.
 *
 *   getCauseKind('phone') -> 'internal'    getCauseKind('sick') -> 'unavoidable'
 *   getCauseKind('tired') -> 'overload'    getCauseKind('etc')  -> 'unknown'
 */
export function getCauseKind(cause: MissReason | 'procrastinated' | undefined): CauseKind {
  if (cause === 'phone' || cause === 'unwilling' || cause === 'procrastinated') return 'internal'
  if (cause === 'sick' || cause === 'event') return 'unavoidable'
  if (cause === 'tooMuch' || cause === 'tired') return 'overload'
  return 'unknown'
}

/** 회복 모드로 가는 일수 (회복 모드 민감도). 실패 민감도 높음 2 · 보통 3 · 낮음 4 */
export type RecoverySensitivityDays = 2 | 3 | 4

export interface CareStageInput {
  /** 어제까지의 단계. 처음 판정이면 없음 → 기준 단계에서 시작 */
  previousStage?: CareLevel
  /** 오늘의 기준 단계 (getBaseStage) */
  baseStage: CareLevel
  /** 시작한 지 며칠째인지 (0 = 첫날) */
  dayIndex: number
  /** 안전 조건: 위기 표현을 감지했는지 · 기분 저하가 이어졌는지 (safetyBrake.ts 의 stopWhip · recoveryMode) */
  safety: { crisis: boolean; lowMood: boolean }
  /** 회복 조건에 쓰는 기록 */
  recovery: {
    /** 오늘까지 휴식·미실행만 이어진 날 수 */
    restOrMissStreakDays: number
    /** 오늘까지 부정 감정 태그(막막함·불안함·피곤함·짜증남)만 이어진 날 수 */
    negativeMoodStreakDays: number
    /** 지난 판정 이후 절대 카드를 놓쳤는지 */
    absoluteMissed: boolean
    /** 대화(통화·채팅)에서 힘들다는 표현이 있었는지 */
    hardTalk: boolean
    /** 회복 모드 민감도 (설정) */
    sensitivityDays: RecoverySensitivityDays
  }
  /** 재발 신호 (getRelapseSignal) */
  relapse: Pick<RelapseSignal, 'hasSignal' | 'reasons' | 'mainCause'>
  /** 사용자가 정한 제재 최대 한도 (0 ~ 4) */
  maxLevel: CareLevel
  /** 시험 직전 3일 ~ 직후 2일인지 (safetyBrake.ts 의 examPeriod) */
  examPeriod: boolean
}

export interface CareStageResult {
  /** 오늘의 관리 단계 (0 ~ 4) */
  stage: CareLevel
  /** 어느 규칙으로 정했는지 */
  rule:
    | 'safety'
    | 'recovery'
    | 'up'
    | 'holdUnavoidable'
    | 'holdOverload'
    | 'holdUnknown'
    | 'toBase'
    /** 4단계에서 증빙 있는 실행을 해서 3단계로 내려옴 (lib/stage4.ts) */
    | 'release'
  /** 계획을 줄여 보자고 제안할지 */
  suggestShrink: boolean
  /** 왜 이 단계인지 한 줄 (홈 · 통화) */
  reason: string
}

/** 시험 기간 상한 */
export const EXAM_STAGE_CAP: CareLevel = 2
/** 처음 이 일수 동안의 상한 (기준 단계와 같은 이유: 기록이 없을 때는 채찍을 쓰지 않음) */
export const FIRST_DAYS = 7
export const FIRST_DAYS_STAGE_CAP: CareLevel = 2

const RELAPSE_REASON_TEXT: Record<RelapseReason, string> = {
  routineTwice: '같은 루틴을 2번 연속 놓쳤고',
  rateDrop: '최근 7일 실행률이 평소보다 많이 떨어졌고',
  absoluteMiss: '꼭 해야 하는 카드를 놓쳤고',
}

const CAUSE_TEXT: Partial<Record<MissReason | 'procrastinated', string>> = {
  phone: '폰·SNS',
  unwilling: '하기 싫은 마음',
  procrastinated: '미루다 보니',
}

function clampStage(value: number): CareLevel {
  return Math.min(4, Math.max(0, value)) as CareLevel
}

/** 단계 이름 (0 회복 · 1 당근 · 2 넛지 · 3 심리적 채찍 · 4 강제적 채찍) */
function stageName(stage: CareLevel): string {
  return getCareLevelInfo(stage).name
}

/**
 * 오늘의 관리 단계를 정합니다. React 도 저장소도 쓰지 않는 순수 함수입니다.
 *
 * ■ 예시 (어제 2단계, 기준 단계 2, 한도 4, 20일째, 시험 아님)
 *   위기 표현                                   -> { stage: 0, rule: 'safety' }
 *   휴식·미실행 3일 연속 (민감도 3)              -> { stage: 0, rule: 'recovery' }
 *   재발 신호 + 주원인 폰                        -> { stage: 3, rule: 'up' }
 *   재발 신호 + 주원인 폰, 한도 2                 -> { stage: 2, rule: 'up' }   (한도는 넘지 않음)
 *   재발 신호 + 주원인 폰, 시험 기간             -> { stage: 2, rule: 'up' }   (시험 기간 상한 2)
 *   재발 신호 + 주원인 아픔                      -> { stage: 2, rule: 'holdUnavoidable', suggestShrink: true }
 *   재발 신호 + 주원인 피곤                      -> { stage: 2, rule: 'holdOverload', suggestShrink: true }
 *   재발 신호 없음, 기준 단계 1                  -> { stage: 1, rule: 'toBase' }
 *   재발 신호 없음, 어제 0(회복), 기준 단계 2     -> { stage: 1, rule: 'toBase' }   (한 칸씩)
 *   어제 4단계, 재발 신호 + 폰                   -> { stage: 4 }                   (최대 4)
 */
export function decideCareStage(input: CareStageInput): CareStageResult {
  const previous = input.previousStage ?? input.baseStage

  // 1. 안전 조건
  if (input.safety.crisis || input.safety.lowMood) {
    return {
      stage: 0,
      rule: 'safety',
      suggestShrink: false,
      reason: '요즘 많이 힘들어 보여서 오늘은 쉬어 가는 회복 모드야.',
    }
  }

  // 2. 회복 조건 (「4.5 회복 모드」)
  const { recovery } = input
  const isRecovery =
    recovery.restOrMissStreakDays >= recovery.sensitivityDays ||
    recovery.negativeMoodStreakDays >= recovery.sensitivityDays ||
    recovery.absoluteMissed ||
    recovery.hardTalk
  if (isRecovery) {
    return {
      stage: 0,
      rule: 'recovery',
      suggestShrink: true,
      reason: '요 며칠 버거웠던 것 같아서 회복 모드야. 오늘은 계획을 줄여서 작게 시작해 보자.',
    }
  }

  // 3 ~ 6
  let stage: CareLevel
  let rule: CareStageResult['rule']
  let reason: string
  if (input.relapse.hasSignal) {
    const kind = getCauseKind(input.relapse.mainCause)
    const why = input.relapse.reasons.map((item) => RELAPSE_REASON_TEXT[item]).join(', ')
    if (kind === 'internal') {
      stage = clampStage(previous + 1)
      rule = 'up'
      const cause = CAUSE_TEXT[input.relapse.mainCause as MissReason] ?? '내 쪽 이유'
      reason = `${why} 주로 ${cause} 때문이라 ${stageName(capStage(stage, input))} 모드야.`
    } else {
      stage = previous
      rule =
        kind === 'unavoidable'
          ? 'holdUnavoidable'
          : kind === 'overload'
            ? 'holdOverload'
            : 'holdUnknown'
      reason =
        kind === 'unavoidable'
          ? `${why} 아픔·약속처럼 어쩔 수 없는 일이 많아서 단계는 그대로야. 계획을 줄여 볼까?`
          : kind === 'overload'
            ? `${why} 계획이 많았거나 피곤했던 날이 많아서 단계는 그대로야. 계획을 줄여 볼까?`
            : `${why} 아직 이유를 몰라서 단계는 그대로야. 무슨 일이 있었는지 통화에서 물어볼게.`
    }
  } else {
    // 한 칸씩 기준 단계 쪽으로
    stage =
      previous < input.baseStage
        ? clampStage(previous + 1)
        : previous > input.baseStage
          ? clampStage(previous - 1)
          : previous
    rule = 'toBase'
    reason = getCareLevelInfo(capStage(stage, input)).defaultReason
  }

  return {
    stage: capStage(stage, input),
    rule,
    suggestShrink: rule === 'holdUnavoidable' || rule === 'holdOverload',
    reason,
  }
}

/** 한도 · 시험 기간 · 처음 7일 상한을 적용합니다 */
function capStage(stage: CareLevel, input: CareStageInput): CareLevel {
  let capped: number = Math.min(stage, input.maxLevel)
  if (input.examPeriod) capped = Math.min(capped, EXAM_STAGE_CAP)
  if (input.dayIndex < FIRST_DAYS) capped = Math.min(capped, FIRST_DAYS_STAGE_CAP)
  return clampStage(capped)
}

/**
 * 성공(실행 + 체크리스트 70% 이상)하면 그 자리에서 한 칸 내립니다. 1단계 밑으로는 내려가지 않고, 0(회복)은 그대로입니다.
 *
 *   stepDownOnSuccess(3) -> 2    stepDownOnSuccess(1) -> 1    stepDownOnSuccess(0) -> 0
 */
export function stepDownOnSuccess(stage: CareLevel): CareLevel {
  return stage >= 2 ? ((stage - 1) as CareLevel) : stage
}

/** 성공으로 칠 체크리스트 달성률 */
export const SUCCESS_CHECKLIST_RATE = 0.7

// ── 날마다의 판정 저장 ──

// 저장소에 넣는 이름입니다. 예: { '2026-10-17': { stage: 2, reason: '…', rule: 'toBase' } }
export const CARE_STAGE_LOG_KEY = 'care-stage-log'

export type SavedCareStage = Pick<CareStageResult, 'stage' | 'reason' | 'rule'>

/** 그날의 판정을 저장합니다. 같은 날 다시 부르면 덮어씁니다 (성공해서 한 칸 내려갔을 때). */
export function saveCareStage(dateKey: string, result: SavedCareStage): void {
  const log = loadRecord<SavedCareStage>(CARE_STAGE_LOG_KEY)
  saveData(CARE_STAGE_LOG_KEY, { ...log, [dateKey]: result })
}

/** 그 날짜 또는 그 전의 가장 최근 판정. 한 번도 판정한 적이 없으면 undefined */
export function loadLatestCareStage(
  dateKey: string,
): (SavedCareStage & { dateKey: string }) | undefined {
  const log = loadRecord<SavedCareStage>(CARE_STAGE_LOG_KEY)
  const latest = Object.keys(log)
    .filter((key) => key <= dateKey)
    .sort()
    .pop()
  if (latest === undefined) return undefined
  const saved = log[latest]
  const isValid = typeof saved?.stage === 'number' && typeof saved.reason === 'string'
  return isValid ? { ...saved, dateKey: latest } : undefined
}
