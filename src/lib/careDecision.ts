/**
 * 어제 결과를 보고 "오늘 AI 가 어떻게 대응할지"를 정하는 분기 함수입니다. (기획서 v2 4장)
 * "못 하면 채찍" 이 아니라, 못 한 **원인**을 나눠서 대응을 정합니다.
 * "잘 했는데 효과가 없으면 문제는 사람이 아니라 전략" 이라는 점이 중요합니다.
 *
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 입력 중 이행 판정(#66)과 효과 판정(#92)은 각 파일의 타입을 그대로 가져다 씁니다.
 * ⚠️ 미달 원인(MissCause)만 아직 임시로 여기서 정의합니다. (미달 원인 이름이 팀 안에서 정리되면 맞추세요)
 */
import type { ExperimentResult } from '@/lib/experimentJudge'
import type { SuggestionGrade } from '@/lib/suggestionRate'

/**
 * 어제 계획을 못 채운 주요 원인 (#26). 미달 원인 버튼 7개(MissReasonPicker)의 값과 같습니다.
 * tired 피곤 / event 약속·행사 / phone 폰·SNS / overplan 계획 과다 / lazy 하기 싫음 / sick 아픔 / etc 기타
 */
export type MissCause = 'tired' | 'event' | 'phone' | 'overplan' | 'lazy' | 'sick' | 'etc'

export interface CareDecisionInput {
  /**
   * 개선안 이행 판정 (#66): good 잘 시행 / partial 부분 시행 / poor 못 시행
   * (getSuggestionRate 는 기록이 없으면 null 을 돌려주는데, 그럴 때는 이 함수를 부르지 말고 호출하는 쪽에서 먼저 처리하세요)
   */
  fulfillment: SuggestionGrade
  /**
   * 개선안 효과 판정 (#92, 직전 2주와 비교): effective 효과 있음 / noEffect 효과 없음 / unclear 애매
   * unclear 는 기록이 5일 미만이거나 신호가 엇갈려서 단정할 수 없는 경우입니다. (기획서: 애매하면 1주 연장)
   */
  effect: ExperimentResult
  /** 주요 미달 원인 (#26). 고르지 않았으면 null */
  mainMissCause: MissCause | null
  /** 최근 연속으로 계획을 못 채운 일수 */
  consecutiveMissDays: number
  /** 최근 기분이 낮은 상태인지 (체크인의 기분 점수 등으로 판단) */
  isMoodLow: boolean
}

/**
 * AI 의 대응 종류입니다.
 *  - recovery-first: 회복 모드 우선. 채찍 금지
 *  - carrot-raise: 당근 + 목표 10% 상향
 *  - carrot-change-strategy: 당근(노력 인정) + 전략 교체
 *  - carrot-keep: 당근만. 목표·전략은 그대로 (효과가 애매해서 1주 더 지켜볼 때)
 *  - keep-easier: 같은 전략 유지 + 난이도 한 단계 낮춤
 *  - goal-down: 목표 하향 (회복 모드)
 *  - whip: 채찍 (한도 안에서 한 단계씩. 한도는 #28 이 지킵니다)
 */
export type CareAction =
  | 'recovery-first'
  | 'carrot-raise'
  | 'carrot-change-strategy'
  | 'carrot-keep'
  | 'keep-easier'
  | 'goal-down'
  | 'whip'

export interface CareDecision {
  action: CareAction
  /** "왜 이렇게 됐는지"를 한국어 한 줄로 설명합니다. (#94 에서 사용자에게 보여줍니다) */
  reason: string
}

// 이 일수 이상 연속으로 못 채우면 회복 모드를 우선합니다. (기획서: 3일 연속 미달)
const RECOVERY_MISS_DAYS = 3

// 못 채운 원인 중 "계획이나 몸 상태 때문"인 것들 → 사람을 다그치지 않고 목표를 낮춥니다.
const GOAL_DOWN_CAUSES: MissCause[] = ['overplan', 'tired', 'sick', 'event']
// 못 채운 원인 중 "행동 습관 때문"인 것들 → 채찍(한도 안에서 한 단계씩)
const WHIP_CAUSES: MissCause[] = ['phone', 'lazy']

/**
 * 대응을 정합니다. 위에서부터 차례로 따지고, 먼저 맞는 줄에서 끝냅니다.
 *
 * 0) 3일 연속 미달 또는 기분 저하 → 회복 모드 우선, 채찍 금지  (아래 표보다 **가장 먼저** 검사)
 *      예) 3일 연속 미달, 폰 때문에 못 함   → recovery-first  (원래라면 whip 이지만 막습니다)
 *      예) 기분 저하, 오늘은 잘 했음         → recovery-first  (잘 한 날도 회복 모드가 먼저)
 *      예) 2일 연속 미달 → 아직 3일이 아니므로 아래 표로 갑니다
 *
 * 1) 잘 시행(good)
 *      효과 있음  → carrot-raise            예) good + effective → 당근, 목표 10% 상향
 *      효과 없음  → carrot-change-strategy  예) good + noEffect  → 당근(노력 인정), 전략 교체
 *      효과 애매  → carrot-keep             예) good + unclear   → 당근만. 근거 없이 목표를 올리지 않고 1주 더 지켜봅니다
 *
 * 2) 부분 시행(partial) → keep-easier       예) partial → 같은 전략 유지, 난이도 한 단계 낮춤
 *
 * 3) 못 시행(poor)
 *      원인이 계획 과다·피곤·아픔·행사 → goal-down   예) poor + tired   → 목표 하향
 *      원인이 폰·하기 싫음              → whip        예) poor + phone → 채찍
 *      원인이 기타이거나 안 골랐음      → goal-down   예) poor + etc   → 목표 하향 (아래 참고)
 *
 * 원인을 모를 때(기타·미선택)는 채찍 대신 목표 하향을 고릅니다. 이유 없이 다그치는 쪽이
 * 더 위험하다고 보고 정한 규칙입니다. (이슈에 정해진 값이 없어서 팀에서 바꿀 수 있습니다)
 */
export function decideCareAction(input: CareDecisionInput): CareDecision {
  const { fulfillment, effect, mainMissCause, consecutiveMissDays, isMoodLow } = input

  // 0) 회복 모드 우선: 다른 어떤 조건보다 먼저
  if (consecutiveMissDays >= RECOVERY_MISS_DAYS || isMoodLow) {
    return {
      action: 'recovery-first',
      reason: isMoodLow
        ? '요즘 기분이 많이 가라앉아 보여서, 오늘은 다그치지 않고 회복부터 도울게요.'
        : `${consecutiveMissDays}일 연속 계획을 못 채워서, 오늘은 다그치지 않고 회복부터 도울게요.`,
    }
  }

  // 1) 잘 시행
  if (fulfillment === 'good') {
    if (effect === 'effective') {
      return {
        action: 'carrot-raise',
        reason: '잘 지켰고 효과도 있었어요. 목표를 10% 올려 볼게요.',
      }
    }
    if (effect === 'noEffect') {
      return {
        action: 'carrot-change-strategy',
        reason: '잘 지켰는데 효과가 없었어요. 노력한 건 맞으니, 방법을 바꿔 볼게요.',
      }
    }
    return { action: 'carrot-keep', reason: '잘 지켰어요. 효과는 아직 애매해서 1주 더 지켜볼게요.' }
  }

  // 2) 부분 시행
  if (fulfillment === 'partial') {
    return {
      action: 'keep-easier',
      reason: '일부는 지켰어요. 같은 방법으로 두고, 난이도만 한 단계 낮출게요.',
    }
  }

  // 3) 못 시행: 원인으로 나눕니다.
  if (mainMissCause !== null && WHIP_CAUSES.includes(mainMissCause)) {
    return {
      action: 'whip',
      reason: '폰이나 미루는 습관 때문에 못 지켰어요. 오늘은 한 단계 더 따끔하게 말할게요.',
    }
  }
  if (mainMissCause !== null && GOAL_DOWN_CAUSES.includes(mainMissCause)) {
    return {
      action: 'goal-down',
      reason: '계획이 많았거나 몸이 힘들었던 것 같아요. 오늘은 목표를 낮출게요.',
    }
  }
  return {
    action: 'goal-down',
    reason: '못 지킨 이유를 아직 몰라서, 오늘은 다그치지 않고 목표를 낮출게요.',
  }
}
