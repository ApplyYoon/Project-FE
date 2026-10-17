import { formatMinutes, loadStudySessions, toDateKey } from '@/lib/dailyRecords'
import { getDaySummary } from '@/lib/daySummary'
import { loadData, loadRecord } from '@/lib/storage'
import type { CareLevel, CheckIn, Evaluation, MissReason, StudyPlan, StudySession } from '@/types'

/**
 * "지난 통화 요약" 목록(#45)에 쓸 재료를 만드는 함수들입니다. React 없이 돌아가는 순수 함수라서 `lib/` 에 둡니다.
 *
 * 통화에서 나온 값은 그날 체크인에 저장됩니다. (#38) 그래서 체크인을 날짜별로 꺼내서,
 * 어제 공부 기록으로 "어제 요약" 한 줄을 계산해 붙이면 요약 카드가 됩니다.
 *
 * 아직 저장하는 곳이 없는 것 (있으면 쓰고, 없으면 비워 둡니다)
 *  - AI 한마디, 그날의 관리 강도: Evaluation(날짜별 평가)에 들어 있는 값입니다.
 *    저장 이름은 'evaluations' 라고 가정했습니다. (날짜 → Evaluation 모양. #38 이 저장을 시작하면 맞춰 보세요)
 */

/** 목록 한 줄이자, 눌렀을 때 보여줄 카드 한 장입니다. */
export interface CallSummary {
  /** 통화(체크인)한 날짜 'YYYY-MM-DD' */
  date: string
  /** 어제 요약 한 줄. 예: "어제 순공 3시간 10분, 계획의 80%" */
  headline: string
  /** 오늘의 약속 한 문장. 예: "만약 학원에서 돌아오면 → 영어 단어 20개". 정하지 않았으면 null */
  promise: string | null
  /** 어제 계획을 못 채운 이유 글자. 고르지 않았으면 null. 예: "폰·SNS" */
  missReason: string | null
  /** 오늘 예상 순공시간 (분) */
  expectedMinutes: number
  /** AI 가 남긴 한마디. 저장된 것이 없으면 null */
  aiComment: string | null
  /** 그날의 관리 강도. 저장된 것이 없으면 null */
  careLevel: CareLevel | null
}

/** 미달 원인 글자. 미달 원인 버튼(MissReasonPicker)의 글자와 같습니다. */
export const missReasonLabels: Record<MissReason, string> = {
  tired: '피곤·수면',
  event: '약속·행사',
  phone: '폰·SNS',
  tooMuch: '계획 과다',
  unwilling: '하기 싫음',
  sick: '아픔',
  etc: '기타',
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' 의 하루 전 날짜를 돌려줍니다. (달·해가 바뀌어도 맞습니다. 예: '2026-03-01' → '2026-02-28') */
function dayBefore(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return toDateKey(new Date(year, month - 1, day - 1))
}

/** 체크인 하나가 우리가 아는 모양인지 확인합니다. (저장된 값이 깨져 있어도 화면이 멈추지 않게) */
function isCheckIn(value: unknown): value is CheckIn {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.date === 'string' &&
    DATE_KEY_PATTERN.test(item.date) &&
    typeof item.expectedMinutes === 'number' &&
    Number.isFinite(item.expectedMinutes)
  )
}

/** 평가 하나가 우리가 아는 모양인지 확인합니다. */
function isEvaluation(value: unknown): value is Evaluation {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.date === 'string' &&
    typeof item.summary === 'string' &&
    typeof item.careLevel === 'number' &&
    Number.isInteger(item.careLevel) &&
    item.careLevel >= 0 &&
    item.careLevel <= 4
  )
}

/** 저장된 체크인을 날짜별로 불러옵니다. 없거나 깨져 있으면 빈 객체입니다. 모양이 틀린 것은 건너뜁니다. */
export function loadCheckInsByDate(): Record<string, CheckIn> {
  const saved = loadData<unknown>('checkins', {})
  const result: Record<string, CheckIn> = {}
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return result

  for (const [key, value] of Object.entries(saved)) {
    if (isCheckIn(value) && value.date === key) result[key] = value
  }
  return result
}

/** 저장된 날짜별 평가를 불러옵니다. 아직 저장하는 곳이 없어서 보통 빈 객체입니다. */
export function loadEvaluationsByDate(): Record<string, Evaluation> {
  const saved = loadData<unknown>('evaluations', {})
  const result: Record<string, Evaluation> = {}
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return result

  for (const [key, value] of Object.entries(saved)) {
    if (isEvaluation(value) && value.date === key) result[key] = value
  }
  return result
}

/**
 * 어제 요약 한 줄을 만듭니다.
 *   - 계획과 공부 기록이 모두 없으면: "어제는 계획도 공부 기록도 없어요"
 *   - 계획은 없고 공부만 했으면:       "어제 순공 40분 (세워 둔 계획은 없었어요)"
 *   - 계획이 있으면:                  "어제 순공 3시간 10분, 계획의 80%"
 */
function makeHeadline(yesterday: string, plans: StudyPlan[], sessions: StudySession[]): string {
  const hasPlan = plans.some((plan) => plan.date === yesterday)
  const { studyMinutes, achievementRate } = getDaySummary(yesterday, plans, sessions)

  if (!hasPlan && studyMinutes === 0) return '어제는 계획도 공부 기록도 없어요'
  // 계획이 없거나, 있어도 목표 시간이 0 이라 달성률을 계산할 수 없는 날(null)입니다.
  if (!hasPlan || achievementRate === null) {
    return `어제 순공 ${formatMinutes(studyMinutes)} (세워 둔 계획은 없었어요)`
  }
  return `어제 순공 ${formatMinutes(studyMinutes)}, 계획의 ${achievementRate}%`
}

/** 오늘의 약속을 한 문장으로 만듭니다. 둘 중 하나라도 비어 있으면 약속이 아니므로 null 입니다. */
function makePromise(checkIn: CheckIn): string | null {
  const ifText = checkIn.promiseIf?.trim() ?? ''
  const thenText = checkIn.promiseThen?.trim() ?? ''
  if (ifText === '' || thenText === '') return null
  return `만약 ${ifText} → ${thenText}`
}

/** 미달 원인을 글자로 바꿉니다. '기타' 에 적은 한 줄이 있으면 괄호로 붙입니다. */
function makeMissReason(checkIn: CheckIn): string | null {
  if (checkIn.missReason === undefined) return null
  const label = missReasonLabels[checkIn.missReason]
  if (label === undefined) return null // 모르는 값(저장이 깨졌거나 옛 이름)은 보여주지 않습니다.

  const note = checkIn.missReasonNote?.trim() ?? ''
  return checkIn.missReason === 'etc' && note !== '' ? `${label} (${note})` : label
}

/** 통화가 끝난 직후 결과 화면(#38)에 보여 줄 "오늘 통화 요약" 카드의 재료입니다. */
export interface TodayCallCard {
  /** 어제 요약 한 줄. 예: "어제 순공 3시간 10분, 계획의 80%" */
  headline: string
  /** 어제 계획을 못 채운 이유. 오늘 체크인에서 고르지 않았으면 null */
  missReason: string | null
  /** 오늘 예상 순공시간 (분). 오늘 체크인이 없으면 null */
  expectedMinutes: number | null
  /** 오늘의 약속 한 문장. 정하지 않았으면 null */
  promise: string | null
}

/**
 * 저장소에서 오늘 체크인과 공부 기록을 꺼내 "오늘 통화 요약" 카드를 만듭니다.
 * 통화에서 정한 약속을 체크인에 저장한 "뒤에" 불러야 약속이 같이 나옵니다. (lib/callCheckIn.ts)
 *
 *   loadTodayCallCard('2026-10-17')
 *   -> { headline: '어제 순공 3시간 10분, 계획의 80%', missReason: '폰·SNS', expectedMinutes: 240, promise: '만약 … → …' }
 */
export function loadTodayCallCard(todayKey: string): TodayCallCard {
  const checkIn = loadCheckInsByDate()[todayKey]
  // 계획은 { 날짜: 계획 목록 } 모양으로 저장돼 있어서 한 줄로 펼칩니다. 배열이 아닌 값(깨진 값)은 건너뜁니다.
  const plans = Object.values(loadRecord<unknown>('plans'))
    .filter((dayPlans): dayPlans is StudyPlan[] => Array.isArray(dayPlans))
    .flat()

  return {
    headline: makeHeadline(dayBefore(todayKey), plans, loadStudySessions()),
    missReason: checkIn ? makeMissReason(checkIn) : null,
    expectedMinutes: checkIn ? checkIn.expectedMinutes : null,
    promise: checkIn ? makePromise(checkIn) : null,
  }
}

/**
 * 체크인들로 통화 요약 목록을 만듭니다. **최근 것이 맨 위**에 옵니다.
 *
 *   예) 체크인이 10/3, 10/5, 10/4 에 있으면 → [10/5, 10/4, 10/3] 순서
 *
 * 날짜 키가 'YYYY-MM-DD' 모양이 아닌 항목은 건너뜁니다.
 * evaluations 에 그날 평가가 있으면 AI 한마디와 관리 강도를 채우고, 없으면 null 입니다.
 */
export function buildCallSummaries(
  checkIns: Record<string, CheckIn>,
  plans: StudyPlan[],
  sessions: StudySession[],
  evaluations: Record<string, Evaluation> = {},
): CallSummary[] {
  return Object.keys(checkIns)
    .filter((date) => DATE_KEY_PATTERN.test(date))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // 'YYYY-MM-DD' 는 글자 순서가 날짜 순서와 같아서 그대로 비교합니다.
    .map((date) => {
      const checkIn = checkIns[date]
      const evaluation = evaluations[date]

      return {
        date,
        headline: makeHeadline(dayBefore(date), plans, sessions),
        promise: makePromise(checkIn),
        missReason: makeMissReason(checkIn),
        expectedMinutes: checkIn.expectedMinutes,
        aiComment: evaluation?.summary.trim() ? evaluation.summary : null,
        careLevel: evaluation ? evaluation.careLevel : null,
      }
    })
}
