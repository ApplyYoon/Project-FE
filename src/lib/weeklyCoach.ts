/**
 * 주간 리포트 맨 위의 "코치 한 문단" 을 만드는 규칙입니다. (#249)
 *
 * 숫자는 코드가(lib/facts.ts), 말은 AI 가 맡습니다. AI 에게는 여기서 고른 숫자만 주고 "사람 말로 풀어 달라" 고 합니다.
 * AI 가 없을 때(서버 연결 전 · 실패)는 이 파일이 숫자를 끼워 넣어 만든 "기본 문장" 을 보여줍니다. 그래서 문단은 항상 나옵니다.
 *
 * - getCoachSummary : 기본 문장과 근거 숫자를 만듭니다. (React·서버 없이 돌아가는 순수 함수)
 * - weeklyCoachQuery : 서버에 AI 문단을 물어보는 쿼리 설정입니다. (docs/DATA-FETCHING.md)
 *
 * ⚠️ 서버에는 "계산된 숫자" 만 보냅니다. 계획 내용·일기·이름 같은 원문은 보내지 않습니다.
 */
import { api } from '@/lib/api'
import type { Facts } from '@/lib/facts'
import { queryOptions } from '@tanstack/react-query'

/** 목표가 있는 타이머가 이만큼은 있어야 문단을 만듭니다. 이보다 적으면 "기록이 더 쌓이면 이야기해 줄게" 를 보여줍니다. */
export const MIN_SAMPLES_FOR_COACH = 5
/** 요일 하나를 "눈에 띈다" 고 말하려면, 그 요일에 목표가 있는 타이머가 이만큼은 있어야 합니다. */
export const MIN_WEEKDAY_SAMPLES = 2
/** 그 요일의 완주율이 전체보다 이만큼(%p) 이상 낮아야 "눈에 띈다" 고 말합니다. */
export const WEEKDAY_GAP = 20
/** 평균 시작 지연이 이 값(분)을 넘으면 "시작이 늦다" 는 이야기를 합니다. */
export const LATE_START_MINUTES = 15

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

/** 문단에 쓰인 숫자 하나. "근거 숫자 보기" 에 그대로 보여줍니다. */
export interface CoachEvidence {
  /** 무슨 숫자인지 (예: '완주율') */
  label: string
  /** 화면에 보여줄 값 (예: '55%', '평균 23분') */
  value: string
  /** 이 숫자를 몇 개의 기록으로 계산했는지 (예: '20번') */
  basis: string
}

/** 기본 문장과 그 근거 */
export interface CoachSummary {
  /** 문단을 이루는 문장들. 순서대로 이어 붙여 보여줍니다. */
  sentences: string[]
  /** 문장에 쓰인 숫자들 */
  evidence: CoachEvidence[]
}

/**
 * 이번 주와 지난주의 팩트로 "기본 문장" 을 만듭니다. 기록이 모자라면 null 입니다.
 *
 * ■ 규칙
 *  0. 이번 주에 목표가 있는 타이머가 5번 미만이면 문단을 만들지 않습니다. (null)
 *  1. 계획 대비 실제를 계산할 수 있으면 첫 문장으로 말합니다. 지난주 값도 있고 다르면 얼마나 오르내렸는지 덧붙입니다.
 *  2. 완주율을 "몇 번 중 몇 번" 과 함께 말합니다.
 *  3. 눈에 띄는 요일: 타이머가 2번 이상 있는 요일 중 완주율이 가장 낮고, 전체보다 20%p 이상 낮은 요일 하나.
 *     그런 요일이 없으면 이 문장은 넣지 않습니다.
 *  4. 마지막 문장(권하는 말)은 위에서부터 처음 맞는 것 하나입니다.
 *       중간에 멈춘 타이머가 2번 이상  → 멈춘 지점을 말하고 "목표를 조금 짧게" 를 권합니다
 *       평균 시작 지연이 15분 넘음     → 지연을 말하고 "시작 시각에 알림" 을 권합니다
 *       그 밖                          → "이만큼만 이어 가자" 고 합니다
 *  문장에 쓴 숫자는 모두 evidence 에 넣습니다. 평가하는 말("잘했어", "부족해")은 쓰지 않습니다.
 *
 * ■ 예시 (입력 → 결과)
 *
 *   예1) 이번 주: 계획 대비 64%(계획 12개), 완주율 55%(20번 중 11번), 화요일 40%(5번), 멈춘 지점 62%(9번)
 *        지난주: 계획 대비 56%
 *        -> 이번 주는 계획의 64% 를 했어. 지난주보다 8%p 올랐어.
 *           목표를 정한 타이머 20번 중 11번을 끝까지 했어. (완주율 55%)
 *           눈에 띄는 건 화요일이야. 화요일 완주율은 40% 로 전체보다 15%p… → 20%p 미만이라 이 문장은 빠집니다.
 *           중간에 멈춘 타이머는 목표의 62% 쯤에서 멈췄어. 다음엔 목표를 조금 짧게 잡아 보면 어때?
 *
 *   예2) 위와 같은데 화요일 완주율이 20%(5번)
 *        -> … 눈에 띄는 건 화요일이야. 화요일 완주율은 20% 로 전체(55%)보다 낮아. …
 *
 *   예3) 계획 대비 90%, 완주율 100%(6번 중 6번), 시작 지연 23분(계획 4개), 멈춘 타이머 없음
 *        -> 이번 주는 계획의 90% 를 했어. 목표를 정한 타이머 6번 중 6번을 끝까지 했어. (완주율 100%)
 *           계획한 시각보다 평균 23분 늦게 시작했어. 시작 시각에 알림을 맞춰 두면 어때?
 *
 *   예4) 계획 대비 90%, 완주율 100%(6번), 시작 지연 5분, 멈춘 타이머 없음
 *        -> … 지금 흐름이 좋아. 다음 주도 이만큼만 이어 가 보자.
 *
 *   예5) 목표가 있는 타이머가 4번뿐
 *        -> null
 *
 *   예6) 계획이 없던 주(계획 대비 null), 완주율 60%(5번 중 3번)
 *        -> 첫 문장 없이 "목표를 정한 타이머 5번 중 3번을 끝까지 했어. (완주율 60%)" 부터 시작합니다.
 */
export function getCoachSummary(thisWeek: Facts, lastWeek: Facts): CoachSummary | null {
  const completion = thisWeek.completionRate
  // 규칙 0
  if (completion.value === null || completion.sampleCount < MIN_SAMPLES_FOR_COACH) return null

  const sentences: string[] = []
  const evidence: CoachEvidence[] = []

  // 규칙 1: 계획 대비 실제
  const planRate = thisWeek.planRate
  if (planRate.value !== null) {
    sentences.push(`이번 주는 계획의 ${planRate.value}% 를 했어.`)
    evidence.push({
      label: '계획 대비 실제',
      value: `${planRate.value}%`,
      basis: `계획 ${planRate.sampleCount}개`,
    })

    const lastPlanRate = lastWeek.planRate.value
    if (lastPlanRate !== null && lastPlanRate !== planRate.value) {
      const gap = planRate.value - lastPlanRate
      sentences.push(`지난주보다 ${Math.abs(gap)}%p ${gap > 0 ? '올랐어' : '내렸어'}.`)
      evidence.push({
        label: '지난주 계획 대비 실제',
        value: `${lastPlanRate}%`,
        basis: `계획 ${lastWeek.planRate.sampleCount}개`,
      })
    }
  }

  // 규칙 2: 완주율
  sentences.push(
    `목표를 정한 타이머 ${completion.sampleCount}번 중 ${thisWeek.completedCount}번을 끝까지 했어. (완주율 ${completion.value}%)`,
  )
  evidence.push({
    label: '완주율',
    value: `${completion.value}%`,
    basis: `${completion.sampleCount}번`,
  })

  // 규칙 3: 눈에 띄는 요일 (완주율이 가장 낮은 요일)
  let weakWeekday = -1
  let weakRate = 101
  thisWeek.completionByWeekday.forEach((fact, weekday) => {
    if (fact.value === null || fact.sampleCount < MIN_WEEKDAY_SAMPLES) return
    if (fact.value < weakRate) {
      weakRate = fact.value
      weakWeekday = weekday
    }
  })
  if (weakWeekday !== -1 && completion.value - weakRate >= WEEKDAY_GAP) {
    const name = WEEKDAY_NAMES[weakWeekday]
    sentences.push(
      `눈에 띄는 건 ${name}이야. ${name} 완주율은 ${weakRate}% 로 전체(${completion.value}%)보다 낮아.`,
    )
    evidence.push({
      label: `${name} 완주율`,
      value: `${weakRate}%`,
      basis: `${thisWeek.completionByWeekday[weakWeekday].sampleCount}번`,
    })
  }

  // 규칙 4: 권하는 말 (처음 맞는 것 하나)
  const stopPoint = thisWeek.stopPoint
  const delay = thisWeek.startDelayMinutes
  if (stopPoint.value !== null && stopPoint.sampleCount >= 2) {
    sentences.push(
      `중간에 멈춘 타이머는 목표의 ${stopPoint.value}% 쯤에서 멈췄어. 다음엔 목표를 조금 짧게 잡아 보면 어때?`,
    )
    evidence.push({
      label: '멈추는 지점',
      value: `목표의 ${stopPoint.value}%`,
      basis: `${stopPoint.sampleCount}번`,
    })
  } else if (delay.value !== null && delay.value > LATE_START_MINUTES) {
    sentences.push(
      `계획한 시각보다 평균 ${delay.value}분 늦게 시작했어. 시작 시각에 알림을 맞춰 두면 어때?`,
    )
    evidence.push({
      label: '시작 지연',
      value: `평균 ${delay.value}분`,
      basis: `계획 ${delay.sampleCount}개`,
    })
  } else {
    sentences.push('지금 흐름이 좋아. 다음 주도 이만큼만 이어 가 보자.')
  }

  return { sentences, evidence }
}

/* ---------- 서버에 AI 문단 물어보기 ----------
 *
 * ⚠️ 서버 API 는 아직 없습니다. 아래 주소·모양은 FE 가 먼저 적어 본 것이고, BE(#87)와 정해지면 여기만 고치면 됩니다.
 *   요청  POST /coach/weekly   { mondayKey, numbers: [{ label, value, basis }], maxCareLevel, maxHarshness }
 *   응답  { "paragraph": "이번 주는 계획의 64% 를 했어. …" }
 *
 * - numbers 는 위의 evidence 그대로입니다. AI 는 이 숫자만 가지고 문단을 씁니다. (숫자를 새로 만들면 안 됩니다)
 * - maxCareLevel · maxHarshness 는 설정에서 정한 한도입니다. 말투가 이 한도를 넘지 않게 하는 것은 서버의 일입니다.
 */

/** AI 문단을 물어볼 때 서버에 보내는 값 */
export interface WeeklyCoachRequest {
  /** 어느 주인지 (그 주의 월요일 'YYYY-MM-DD') */
  mondayKey: string
  /** 문단에 써도 되는 숫자들 */
  numbers: CoachEvidence[]
  /** 내가 정한 관리 강도 최대 한도 (0 ~ 4) */
  maxCareLevel: number
  /** 내가 허용한 독설 수위 (1 ~ 5) */
  maxHarshness: number
}

/** 서버 응답을 기다리는 최대 시간(밀리초). 서버가 멈춰도 기본 문장이 늦지 않게 뜨도록 짧게 잡습니다. */
const COACH_TIMEOUT_MS = 8000

/**
 * 서버에 AI 문단을 물어봅니다. 받지 못하면 에러를 던지지 않고 null 을 돌려줍니다.
 *
 * AI 문단은 "있으면 더 좋은 것" 입니다. 서버가 없거나 실패해도 화면은 기본 문장으로 계속 보여야 해서,
 * 실패를 에러로 다루지 않습니다. (null 이 오면 화면이 기본 문장을 보여줍니다)
 */
async function fetchWeeklyCoach(request: WeeklyCoachRequest): Promise<string | null> {
  try {
    const result = await api<unknown>('/coach/weekly', {
      method: 'POST',
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(COACH_TIMEOUT_MS),
    })
    const paragraph =
      typeof result === 'object' && result !== null
        ? (result as { paragraph?: unknown }).paragraph
        : null
    // 글자가 아니거나 비어 있으면 못 받은 것으로 봅니다.
    return typeof paragraph === 'string' && paragraph.trim() !== '' ? paragraph.trim() : null
  } catch {
    return null
  }
}

/**
 * AI 문단의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(weeklyCoachQuery(request)) 로 받아옵니다.
 * data 는 AI 가 쓴 문단(글자)이거나, 받지 못했을 때 null 입니다.
 *
 * - queryKey 에 숫자들까지 넣어서, 같은 주라도 기록이 늘어 숫자가 바뀌면 새로 물어봅니다.
 * - 한 번 받으면 30분 동안은 다시 묻지 않습니다. (같은 숫자로 같은 것을 또 물으면 돈만 듭니다)
 * - retry: false — 실패는 이미 null 로 바꿔 돌려주기 때문에 다시 시도할 일이 없습니다.
 */
export function weeklyCoachQuery(request: WeeklyCoachRequest) {
  return queryOptions({
    queryKey: [
      'weekly-coach',
      request.mondayKey,
      request.numbers,
      request.maxCareLevel,
      request.maxHarshness,
    ],
    queryFn: () => fetchWeeklyCoach(request),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
}
