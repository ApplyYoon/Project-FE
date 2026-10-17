/**
 * 온보딩 5번 "관리 설정" 과 6번 "결과 화면" 에 쓰는 규칙입니다. (기획서 4.1, #389)
 * React 없이 저장된 값만 봅니다.
 *
 *   관리 설정: 통화 시각 · 연락 금지 시간 · 수면 보호(취침·기상, 최소 6시간) · 제재 최대 한도 · 말투 수위
 *             한도와 수위는 심리검사로 미리 채우고, [이대로 할게요] 를 눌러야 다음으로 갑니다. (명시적 동의)
 *   결과 화면: 성향 요약 3줄 + 검사로 맞춘 설정과 이유 + "2주 동안 네 가설을 확인해볼게."
 */
import { getScaleLevel, loadPsychTest, type PsychScale } from '@/lib/psychTest'
import type { ScaleLevels } from '@/lib/settingsMapping'
import { loadData, removeData, saveData } from '@/lib/storage'

/** 수면 보호 시간의 최소 길이(시간). 이보다 짧으면 다음으로 갈 수 없습니다. (기획서 4.1) */
export const MIN_SLEEP_HOURS = 6

/** 수면 보호 시간의 처음 값 (온보딩 답에 취침·기상 시각이 없을 때) */
export const DEFAULT_BED_TIME = '23:30'
export const DEFAULT_WAKE_TIME = '07:00'

/** 'HH:MM' 글자를 자정부터 몇 분인지로 바꿉니다. 모양이 틀리면 null */
function toMinutesOfDay(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (match === null) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * 취침 시각부터 기상 시각까지 몇 분인지. 자정을 넘기면 다음 날로 셉니다. 시각이 틀리면 null
 *
 *   getSleepMinutes('23:30', '07:00') -> 450  (7시간 30분)
 *   getSleepMinutes('01:00', '06:00') -> 300  (5시간 — 6시간보다 짧아서 다음으로 못 감)
 *   getSleepMinutes('07:00', '07:00') -> 0
 */
export function getSleepMinutes(bedTime: string, wakeTime: string): number | null {
  const bed = toMinutesOfDay(bedTime)
  const wake = toMinutesOfDay(wakeTime)
  if (bed === null || wake === null) return null
  return (wake - bed + 24 * 60) % (24 * 60)
}

/** 수면 보호 시간이 최소 길이(6시간) 이상인지 */
export function isSleepLongEnough(bedTime: string, wakeTime: string): boolean {
  const minutes = getSleepMinutes(bedTime, wakeTime)
  return minutes !== null && minutes >= MIN_SLEEP_HOURS * 60
}

/** 심리검사 결과의 척도별 높낮이. 검사를 안 했으면 빈 객체(= 모두 기본값으로 맞춤) */
export function loadScaleLevels(): ScaleLevels {
  const result = loadPsychTest()
  if (result === undefined) return {}
  const levels: ScaleLevels = {}
  for (const [scale, score] of Object.entries(result.scores)) {
    levels[scale as PsychScale] = getScaleLevel(score)
  }
  return levels
}

// 척도마다 높을 때 · 낮을 때의 한 줄. 사람을 깎는 말 대신 "~하는 편이에요" 로 씁니다.
const TRAIT_LINES: Record<PsychScale, { high: string; low: string }> = {
  startResistance: {
    high: '마음먹고 시작하기까지 시간이 걸리는 편이에요.',
    low: '마음먹으면 바로 시작하는 편이에요.',
  },
  distraction: {
    high: '공부 중에 폰이나 딴생각에 자주 흔들리는 편이에요.',
    low: '한 번 앉으면 잘 흔들리지 않는 편이에요.',
  },
  planOptimism: {
    high: '계획을 넉넉하게 많이 세우는 편이에요.',
    low: '계획을 현실적으로 세우는 편이에요.',
  },
  recordBurden: {
    high: '입력하는 게 귀찮은 편이라 적을 것을 줄여 둘게요.',
    low: '기록하는 걸 어렵지 않게 여기는 편이에요.',
  },
  failSensitivity: {
    high: '계획이 한 번 틀어지면 마음에 오래 남는 편이에요.',
    low: '틀어져도 금방 다시 일어나는 편이에요.',
  },
  externalAttribution: {
    high: '못 한 이유를 상황에서 찾는 편이에요.',
    low: '못 한 이유에서 내가 바꿀 부분을 찾는 편이에요.',
  },
  carePreference: {
    high: '따끔한 관리가 더 잘 맞는다고 했어요.',
    low: '부드러운 관리가 더 잘 맞는다고 했어요.',
  },
}

/** 높음·낮음이 3개보다 적을 때 채우는 줄 */
const MIDDLE_LINE = '나머지는 대부분 보통이라, 2주 동안 기록으로 더 알아볼게요.'

/** 성향 요약 줄 수 */
export const TRAIT_SUMMARY_LINES = 3

/**
 * 성향 요약 3줄을 코드로 고릅니다. (AI 문장이 오기 전까지 · 못 받았을 때 보여 주는 기본 문장)
 * 가운데(4점)에서 가장 먼 척도부터 높음·낮음인 것만 골라 3줄을 채우고, 모자라면 "보통" 줄로 채웁니다.
 *
 *   시작 저항 6.5(높음) · 관리 선호 1.5(낮음) · 나머지 보통
 *   -> ['마음먹고 시작하기까지 …', '부드러운 관리가 …', '나머지는 대부분 보통이라 …']
 */
export function getTraitSummary(scores: Record<PsychScale, number>): string[] {
  const notable = (Object.keys(scores) as PsychScale[])
    .map((scale) => ({ scale, score: scores[scale], level: getScaleLevel(scores[scale]) }))
    .filter((item) => item.level !== 'mid')
    // 4점에서 먼 것부터. 같으면 척도 순서 그대로 (sort 는 같은 값의 순서를 지킵니다)
    .sort((a, b) => Math.abs(b.score - 4) - Math.abs(a.score - 4))
    .slice(0, TRAIT_SUMMARY_LINES)
  const lines = notable.map((item) =>
    item.level === 'high' ? TRAIT_LINES[item.scale].high : TRAIT_LINES[item.scale].low,
  )
  if (lines.length < TRAIT_SUMMARY_LINES) lines.push(MIDDLE_LINE)
  return lines
}

// ---- 저장 ----

// [이대로 할게요] 를 누른 때(Date.now() 숫자)를 넣어 두는 이름 · 결과 화면을 본 표시를 넣어 두는 이름
const CARE_CONSENT_KEY = 'onboarding-care-consent'
const RESULT_SEEN_KEY = 'onboarding-result-seen'

/** 관리 설정에 동의했는지 ([이대로 할게요] 를 눌렀는지) */
export function hasCareConsent(): boolean {
  return typeof loadData<unknown>(CARE_CONSENT_KEY, null) === 'number'
}

/** 관리 설정에 동의했다고 적어 둡니다. 동의한 때를 남겨서 나중에 "언제 정했는지" 를 보여 줄 수 있게 합니다. */
export function saveCareConsent(now: number): void {
  saveData(CARE_CONSENT_KEY, now)
}

/** 결과 화면을 봤는지 */
export function hasSeenOnboardingResult(): boolean {
  return loadData<unknown>(RESULT_SEEN_KEY, false) === true
}

/** 결과 화면을 봤다고 적어 둡니다. */
export function markOnboardingResultSeen(): void {
  saveData(RESULT_SEEN_KEY, true)
}

/** 온보딩을 처음부터 다시 할 때 동의 · 결과 표시를 지웁니다. (lib/onboardingProgress.ts 의 resetOnboarding) */
export function resetOnboardingCare(): void {
  removeData(CARE_CONSENT_KEY)
  removeData(RESULT_SEEN_KEY)
}
