import { moveDateKey, isDateKey } from '@/lib/date'
import { suggestRoutineCards } from '@/lib/goals'
import { loadData } from '@/lib/storage'
import type { Card, Goal, GoalKind } from '@/types'

/**
 * 목표 만들기 화면(WOOP 순서, #391)에서 쓰는 순수 함수들입니다.
 * 화면은 pages/GoalNewPage.tsx 입니다.
 */

/** WOOP 단계 — W 소망 · O 결과 · O 방해물 · P 계획 */
export type GoalStep = 'wish' | 'outcome' | 'obstacle' | 'plan'

export const GOAL_STEPS: { step: GoalStep; letter: string; label: string }[] = [
  { step: 'wish', letter: 'W', label: '소망' },
  { step: 'outcome', letter: 'O', label: '결과' },
  { step: 'obstacle', letter: 'O', label: '방해물' },
  { step: 'plan', letter: 'P', label: '계획' },
]

/** 주소의 ?step= 이 진짜 단계 이름인지 */
export function isGoalStep(value: string): value is GoalStep {
  return GOAL_STEPS.some((item) => item.step === value)
}

/** 만드는 중인 목표. 입력칸은 모두 글자로 들고 있다가 저장할 때 buildGoal 로 바꿉니다. */
export interface GoalDraft {
  kind: GoalKind
  title: string
  dDay: string
  currentScore: string
  /** 완주형 전체 분량 (입력칸 글자 그대로) */
  totalAmount: string
  amountUnit: string
  benefit: string
  cost: string
  obstacle: string
  plan: string
}

// 하다 만 목표를 넣어 두는 이름입니다. (새로고침해도 이어서 쓰게. 실제 키는 'study-goal-draft')
export const GOAL_DRAFT_KEY = 'goal-draft'

export function createEmptyGoalDraft(): GoalDraft {
  return {
    kind: 'score',
    title: '',
    dDay: '',
    currentScore: '',
    totalAmount: '',
    amountUnit: '쪽',
    benefit: '',
    cost: '',
    obstacle: '',
    plan: '',
  }
}

/** 저장해 둔 하다 만 목표를 불러옵니다. 없거나 모양이 틀린 칸은 빈 값으로 채웁니다. */
export function loadGoalDraft(): GoalDraft {
  const empty = createEmptyGoalDraft()
  const saved = loadData<unknown>(GOAL_DRAFT_KEY, null)
  if (typeof saved !== 'object' || saved === null) return empty
  const record = saved as Record<string, unknown>
  // 글자가 아닌 칸은 빈 값으로 둡니다.
  const text = (key: Exclude<keyof GoalDraft, 'kind'>): string => {
    const value = record[key]
    return typeof value === 'string' ? value : empty[key]
  }
  return {
    kind: record.kind === 'completion' ? 'completion' : 'score',
    title: text('title'),
    dDay: text('dDay'),
    currentScore: text('currentScore'),
    totalAmount: text('totalAmount'),
    amountUnit: text('amountUnit'),
    benefit: text('benefit'),
    cost: text('cost'),
    obstacle: text('obstacle'),
    plan: text('plan'),
  }
}

/** '300' → 300. 1 이상의 정수가 아니면 null */
function parseAmount(text: string): number | null {
  const amount = Number(text)
  return text.trim() !== '' && Number.isInteger(amount) && amount >= 1 ? amount : null
}

/**
 * 그 단계에서 틀린 칸과 안내 문구. 빈 객체면 다음 단계로 가도 됩니다.
 *
 *   wish: 제목 · D-day(내일부터) · 점수형이면 지금 점수, 완주형이면 전체 분량(1 이상 정수)과 단위
 *   outcome: 이루면 좋은 점 · 안 하면 생길 일 / obstacle: 방해물 / plan: 대처
 *
 *   getStepErrors({ title: '', dDay: '2026-10-16', … }, 'wish', '2026-10-17')
 *     -> { title: '목표를 한 줄로 적어 주세요', dDay: 'D-day 는 내일 이후로 골라 주세요', … }
 */
export function getStepErrors(
  draft: GoalDraft,
  step: GoalStep,
  todayKey: string,
): Partial<Record<keyof GoalDraft, string>> {
  const errors: Partial<Record<keyof GoalDraft, string>> = {}
  const blank = (text: string) => text.trim() === ''
  if (step === 'wish') {
    if (blank(draft.title)) errors.title = '목표를 한 줄로 적어 주세요'
    if (!isDateKey(draft.dDay) || draft.dDay < moveDateKey(todayKey, 1)) {
      errors.dDay = 'D-day 는 내일 이후로 골라 주세요'
    }
    if (draft.kind === 'score' && blank(draft.currentScore)) {
      errors.currentScore = '지금 점수나 등급을 적어 주세요'
    }
    if (draft.kind === 'completion') {
      if (parseAmount(draft.totalAmount) === null)
        errors.totalAmount = '전체 분량을 숫자로 적어 주세요'
      if (blank(draft.amountUnit)) errors.amountUnit = '단위를 적어 주세요'
    }
  }
  if (step === 'outcome') {
    if (blank(draft.benefit)) errors.benefit = '이루면 좋은 점을 적어 주세요'
    if (blank(draft.cost)) errors.cost = '안 하면 생길 일을 적어 주세요'
  }
  if (step === 'obstacle' && blank(draft.obstacle)) {
    errors.obstacle = '내 안의 방해물을 하나 골라 주세요'
  }
  if (step === 'plan' && blank(draft.plan)) errors.plan = '방해물이 생기면 어떻게 할지 적어 주세요'
  return errors
}

/** 아직 다 채우지 않은 첫 단계. 모두 채웠으면 null (주소로 단계를 건너뛰어 들어오는 것을 막을 때 씁니다) */
export function getFirstIncompleteStep(draft: GoalDraft, todayKey: string): GoalStep | null {
  const found = GOAL_STEPS.find(
    (item) => Object.keys(getStepErrors(draft, item.step, todayKey)).length > 0,
  )
  return found ? found.step : null
}

/**
 * 다 채운 초안을 목표로 바꿉니다. 유형에 맞지 않는 칸(점수형의 분량 등)은 넣지 않습니다.
 *
 *   buildGoal({ kind: 'completion', title: ' 영단어장 1회독 ', totalAmount: '300', amountUnit: '쪽', … }, 'g1', 1000)
 *     -> { id: 'g1', kind: 'completion', title: '영단어장 1회독', totalAmount: 300, amountUnit: '쪽',
 *          status: 'active', history: [], createdAt: 1000, … }
 */
export function buildGoal(draft: GoalDraft, id: string, now: number): Goal {
  const isScore = draft.kind === 'score'
  return {
    id,
    kind: draft.kind,
    title: draft.title.trim(),
    dDay: draft.dDay,
    ...(isScore
      ? { currentScore: draft.currentScore.trim() }
      : {
          totalAmount: parseAmount(draft.totalAmount) ?? 1,
          amountUnit: draft.amountUnit.trim(),
        }),
    benefit: draft.benefit.trim(),
    cost: draft.cost.trim(),
    obstacle: draft.obstacle.trim(),
    plan: draft.plan.trim(),
    status: 'active',
    history: [],
    createdAt: now,
  }
}

/**
 * [목표 저장] 을 눌렀을 때: 초안 → 목표 + 고른 루틴 카드. 카드는 그 목표에 이어집니다(goalId).
 * pickedIndexes 는 루틴 카드 제안(lib/goals.ts 의 suggestRoutineCards) 중 고른 번호입니다.
 * now 를 안 넘기면 지금 시각입니다. (예시처럼 시각을 넘기면 결과가 늘 같아서 확인하기 쉽습니다)
 *
 *   createGoalWithCards(초안, [0], '2026-10-17', 1000)
 *     -> { goal: { id: 'goal-1000', … }, cards: [ 평일 루틴 카드 (goalId: 'goal-1000') ] }
 */
export function createGoalWithCards(
  draft: GoalDraft,
  pickedIndexes: number[],
  todayKey: string,
  now: number = Date.now(),
): { goal: Goal; cards: Card[] } {
  const goal = buildGoal(draft, `goal-${now}`, now)
  const suggestions = suggestRoutineCards(goal, todayKey, now)
  return { goal, cards: suggestions.filter((_, index) => pickedIndexes.includes(index)) }
}
