/**
 * 저장된 기록을 모아 숲(lib/forest.ts)을 계산합니다. (#404) React 는 쓰지 않고 저장소만 읽습니다.
 *
 *   카드 · 공부 기록 · 목표           → 나무가 자란 시간
 *   카드 하루치 판정(cardDays.ts)     → 재발 신호(relapseSignal.ts) → 시듦 (전체 · 목표별)
 *   오늘 관리 단계(todayCare.ts)      → 0단계(회복 모드)면 시들지 않음
 *   주간 회고 · 인사이트 반응          → 잎
 *   나 사용설명서 · 효과 본 실험       → 열매 (전체 · 목표별)
 */
import { buildJudgedCardDays } from '@/lib/cardDays'
import { loadSavedCards } from '@/lib/cards'
import { loadAllSessions } from '@/lib/dailyRecords'
import { moveDateKey } from '@/lib/date'
import { loadExperiments } from '@/lib/experiments'
import { getForestState, type ForestState } from '@/lib/forest'
import { loadGoals } from '@/lib/goals'
import { getInsightResponses } from '@/lib/insightResponses'
import { BASELINE_DAYS, RECENT_DAYS, getRelapseSignal } from '@/lib/relapseSignal'
import { getCardDayMarkInfo, loadRestDays } from '@/lib/restDays'
import { loadCardMarks } from '@/lib/cardMarks'
import { getTodayCareLevel } from '@/lib/todayCare'
import { loadWeeklyReviews } from '@/lib/weeklyReview'

/**
 * 오늘의 숲을 계산합니다. manualItemCount 는 나 사용설명서 항목 수입니다.
 * (사용설명서를 읽는 함수가 hooks/useManualItems.ts 에 있어서, lib 이 React 파일을 부르지 않게 화면에서 넘겨받습니다)
 *
 * 시듦은 재발 신호로만 정합니다. 신호는 "어제부터 새로 생긴 미실행" 을 봅니다(sinceKey = 어제).
 * 그래서 다시 카드를 실행해 최근 두 번이 연속 미실행이 아니게 되면 바로 회복합니다.
 * 실행률이 기준선보다 떨어진 것(②)은 최근 7일 기준이라, 실행률이 돌아오는 만큼 천천히 회복합니다.
 */
export function loadForestState(
  todayKey: string,
  now: number,
  manualItemCount: number,
): ForestState {
  const cards = loadSavedCards() ?? []
  const sessions = loadAllSessions()
  const goals = loadGoals()
  const restDays = loadRestDays()
  const marks = loadCardMarks()

  // 재발 신호 ② 가 최근 7일과 그 앞 14일(기준선)을 비교해서, 그만큼의 판정을 만듭니다.
  const fromKey = moveDateKey(todayKey, -(RECENT_DAYS + BASELINE_DAYS - 1))
  const days = buildJudgedCardDays(cards, sessions, fromKey, todayKey, now, (cardId, dateKey) =>
    getCardDayMarkInfo(cardId, dateKey, restDays, marks),
  )
  const sinceKey = moveDateKey(todayKey, -1)
  const hasRelapse = getRelapseSignal(days, todayKey, sinceKey).hasSignal

  // 목표마다 그 목표 카드의 판정만으로 재발 신호를 봅니다.
  const goalRelapse: Record<string, boolean> = {}
  const goalFruitCount: Record<string, number> = {}
  const experiments = loadExperiments()
  for (const goal of goals) {
    const cardIds = new Set(cards.filter((card) => card.goalId === goal.id).map((card) => card.id))
    const goalDays = days.filter((day) => cardIds.has(day.cardId))
    goalRelapse[goal.id] =
      goalDays.length > 0 && getRelapseSignal(goalDays, todayKey, sinceKey).hasSignal
    // 목표 나무의 열매 = 그 목표 카드에 붙여서 효과를 본 실험 수
    goalFruitCount[goal.id] = experiments.filter(
      (experiment) =>
        experiment.status === 'effective' &&
        experiment.cardIds.some((cardId) => cardIds.has(cardId)),
    ).length
  }

  return getForestState({
    cards,
    sessions,
    goals: goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      isFinished: goal.status !== 'active',
    })),
    hasRelapse,
    goalRelapse,
    isRecoveryMode: getTodayCareLevel() === 0,
    // 잎 = 건너뛰지 않고 쓴 주간 회고 수 + 인사이트에 반응한 수
    leafCount:
      loadWeeklyReviews().filter((review) => !review.skipped).length +
      Object.keys(getInsightResponses()).length,
    // 열매 = 나 사용설명서에 올라간 효과가 확인된 방법 수
    fruitCount: manualItemCount,
    goalFruitCount,
  })
}
