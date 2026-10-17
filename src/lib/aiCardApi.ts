import { ApiError, api } from '@/lib/api'
import { isServerDataMode } from '@/lib/dataMode'

/**
 * 카드에 쓰는 작은 AI 기능을 서버에 부탁합니다. (#413, BE `POST /ai/checklist` · `POST /ai/first-step`)
 * AI 키는 서버에만 있고, 글 모델은 gpt-6-luna 입니다. 숫자 판정에는 쓰지 않고 문장만 받습니다.
 *
 * - 테스트 로그인(가짜 토큰)이면 서버에 묻지 않고 null 을 돌려줍니다. 화면은 기본 문장(템플릿)을 씁니다.
 * - 서버가 null 을 주거나(AI 가 못 만듦 · 하루 한도) 연결이 안 되면 역시 null → 기본 문장
 * - showHelp 가 true 면 글에 위기 표현이 있어서 AI 를 쓰지 않은 것입니다.
 */

/** 서버가 GPT 를 최대 10초 기다리므로 그보다 조금 더 기다립니다. 카운트다운은 그동안 기본 문장으로 갑니다. */
const REQUEST_TIMEOUT_MS = 12000

export interface FirstStepRequest {
  /** 체크리스트 첫 항목 (100자까지) */
  item: string
  /** 카드 제목 */
  title?: string
  /** [더 작게] 를 누른 횟수 0 ~ 2 */
  level: number
  /** [더 작게] 를 누르기 전에 보여 준 행동 (40자까지) */
  previousStep?: string
}

/**
 * 체크리스트 첫 항목을 아주 작은 준비 행동 하나로 바꿔 달라고 합니다. 못 받으면 null.
 *
 *   await requestFirstStep({ item: '42~45쪽 문제 풀기', title: '수학 문제집', level: 0 })
 *     -> '수학 문제집 42쪽 펴기'   (테스트 로그인 · AI 꺼짐 · 실패면 null)
 */
export async function requestFirstStep(input: FirstStepRequest): Promise<string | null> {
  if (!isServerDataMode()) return null
  const item = input.item.trim().slice(0, 100)
  if (item === '') return null
  try {
    const result = await api<unknown>('/ai/first-step', {
      method: 'POST',
      body: JSON.stringify({
        item,
        ...(input.title ? { title: input.title.slice(0, 200) } : {}),
        level: Math.min(2, Math.max(0, input.level)),
        ...(input.previousStep ? { previousStep: input.previousStep.slice(0, 40) } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const record = (typeof result === 'object' && result !== null ? result : {}) as Record<
      string,
      unknown
    >
    if (record.showHelp === true) return null
    return typeof record.step === 'string' && record.step.trim() !== '' ? record.step.trim() : null
  } catch (error) {
    // 401 은 api() 가 이미 로그인 화면으로 보냅니다. 그 밖의 실패는 기본 문장으로 조용히 넘어갑니다.
    if (error instanceof ApiError && error.status === 401) throw error
    return null
  }
}

/**
 * 카드 제목(과 목표)으로 체크리스트 항목을 추천받습니다. 못 받으면 null. (카드 폼 #392 에서 씁니다)
 *
 *   await requestChecklist('수학 문제집') -> ['42~45쪽 문제 풀기', '틀린 문제 표시하기', '채점하기']
 */
export async function requestChecklist(title: string, goal?: string): Promise<string[] | null> {
  if (!isServerDataMode()) return null
  const trimmed = title.trim().slice(0, 200)
  if (trimmed === '') return null
  try {
    const result = await api<unknown>('/ai/checklist', {
      method: 'POST',
      body: JSON.stringify({ title: trimmed, ...(goal ? { goal: goal.slice(0, 100) } : {}) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const record = (typeof result === 'object' && result !== null ? result : {}) as Record<
      string,
      unknown
    >
    if (record.showHelp === true || !Array.isArray(record.items)) return null
    const items = record.items.filter(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    )
    return items.length > 0 ? items : null
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw error
    return null
  }
}
