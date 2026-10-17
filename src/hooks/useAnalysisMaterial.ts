import { useState } from 'react'
import { useCards } from '@/hooks/useCards'
import { ANALYSIS_DAYS, buildAnalysisFacts, type AnalysisMaterial } from '@/lib/analysisFacts'
import { buildJudgedCardDays } from '@/lib/cardDays'
import { loadCardMarks } from '@/lib/cardMarks'
import { loadAllSessions } from '@/lib/dailyRecords'
import { getTodayKey, moveDateKey } from '@/lib/date'
import { loadExperiments } from '@/lib/experiments'
import { loadFixedBlocks } from '@/lib/fixedBlocks'
import { checkHypotheses } from '@/lib/hypothesisCheck'
import { loadCheckInsByDate } from '@/lib/insightEvidence'
import { loadMyHypotheses } from '@/lib/myHypotheses'
import { getCardDayMarkInfo, loadRestDays } from '@/lib/restDays'
import { loadPredictions } from '@/lib/weeklyPrediction'

/**
 * AI 자기 분석에 넣을 숫자 묶음을 저장소의 기록으로 만듭니다. (lib/analysisFacts.ts)
 * 기록은 화면을 열 때 한 번만 읽습니다. 읽기만 하고 아무것도 저장하지 않습니다.
 *
 *   const { facts, topFailCause } = useAnalysisMaterial()
 */
export function useAnalysisMaterial(): AnalysisMaterial {
  // 카드는 다른 화면이나 서버 맞추기로 바뀌면 다시 읽습니다. (useCards)
  const { cards } = useCards()
  const [stored] = useState(() => ({
    sessions: loadAllSessions(),
    restDays: loadRestDays(),
    marks: loadCardMarks(),
    fixedBlocks: loadFixedBlocks(),
    checkIns: loadCheckInsByDate(),
    hypotheses: loadMyHypotheses(),
    predictions: loadPredictions(),
    experiments: loadExperiments(),
    // 판정에 쓰는 '지금'. 화면을 열 때 한 번 정합니다.
    now: Date.now(),
  }))
  const todayKey = getTodayKey()

  const judgedDays = buildJudgedCardDays(
    cards,
    stored.sessions,
    moveDateKey(todayKey, -(ANALYSIS_DAYS - 1)),
    todayKey,
    stored.now,
    (cardId, dateKey) => getCardDayMarkInfo(cardId, dateKey, stored.restDays, stored.marks),
  )

  return buildAnalysisFacts({
    cards,
    sessions: stored.sessions,
    judgedDays,
    fixedBlocks: stored.fixedBlocks,
    checkIns: stored.checkIns,
    hypothesisChecks: stored.hypotheses
      ? checkHypotheses(stored.hypotheses, {
          cards,
          sessions: stored.sessions,
          judgedDays,
          todayKey,
        })
      : [],
    predictions: stored.predictions,
    experiments: stored.experiments,
    todayKey,
  })
}
