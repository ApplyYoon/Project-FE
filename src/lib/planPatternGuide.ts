import { getRecentReportedCardDays } from '@/lib/cardForm'
import {
  getCheckedCount,
  getChecklistRate,
  getPlanPattern,
  type PlanPattern,
} from '@/lib/cardResult'
import type { Card, StudySession } from '@/types'

/**
 * 카드 탭 아래의 "계획 패턴 안내" (최종 기획서 「4.3 카드」 · 「5.3 계획 축」, #394).
 * 같은 목표 카드의 최근 4주 체크리스트 달성률과 판정(과대 / 적정 / 느슨), 카드별 예측과 실제를 만듭니다.
 * 판정 규칙은 lib/cardResult.ts 의 getPlanPattern 을 그대로 씁니다.
 */

/** 목표 없는 카드를 한데 모을 때 쓰는 이름 */
export const NO_GOAL_PATTERN_ID = 'none'

/** 상세 보기의 한 줄: 카드 하루치의 예측과 실제 */
export interface PlanPatternDay {
  cardId: string
  cardTitle: string
  dateKey: string
  /** 예상 달성 개수 (따로 안 적었으면 체크리스트 전부) */
  expected: number
  /** 실제로 체크한 개수 */
  checked: number
  /** 체크리스트 전체 개수 */
  total: number
}

/** 목표 하나의 계획 패턴 */
export interface GoalPlanPattern {
  /** 목표 id. 목표 없는 카드면 NO_GOAL_PATTERN_ID */
  goalId: string
  /** 최근 것부터 */
  days: PlanPatternDay[]
  /** 체크리스트 달성률 평균 (0 ~ 1). 하루치가 없으면 null */
  averageRate: number | null
  /** 과대 / 적정 / 느슨. 하루치가 5개보다 적으면 null */
  pattern: PlanPattern | null
}

/**
 * 목표마다 최근 4주 계획 패턴을 만듭니다. goalIds 순서대로 돌려주고, 목표 없는 카드(또는 끝난 목표의 카드)는 맨 뒤에 모읍니다.
 * 목표 없는 카드는 하루치가 하나라도 있을 때만 넣습니다.
 *
 *   목표 g1 카드 하루치 5개, 달성률 [0.5, 0.4, 0.6, 0.5, 0.7]
 *   getGoalPlanPatterns(cards, sessions, ['g1'], 오늘)
 *     -> [ { goalId: 'g1', averageRate: 0.54, pattern: 'over', days: [5개, 최근 것부터] } ]
 *   목표 g2 카드 하루치 2개 -> { goalId: 'g2', averageRate: …, pattern: null, … }   (아직 판정 안 함)
 */
export function getGoalPlanPatterns(
  cards: Card[],
  sessions: StudySession[],
  goalIds: string[],
  todayKey: string,
): GoalPlanPattern[] {
  const reportedDays = getRecentReportedCardDays(cards, sessions, todayKey)
  const groupIds = [...goalIds, NO_GOAL_PATTERN_ID]

  const patterns: GoalPlanPattern[] = []
  for (const groupId of groupIds) {
    const groupDays = reportedDays
      .filter((day) => {
        const goalId = day.card.goalId
        const isNoGoal = !goalId || !goalIds.includes(goalId)
        return groupId === NO_GOAL_PATTERN_ID ? isNoGoal : goalId === groupId
      })
      // 최근 것부터 봅니다.
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    if (groupId === NO_GOAL_PATTERN_ID && groupDays.length === 0) continue

    const rates = groupDays.map((day) => getChecklistRate(day))
    patterns.push({
      goalId: groupId,
      days: groupDays.map((day) => ({
        cardId: day.card.id,
        cardTitle: day.card.title,
        dateKey: day.dateKey,
        expected: day.card.expectedDone ?? day.card.checklist.length,
        checked: getCheckedCount(day),
        total: day.card.checklist.length,
      })),
      averageRate:
        rates.length === 0 ? null : rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
      pattern: getPlanPattern(rates),
    })
  }
  return patterns
}

/** 판정마다 보여 줄 이름과 한 줄. 혼내는 말이 아니라 계획 크기를 고칠 재료로 말합니다. (「5.3」) */
export const PLAN_PATTERN_TEXT: Record<PlanPattern, { label: string; message: string }> = {
  over: { label: '과대', message: '계획이 큰 편이에요. 체크리스트를 조금 줄여 볼까요?' },
  fit: { label: '적정', message: '계획 크기가 알맞아요. 이대로 가요.' },
  loose: { label: '느슨', message: '여유가 있어요. 항목을 하나 더 넣어 봐도 돼요.' },
}
