import type { CardFailCause } from '@/lib/cardMarks'

/**
 * 전략 카탈로그 — 자기 실험에서 고르는 방법들 (최종 기획서 「4.6 분석」 자기 실험, #412)
 *
 * MVP 는 10개로 시작합니다(나중에 30~50개, 팀이 글을 다듬음). 원인마다 쉬움 · 보통 · 강함 3개를 보여 주고 1개를 고릅니다.
 * 여기 글만 고치면 화면이 바로 바뀝니다. BE(Project-BE#50)도 같은 id 를 씁니다.
 */

export type StrategyLevel = 'easy' | 'normal' | 'hard'

export interface Strategy {
  id: string
  /** 어떤 원인을 겨냥한 방법인지 (원인 그룹) */
  group: StrategyGroup
  level: StrategyLevel
  /** 카드에 붙는 '실험 규칙' 한 줄 */
  rule: string
  /** 왜 이 방법인지 한 줄 */
  why: string
}

/** 원인 그룹 — 폰 · 시작이 어려움 · 계획이 큼 */
export type StrategyGroup = 'phone' | 'start' | 'plan'

export const STRATEGY_LEVEL_LABELS: Record<StrategyLevel, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '강함',
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'phone-flip',
    group: 'phone',
    level: 'easy',
    rule: '시작할 때 폰을 뒤집어 두기',
    why: '알림이 눈에 덜 띄면 손이 덜 갑니다.',
  },
  {
    id: 'phone-bag',
    group: 'phone',
    level: 'normal',
    rule: '시작할 때 폰을 가방에 넣기',
    why: '꺼내는 데 한 번 더 움직여야 하면 덜 꺼냅니다.',
  },
  {
    id: 'phone-room',
    group: 'phone',
    level: 'hard',
    rule: '시작할 때 폰을 다른 방에 두기',
    why: '손이 닿지 않는 곳이 가장 확실합니다.',
  },
  {
    id: 'start-first-line',
    group: 'start',
    level: 'easy',
    rule: '시작 시각에 체크리스트 첫 줄만 하기',
    why: '시작만 하면 이어 가기는 쉬워집니다.',
  },
  {
    id: 'start-countdown',
    group: 'start',
    level: 'normal',
    rule: '5초 카운트다운으로 시작하기',
    why: '고민할 틈 없이 몸이 먼저 움직이게 합니다.',
  },
  {
    id: 'start-desk',
    group: 'start',
    level: 'hard',
    rule: '시작 10분 전에 책상과 책을 미리 펴 두기',
    why: '준비가 끝나 있으면 미룰 핑계가 줄어듭니다.',
  },
  {
    id: 'plan-one-less',
    group: 'plan',
    level: 'easy',
    rule: '체크리스트를 하나 줄이기',
    why: '다 할 수 있는 크기여야 끝까지 갑니다.',
  },
  {
    id: 'plan-shorter',
    group: 'plan',
    level: 'normal',
    rule: '카드 길이를 10분 줄이기',
    why: '짧은 카드를 끝까지 하는 쪽이 실행률을 올립니다.',
  },
  {
    id: 'plan-split',
    group: 'plan',
    level: 'hard',
    rule: '큰 카드를 두 장으로 나눠 다른 날에 하기',
    why: '한 번에 몰지 않으면 지치지 않습니다.',
  },
  {
    id: 'proof-one-line',
    group: 'start',
    level: 'easy',
    rule: '끝나면 한 일을 한 줄로 남기기',
    why: '남길 것이 있으면 끝까지 하게 됩니다.',
  },
]

/**
 * 미실행 원인을 전략 그룹으로 묶습니다. 원인을 모르면 '시작이 어려움' 으로 봅니다.
 *
 *   getStrategyGroup('phone') -> 'phone'   getStrategyGroup('tooMuch') -> 'plan'   getStrategyGroup('unwilling') -> 'start'
 */
export function getStrategyGroup(cause: CardFailCause | undefined): StrategyGroup {
  if (cause === 'phone') return 'phone'
  if (cause === 'tooMuch' || cause === 'tired') return 'plan'
  return 'start'
}

/**
 * 그 원인에 맞는 쉬움 · 보통 · 강함 3개를 돌려줍니다. (같은 단계가 여럿이면 앞의 것)
 *
 *   getStrategiesFor('phone') -> [폰 뒤집기(쉬움), 가방(보통), 다른 방(강함)]
 */
export function getStrategiesFor(cause: CardFailCause | undefined): Strategy[] {
  const group = getStrategyGroup(cause)
  return (['easy', 'normal', 'hard'] as StrategyLevel[])
    .map((level) => STRATEGIES.find((item) => item.group === group && item.level === level))
    .filter((item): item is Strategy => item !== undefined)
}

export function findStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find((item) => item.id === id)
}
