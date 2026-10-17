import { loadData, saveData } from '@/lib/storage'

/**
 * [틀렸어] 를 누른 인사이트 (최종 기획서 「4.6 분석」 가설·인사이트, #411)
 *
 * [틀렸어] 를 눌러도 인사이트를 **숨기지 않습니다.** 숨기면 앱이 확증 편향을 거들게 되기 때문입니다.
 * 대신 "그럼 2주 확인해볼래?" 로 자기 실험을 제안하고, 실험 결과 사용자가 맞으면 "AI가 틀렸어요" 로 기록하고 철회합니다.
 *  - 실험이 '효과 있음' → 인사이트가 맞았음 (aiRight)
 *  - 실험이 '효과 없음' → 사용자가 맞았음, 인사이트 철회 (aiWrong)
 */

export interface InsightDispute {
  /** 그 인사이트 문장 (실험의 가설로 씁니다) */
  sentence: string
  /** 확인하려고 시작한 실험 id */
  experimentId?: string
  /** 실험으로 확인한 결과 */
  outcome?: 'aiWrong' | 'aiRight'
}

// 저장 이름 (실제 키는 'study-insight-disputes')
const STORAGE_KEY = 'insight-disputes'

export function loadInsightDisputes(): Record<string, InsightDispute> {
  const saved = loadData<unknown>(STORAGE_KEY, {})
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {}
  return saved as Record<string, InsightDispute>
}

/** 인사이트 하나의 다툼 기록을 고칩니다 (없으면 만듭니다) */
export function saveInsightDispute(insightId: string, changes: InsightDispute): void {
  const all = loadInsightDisputes()
  saveData(STORAGE_KEY, { ...all, [insightId]: { ...all[insightId], ...changes } })
}

/** 그 실험이 확인하던 인사이트 id. 없으면 undefined */
export function findDisputeByExperiment(experimentId: string): string | undefined {
  return Object.entries(loadInsightDisputes()).find(
    ([, dispute]) => dispute.experimentId === experimentId,
  )?.[0]
}

/**
 * 실험 결과로 다툼을 정리합니다. 알 수 없음(unclear)이면 그대로 둡니다.
 *
 *   resolveOutcome('effective') -> 'aiRight'   resolveOutcome('noEffect') -> 'aiWrong'   resolveOutcome('unclear') -> undefined
 */
export function resolveOutcome(
  status: 'effective' | 'noEffect' | 'unclear',
): InsightDispute['outcome'] {
  if (status === 'effective') return 'aiRight'
  if (status === 'noEffect') return 'aiWrong'
  return undefined
}
