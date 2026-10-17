/**
 * 온보딩 심리검사입니다. 문장 14개에 리커트 7점(1 전혀 아니다 ~ 7 매우 그렇다)으로 답해서
 * 성향 척도 7개의 점수를 냅니다. (기획서 docs/PLAN.md 「6.1 척도 7개」·「6.2 문항」)
 *
 * ■ 무엇에 쓰나
 *  - 첫날에는 기록이 없어서 이 점수로 성향을 짐작해 설정의 출발값을 정합니다. (#385 설정 자동 맞추기, #384 의지력)
 *  - 척도당 문장이 2개뿐이라 정확하지 않습니다. 14일 뒤부터는 같은 척도를 실제 행동 기록으로 대신합니다. (기획서 6.4)
 *
 * ■ 채점
 *  - 척도 점수 = 그 척도 문장 2개의 답 평균 (1 ~ 7)
 *  - 5 이상 = 높음, 3 이하 = 낮음, 그 사이 = 보통
 *
 *   예) S1 = 6, S2 = 5 → 시작 저항 (6 + 5) / 2 = 5.5 → 높음
 *       A1 = 3, A2 = 2 → 주의 분산 (3 + 2) / 2 = 2.5 → 낮음
 *       P1 = 4, P2 = 5 → 계획 낙관 (4 + 5) / 2 = 4.5 → 보통
 *       C1 = 3, C2 = 3 → 관리 선호 3.0 → 낮음 (3 "이하" 라서 3 도 낮음)
 *       F1 = 5, F2 = 5 → 실패 민감도 5.0 → 높음 (5 "이상" 이라서 5 도 높음)
 *
 * ■ 문장을 바꿀 때
 *  - psychTestItems 의 text 만 고치면 됩니다. 채점은 id 와 scale 만 봅니다. (문장은 팀 검토 뒤 다듬어도 됩니다)
 *
 * ⚠️ 서버(BE Tmax-IT-Hope-School/Project-BE#219)와 RN 앱도 이 파일과 같은 이름·같은 계산을 씁니다.
 *    문항 id('S1'~'C2')·척도 이름(startResistance 등)·5/3 경계를 바꾸면 그쪽에도 알려 주세요.
 *
 * 옛 "생각 습관 테스트"(lib/thinkingTest.ts)와는 다른 검사입니다. 그쪽은 통화·기록 화면에서 계속 씁니다.
 */
import { loadData, saveData } from '@/lib/storage'

/** 척도 7개의 이름. 서버와 같은 이름(camelCase)입니다. */
export type PsychScale =
  | 'startResistance'
  | 'distraction'
  | 'planOptimism'
  | 'recordBurden'
  | 'failSensitivity'
  | 'externalAttribution'
  | 'carePreference'

/** 척도 점수의 높낮이 */
export type ScaleLevel = 'high' | 'mid' | 'low'

/** 척도 하나의 설명 */
export interface PsychScaleInfo {
  /** 보여 줄 이름 */
  label: string
  /** 무엇을 재는지 한 줄 */
  description: string
}

/** 척도 7개. 순서는 기획서 6.1 표와 같습니다. */
export const psychScales: Record<PsychScale, PsychScaleInfo> = {
  startResistance: { label: '시작 저항', description: '마음먹고 시작하기까지 꾸물거림' },
  distraction: { label: '주의 분산', description: '공부 중 폰·딴생각에 흔들림' },
  planOptimism: { label: '계획 낙관', description: '계획을 과하게 세움' },
  recordBurden: { label: '기록 부담', description: '입력 자체를 귀찮아함' },
  failSensitivity: { label: '실패 민감도', description: '한 번 무너지면 포기·자책' },
  externalAttribution: { label: '외부 귀인', description: '원인을 밖에서 찾음' },
  carePreference: { label: '관리 선호', description: '따끔한 관리를 원함' },
}

/** 문장 하나 */
export interface PsychTestItem {
  /** 문항 코드. 저장·서버 전송에 씁니다. ('S1' ~ 'C2') */
  id: string
  /** 나에 대한 문장. "얼마나 나와 비슷한지" 를 1 ~ 7 로 답합니다. */
  text: string
  /** 이 문장이 재는 척도 */
  scale: PsychScale
}

/** 문장 14개. 척도마다 2개씩, 기획서 6.2 표의 순서와 글 그대로입니다. */
export const psychTestItems: PsychTestItem[] = [
  {
    id: 'S1',
    text: '공부하려고 마음먹어도 실제로 시작하기까지 오래 걸린다.',
    scale: 'startResistance',
  },
  {
    id: 'S2',
    text: '책상에 앉아도 정리나 폰 확인 같은 다른 걸 먼저 하게 된다.',
    scale: 'startResistance',
  },
  {
    id: 'A1',
    text: '공부하는 도중에 폰을 확인하고 싶은 충동이 자주 든다.',
    scale: 'distraction',
  },
  {
    id: 'A2',
    text: '공부 중에 다른 할 일이나 걱정이 떠올라 흐름이 자주 끊긴다.',
    scale: 'distraction',
  },
  {
    id: 'P1',
    text: '계획한 양을 시간 안에 다 끝내지 못하는 날이 많다.',
    scale: 'planOptimism',
  },
  {
    id: 'P2',
    text: '계획을 세울 때 "이 정도는 금방 하지" 라고 생각하는 편이다.',
    scale: 'planOptimism',
  },
  {
    id: 'R1',
    text: '플래너나 계획표를 쓰는 것 자체가 귀찮아서 오래 못 간다.',
    scale: 'recordBurden',
  },
  {
    id: 'R2',
    text: '앱에 뭔가를 입력해야 하면 그 앱을 잘 안 쓰게 된다.',
    scale: 'recordBurden',
  },
  {
    id: 'F1',
    text: '계획이 한 번 틀어지면 그날은 그냥 다 놓아버리는 편이다.',
    scale: 'failSensitivity',
  },
  {
    id: 'F2',
    text: '공부를 못한 날은 나 자신에게 심하게 실망하거나 자책한다.',
    scale: 'failSensitivity',
  },
  {
    id: 'E1',
    text: '공부를 못한 날을 돌아보면 대부분 상황이나 다른 사람 때문이었다.',
    scale: 'externalAttribution',
  },
  {
    id: 'E2',
    text: '내가 어떻게 해도 바뀌지 않는 이유로 공부를 못하는 경우가 많다.',
    scale: 'externalAttribution',
  },
  {
    id: 'C1',
    text: '내가 게을러졌을 때는 위로보다 따끔한 말이 더 효과가 있다.',
    scale: 'carePreference',
  },
  {
    id: 'C2',
    text: '누가 강하게 관리해줘야 공부가 된다.',
    scale: 'carePreference',
  },
]

/** 척도 점수가 이 값 이상이면 "높음" 입니다. (기획서: 출발값) */
export const SCALE_HIGH_AT = 5
/** 척도 점수가 이 값 이하이면 "낮음" 입니다. (기획서: 출발값) */
export const SCALE_LOW_AT = 3

/** 한 척도의 문장에 하나도 답하지 않았을 때 쓰는 점수. 7점 척도의 가운데(보통)입니다. */
const MIDDLE_SCORE = 4

/** 1 ~ 7 사이의 정수인지. 이 밖의 값은 답으로 치지 않습니다. */
function isValidAnswer(answer: unknown): answer is number {
  return typeof answer === 'number' && Number.isInteger(answer) && answer >= 1 && answer <= 7
}

/**
 * 답으로 척도 7개의 점수를 냅니다. answers 는 "문항 코드('S1' ~ 'C2') → 답(1 ~ 7)" 입니다.
 * 1 ~ 7 이 아닌 답과 답하지 않은 문장은 셈에서 뺍니다. 한 척도에 답이 하나도 없으면 가운데(4)로 봅니다.
 *
 *   scorePsychTest({ S1: 6, S2: 5, … }).startResistance  → 5.5
 */
export function scorePsychTest(answers: Record<string, number>): Record<PsychScale, number> {
  const scales = Object.keys(psychScales) as PsychScale[]
  const scores = {} as Record<PsychScale, number>

  for (const scale of scales) {
    const values = psychTestItems
      .filter((item) => item.scale === scale)
      .map((item) => answers[item.id])
      .filter(isValidAnswer)
    const sum = values.reduce((total, value) => total + value, 0)
    scores[scale] = values.length > 0 ? sum / values.length : MIDDLE_SCORE
  }

  return scores
}

/** 척도 점수의 높낮이. 5 이상 → 'high', 3 이하 → 'low', 그 사이 → 'mid' */
export function getScaleLevel(score: number): ScaleLevel {
  if (score >= SCALE_HIGH_AT) return 'high'
  if (score <= SCALE_LOW_AT) return 'low'
  return 'mid'
}

/** 높낮이를 화면에 보여 줄 글자 */
export const scaleLevelLabels: Record<ScaleLevel, string> = {
  high: '높음',
  mid: '보통',
  low: '낮음',
}

/** 14문장에 모두 1 ~ 7 로 답했는지. 결과를 저장하기 전에 확인합니다. */
export function isPsychTestComplete(answers: Record<string, number>): boolean {
  return psychTestItems.every((item) => isValidAnswer(answers[item.id]))
}

// ---- 저장 ----

// 저장 이름. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여 'study-psych-test' 가 됩니다)
const STORAGE_KEY = 'psych-test'

/** 저장해 두는 검사 결과. 칸 이름은 서버(BE#219)와 같습니다. */
export interface PsychTestResult {
  /** 문항 코드('S1' ~ 'C2') → 답(1 ~ 7) */
  answers: Record<string, number>
  /** 척도 7개의 점수 (두 문항 평균, 1 ~ 7) */
  scores: Record<PsychScale, number>
  /** 검사를 끝낸 때 (Date.now() 숫자) */
  takenAt: number
}

/**
 * 저장해 둔 검사 결과. 아직 안 했거나, 저장된 값이 깨졌거나, 14문장에 다 답하지 않은 기록이면 undefined
 * 점수는 저장된 값을 믿지 않고 답으로 다시 계산합니다. (계산 규칙이 바뀌어도 화면과 저장 값이 어긋나지 않게)
 */
export function loadPsychTest(): PsychTestResult | undefined {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return undefined
  const record = saved as Record<string, unknown>
  if (typeof record.takenAt !== 'number') return undefined
  if (typeof record.answers !== 'object' || record.answers === null) return undefined

  const answers: Record<string, number> = {}
  for (const [id, value] of Object.entries(record.answers)) {
    if (isValidAnswer(value)) answers[id] = value
  }
  if (!isPsychTestComplete(answers)) return undefined

  return { answers, scores: scorePsychTest(answers), takenAt: record.takenAt }
}

/** 검사를 끝냈는지 */
export function hasPsychTest(): boolean {
  return loadPsychTest() !== undefined
}

/** 검사 결과를 저장하고 돌려줍니다. 다시 하면 덮어씁니다. 답은 14문장에 모두 있어야 합니다. (isPsychTestComplete) */
export function savePsychTest(answers: Record<string, number>): PsychTestResult {
  const result: PsychTestResult = {
    answers,
    scores: scorePsychTest(answers),
    takenAt: Date.now(),
  }
  saveData(STORAGE_KEY, result)
  return result
}

/** 검사 화면의 주소 */
export const PSYCH_TEST_PATH = '/onboarding/psych-test'
