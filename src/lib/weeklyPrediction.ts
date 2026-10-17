import { loadList, saveData } from '@/lib/storage'
import type { WeeklyNumbers } from '@/lib/weeklyCardStats'

/**
 * 주간 리포트의 "예측 후 공개" 1문항 (최종 기획서 「4.6 분석」 · 「8.2」, #409)
 *
 * 숫자를 보여 주기 전에 먼저 맞혀 보게 합니다. 예측과 실제의 차이가 곧 왜곡의 크기라서
 * 반박할 거리가 없습니다 (선택적 기억 · 더닝-크루거, 7번 오류). 차이는 '예측 정확도' 로 저장합니다.
 */

/** 질문 4가지 — 실행률 · 평균 시작 지연 · 체크리스트 달성률 · 강의 대 자습 비율 */
export type PredictionKind = 'runRate' | 'startDelay' | 'checklistRate' | 'lectureRatio'

/** 주마다 이 순서로 돌아가며 냅니다 */
export const PREDICTION_ORDER: PredictionKind[] = [
  'runRate',
  'startDelay',
  'checklistRate',
  'lectureRatio',
]

/** 질문마다 단위와 1탭으로 고르는 보기 */
export const PREDICTION_OPTIONS: Record<PredictionKind, { unit: '%' | '분'; values: number[] }> = {
  runRate: { unit: '%', values: [20, 40, 60, 80, 100] },
  startDelay: { unit: '분', values: [0, 5, 10, 20, 30] },
  checklistRate: { unit: '%', values: [20, 40, 60, 80, 100] },
  lectureRatio: { unit: '%', values: [0, 25, 50, 75, 100] },
}

/**
 * 질문 글자. week 에는 "이번 주" · "지난주" 같은 말이 들어갑니다.
 *
 *   getPredictionQuestion('runRate', '지난주') -> '지난주 카드에 계획한 시간 중 실제로 공부한 건 몇 %였을 것 같아?'
 */
export function getPredictionQuestion(kind: PredictionKind, week: string): string {
  if (kind === 'runRate') return `${week} 카드에 계획한 시간 중 실제로 공부한 건 몇 %였을 것 같아?`
  if (kind === 'startDelay') return `${week} 카드를 평균 몇 분 늦게 시작했을 것 같아?`
  if (kind === 'checklistRate')
    return `${week} 시작한 카드의 체크리스트는 평균 몇 %나 해냈을 것 같아?`
  return `${week} 공부 시간 중 인강은 몇 %였을 것 같아? (나머지는 자습)`
}

/** 질문의 실제 값. 그 주 기록으로 계산할 수 없으면 null */
export function getActualValue(kind: PredictionKind, numbers: WeeklyNumbers): number | null {
  if (kind === 'runRate') return numbers.runRate
  if (kind === 'startDelay') return numbers.startDelayMinutes
  if (kind === 'checklistRate') return numbers.checklistRate
  return numbers.lectureRatio
}

// 돌아가며 내기의 기준 주 (2026-01-05 는 월요일). 이 주를 0번째 주로 셉니다.
const ROTATION_START_MONDAY = '2026-01-05'
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' 를 날짜 수로 바꿉니다. (Date.UTC 라서 시간대와 상관없이 하루 = 24시간입니다) */
function toDayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

/**
 * 그 주에 낼 질문을 고릅니다. 주마다 PREDICTION_ORDER 순서로 하나씩 돌아갑니다.
 * 그 주 기록으로 실제 값을 낼 수 없는 질문은 건너뛰고 다음 순서를 냅니다. 낼 수 있는 게 없으면 null 입니다.
 *
 *   pickPredictionKind('2026-01-05', 4가지 모두)                    -> 'runRate'      (0번째 주)
 *   pickPredictionKind('2026-01-12', 4가지 모두)                    -> 'startDelay'   (1번째 주)
 *   pickPredictionKind('2026-02-02', 4가지 모두)                    -> 'runRate'      (4번째 주 = 한 바퀴)
 *   pickPredictionKind('2026-01-26', ['runRate', 'checklistRate'])  -> 'runRate'      (3번째 주 인강 비율을 못 내서 다음 순서)
 *   pickPredictionKind('2026-01-05', [])                            -> null
 */
export function pickPredictionKind(
  mondayKey: string,
  available: PredictionKind[],
): PredictionKind | null {
  const weekIndex = Math.floor((toDayNumber(mondayKey) - toDayNumber(ROTATION_START_MONDAY)) / 7)
  const count = PREDICTION_ORDER.length
  for (let step = 0; step < count; step++) {
    const index = (weekIndex + step) % count
    // 기준 주보다 앞선 주는 나머지가 음수(-1 등)라서 count 를 더해 0 ~ 3 으로 맞춥니다.
    const kind = PREDICTION_ORDER[index < 0 ? index + count : index]
    if (available.includes(kind)) return kind
  }
  return null
}

/** 그 주 기록으로 실제 값을 낼 수 있는 질문들 */
export function getAvailableKinds(numbers: WeeklyNumbers): PredictionKind[] {
  return PREDICTION_ORDER.filter((kind) => getActualValue(kind, numbers) !== null)
}

/**
 * 예측 정확도 = 실제 − 예측. 0 이면 딱 맞힌 것이고, 양수면 실제가 예측보다 컸다는 뜻입니다.
 *
 *   getPredictionDiff(60, 72) -> 12     getPredictionDiff(80, 55) -> -25     getPredictionDiff(10, 10) -> 0
 */
export function getPredictionDiff(predicted: number, actual: number): number {
  return actual - predicted
}

/**
 * 차이를 한 문장으로. 잘했다 · 못했다는 말 없이 차이만 말합니다.
 *
 *   describePredictionDiff('runRate', 12)     -> '예상보다 12%p 높았어'
 *   describePredictionDiff('runRate', -25)    -> '예상보다 25%p 낮았어'
 *   describePredictionDiff('startDelay', 8)   -> '예상보다 8분 더 늦게 시작했어'
 *   describePredictionDiff('startDelay', -5)  -> '예상보다 5분 덜 늦었어'
 *   describePredictionDiff('lectureRatio', 0) -> '딱 맞혔어'
 */
export function describePredictionDiff(kind: PredictionKind, diff: number): string {
  if (diff === 0) return '딱 맞혔어'
  const size = Math.abs(diff)
  if (kind === 'startDelay') {
    return diff > 0 ? `예상보다 ${size}분 더 늦게 시작했어` : `예상보다 ${size}분 덜 늦었어`
  }
  return `예상보다 ${size}%p ${diff > 0 ? '높았어' : '낮았어'}`
}

/** 저장해 둔 예측 하나 (한 주에 하나) */
export interface WeeklyPrediction {
  /** 어느 주의 예측인지 (그 주 월요일 'YYYY-MM-DD') */
  weekStart: string
  kind: PredictionKind
  /** 내가 고른 값 (% 또는 분) */
  predicted: number
  /** 고른 순간의 실제 값 */
  actual: number
  /** 예측 정확도 = 실제 − 예측 */
  diff: number
  /** 고른 시각 (Date.now() 값) */
  answeredAt: number
}

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-predictions' 가 됩니다)
export const PREDICTIONS_KEY = 'predictions'

/** 저장소에서 꺼낸 값이 예측 모양이 맞는지 확인합니다. (깨진 값이 섞여도 화면이 멈추지 않게) */
function isWeeklyPrediction(value: unknown): value is WeeklyPrediction {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.weekStart === 'string' &&
    typeof item.kind === 'string' &&
    PREDICTION_ORDER.includes(item.kind as PredictionKind) &&
    typeof item.predicted === 'number' &&
    typeof item.actual === 'number'
  )
}

/** 저장된 예측을 모두 불러옵니다. */
export function loadPredictions(): WeeklyPrediction[] {
  return loadList<unknown>(PREDICTIONS_KEY).filter(isWeeklyPrediction)
}

/** 그 주의 예측. 아직 안 맞혔으면 undefined */
export function findPrediction(weekStart: string): WeeklyPrediction | undefined {
  return loadPredictions().find((prediction) => prediction.weekStart === weekStart)
}

/** 예측을 저장합니다. 같은 주의 예측이 있으면 바꿔 끼웁니다. */
export function savePrediction(prediction: WeeklyPrediction): void {
  const others = loadPredictions().filter((item) => item.weekStart !== prediction.weekStart)
  saveData(PREDICTIONS_KEY, [...others, prediction])
}
