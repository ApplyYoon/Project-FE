/**
 * 가입 직후 하는 "생각 습관 테스트" 입니다. 문장 24개에 리커트 7점 척도로 답해서 내가 자주 하는 생각 습관(인지편향)을 알아보고,
 * 습관 8개를 4개의 축으로 묶어 "지금 내 공부 스타일" 을 보여 줍니다. 마지막에 "내가 생각하는 나의 약점" 을 칩으로 고릅니다.
 *
 * ■ 어떻게 만들었나
 *  - 문장마다 "전혀 아니다(1) ~ 매우 그렇다(7)" 로 답합니다.
 *  - 생각 습관 8개마다 문장이 3개씩 있습니다. 그중 1개는 건강한 쪽 문장(역문항)이라 점수를 뒤집어 셉니다. (7 → 1, 6 → 2 …)
 *    무엇이든 "그렇다" 만 누르는 버릇이 있으면 결과가 한쪽으로 쏠리는데, 역문항이 그걸 걸러 줍니다.
 *  - 같은 습관의 문장이 붙어 나오지 않게, 역문항이 끝에 몰리지 않게 순서를 섞어 두었습니다.
 *
 * ■ 결과는 "유형" 이 아니라 "지금의 스타일" 입니다
 *  - "너는 ○○형" 이라고 하지 않습니다. 한 번의 테스트로 사람을 정하는 것 자체가 "한 번으로 단정하기" 입니다.
 *  - 나중에 다시 하면 바뀔 수 있다고 안내하고, 많이 해당하는 습관은 AI 통화에 넘겨서 진짜 그런지 확인합니다.
 *
 * ■ 문장을 바꿀 때 (문장은 앞으로 바뀔 수 있습니다)
 *  - thinkingTestItems 의 줄만 고치면 됩니다. 채점은 "어떤 습관인지(habit) · 역문항인지(reverse)" 만 보고 계산합니다.
 *  - 습관마다 문장이 최소 1개는 있어야 합니다. 개수는 달라도 됩니다. (습관마다 평균을 내서 비교합니다)
 *  - 역문항은 습관마다 1개쯤 섞어 두는 것이 좋습니다.
 *  - 이미 쓴 문장의 뜻을 크게 바꾸면 아래 TEST_VERSION 을 1 올려 주세요. 옛 결과를 가진 학생이 새로 다시 하게 됩니다.
 *  - 서버에는 문장별 답이 아니라 습관별 점수만 보내서, 문장을 바꿔도 서버는 고칠 것이 없습니다.
 *
 * ⚠️ 문장은 전문가 검토 전 초안입니다. (Tmax-IT-Hope-School/Project#8)
 * ⚠️ 습관의 이름·설명·해 볼 행동은 BE 의 생각 습관 목록(domain/bias/CognitiveBias.java)과 같은 글자입니다.
 *    한쪽을 고치면 다른 쪽도 같이 고쳐야 통화 결과 화면과 이 화면의 말이 어긋나지 않습니다.
 */
import { getTodayKey } from '@/lib/date'
import { loadData, saveData } from '@/lib/storage'

/** 생각 습관의 이름. BE 의 CognitiveBias 이름과 같습니다. */
export type ThinkingHabitKey =
  | 'PLANNING_FALLACY'
  | 'FUTURE_SELF'
  | 'WHAT_THE_HELL'
  | 'EMOTIONAL_REASONING'
  | 'EXTERNAL_BLAME'
  | 'ALL_OR_NOTHING'
  | 'MORAL_LICENSING'
  | 'OVERGENERALIZING'

/** 생각 습관 하나의 설명 */
export interface ThinkingHabitInfo {
  /** 보여 줄 이름 */
  label: string
  /** 어떤 생각인지 한 줄 */
  description: string
  /** 알아차린 뒤 해 볼 행동 하나 */
  solution: string
}

/** 생각 습관 8개. 순서는 BE 의 목록과 같습니다. */
export const thinkingHabits: Record<ThinkingHabitKey, ThinkingHabitInfo> = {
  PLANNING_FALLACY: {
    label: '계획 오류',
    description: '"이 정도는 금방 하지" 하고 걸리는 시간을 짧게 잡는 생각',
    solution: '다음 계획은 처음 예상한 시간의 1.5배로 잡아 보기',
  },
  FUTURE_SELF: {
    label: '미래의 나 믿기',
    description: '"내일의 나는 더 잘할 거야" 하고 지금 할 일을 뒤로 미루는 생각',
    solution: '"내일부터" 대신 오늘 5분짜리 시작 하나 정하기',
  },
  WHAT_THE_HELL: {
    label: '될 대로 되라',
    description: '"이미 망쳤으니 오늘은 끝" 하고 하나를 놓치면 나머지도 놓아 버리는 생각',
    solution: '계획 하나를 놓쳐도 다음 계획 하나는 지키기',
  },
  EMOTIONAL_REASONING: {
    label: '기분 따라 판단하기',
    description: '"의욕이 생기면 하자" 처럼 지금 기분을 사실로 믿는 생각',
    solution: '의욕을 기다리지 말고 5분만 먼저 시작하기',
  },
  EXTERNAL_BLAME: {
    label: '상황 탓하기',
    description:
      '"어차피 내 힘으로는 안 돼" 처럼 내가 바꿀 수 있는 부분까지 상황 탓으로 돌리는 생각',
    solution: '못 한 이유 중에서 내가 바꿀 수 있는 것 하나 찾기',
  },
  ALL_OR_NOTHING: {
    label: '다 아니면 0',
    description: '"제대로 못 할 바엔 안 하는 게 낫지" 처럼 다 하거나 안 하거나로만 보는 생각',
    solution: '"다 아니면 0" 대신 절반 목표 하나 정하기',
  },
  MORAL_LICENSING: {
    label: '보상 심리',
    description:
      '"어제 열심히 했으니 오늘은 쉬어도 돼" 처럼 지난 노력을 오늘 쉬는 허락으로 쓰는 생각',
    solution: '쉬는 시간도 계획에 미리 넣어 두기',
  },
  OVERGENERALIZING: {
    label: '한 번으로 단정하기',
    description: '"또 못 했네, 난 원래 이래" 처럼 한 번의 일을 늘 그런 것으로 굳히는 생각',
    solution: '"난 원래 이래" 대신 "이번엔 이랬다" 로 말해 보기',
  },
}

/** 리커트 7점 척도의 글자. 1 = 전혀 아니다 … 7 = 매우 그렇다 */
export const likertLabels = [
  '전혀 아니다',
  '아니다',
  '약간 아니다',
  '보통이다',
  '약간 그렇다',
  '그렇다',
  '매우 그렇다',
] as const

/** 문장 하나 */
export interface ThinkingTestItem {
  /** 문장을 구분하는 이름 (저장할 때 씁니다) */
  id: string
  /** 나에 대한 문장. "얼마나 나와 비슷한지" 를 1 ~ 7 로 답합니다. */
  text: string
  /** 이 문장이 재는 생각 습관 */
  habit: ThinkingHabitKey
  /** true 면 건강한 쪽 문장(역문항)이라 점수를 뒤집어 셉니다. */
  reverse: boolean
}

/**
 * 문장 24개. 습관마다 3개(그중 역문항 1개)입니다.
 * 같은 습관이 붙어 나오지 않게, 역문항이 끝에 몰리지 않게 섞은 순서입니다.
 */
export const thinkingTestItems: ThinkingTestItem[] = [
  {
    id: 'plan-cram',
    text: '계획을 짤 때 "이 정도는 금방 하지" 하고 이것저것 많이 넣는 편이다.',
    habit: 'PLANNING_FALLACY',
    reverse: false,
  },
  {
    id: 'one-miss-all-off',
    text: '계획 하나가 틀어지면 "오늘은 망했다" 하고 나머지도 안 하게 된다.',
    habit: 'WHAT_THE_HELL',
    reverse: false,
  },
  {
    id: 'wait-motivation',
    text: '의욕이 생겨야 공부를 시작할 수 있다.',
    habit: 'EMOTIONAL_REASONING',
    reverse: false,
  },
  {
    id: 'find-my-part',
    text: '계획을 못 지켰을 때, 그중 내가 바꿀 수 있는 것부터 찾는다.',
    habit: 'EXTERNAL_BLAME',
    reverse: true,
  },
  {
    id: 'do-it-tomorrow',
    text: '"오늘 못 하면 내일 하면 되지" 하고 미루는 편이다.',
    habit: 'FUTURE_SELF',
    reverse: false,
  },
  {
    id: 'no-time-no-start',
    text: '제대로 할 시간이 없으면 아예 시작하지 않는다.',
    habit: 'ALL_OR_NOTHING',
    reverse: false,
  },
  {
    id: 'plan-after-good-day',
    text: '잘한 날에도 다음 날 할 일 하나는 미리 정해 둔다.',
    habit: 'MORAL_LICENSING',
    reverse: true,
  },
  {
    id: 'always-like-this',
    text: '한 번 못 하면 "난 원래 이래" 라는 생각이 든다.',
    habit: 'OVERGENERALIZING',
    reverse: false,
  },
  {
    id: 'blame-situation',
    text: '계획을 못 지키면 학원·숙제·컨디션 같은 상황 때문이라고 생각한다.',
    habit: 'EXTERNAL_BLAME',
    reverse: false,
  },
  {
    id: 'start-five-minutes',
    text: '하기 싫어도 "지금 5분만 하자" 하고 바로 시작하는 편이다.',
    habit: 'FUTURE_SELF',
    reverse: true,
  },
  {
    id: 'half-is-zero',
    text: '계획의 절반만 했다면 못 한 거나 마찬가지라고 느낀다.',
    habit: 'ALL_OR_NOTHING',
    reverse: false,
  },
  {
    id: 'rest-after-hard-day',
    text: '열심히 한 다음 날은 좀 쉬어도 된다고 생각한다.',
    habit: 'MORAL_LICENSING',
    reverse: false,
  },
  {
    id: 'bad-at-subject',
    text: '어떤 과목을 한 번 망치면 "나는 이 과목은 안 된다" 고 느낀다.',
    habit: 'OVERGENERALIZING',
    reverse: false,
  },
  {
    id: 'check-real-time',
    text: '계획을 짤 때 지난번에 실제로 걸린 시간을 보고 정한다.',
    habit: 'PLANNING_FALLACY',
    reverse: true,
  },
  {
    id: 'not-my-day',
    text: '하기 싫은 기분이 들면 "오늘은 나랑 안 맞는 날" 이라고 생각한다.',
    habit: 'EMOTIONAL_REASONING',
    reverse: false,
  },
  {
    id: 'keep-evening-plan',
    text: '오후 계획을 놓쳐도 저녁 계획 하나는 지키려고 한다.',
    habit: 'WHAT_THE_HELL',
    reverse: true,
  },
  {
    id: 'takes-longer',
    text: '공부가 생각보다 오래 걸려서 계획을 다 못 끝내는 일이 자주 있다.',
    habit: 'PLANNING_FALLACY',
    reverse: false,
  },
  {
    id: 'just-this-time',
    text: '잘 안 된 날은 "이번엔 이랬다" 정도로 넘기는 편이다.',
    habit: 'OVERGENERALIZING',
    reverse: true,
  },
  {
    id: 'play-as-reward',
    text: '많이 공부한 날에는 그만큼 오래 놀아도 괜찮다고 느낀다.',
    habit: 'MORAL_LICENSING',
    reverse: false,
  },
  {
    id: 'do-what-i-can',
    text: '완벽하지 않아도 할 수 있는 만큼은 하는 편이다.',
    habit: 'ALL_OR_NOTHING',
    reverse: true,
  },
  {
    id: 'from-monday',
    text: '"월요일부터", "다음 주부터 진짜 한다" 고 마음먹은 적이 많다.',
    habit: 'FUTURE_SELF',
    reverse: false,
  },
  {
    id: 'unlucky-score',
    text: '점수가 낮게 나오면 문제가 이상했거나 운이 나빴다고 느낀다.',
    habit: 'EXTERNAL_BLAME',
    reverse: false,
  },
  {
    id: 'already-late',
    text: '폰을 보다 시간을 많이 날리면 "이미 늦었으니 그냥 놀자" 하게 된다.',
    habit: 'WHAT_THE_HELL',
    reverse: false,
  },
  {
    id: 'start-then-better',
    text: '기분이 별로여도 일단 시작하면 괜찮아지는 편이다.',
    habit: 'EMOTIONAL_REASONING',
    reverse: true,
  },
]

/** 생각 습관 하나의 점수 */
export interface ThinkingHabitScore {
  key: ThinkingHabitKey
  /** 문장 3개의 평균 (1 ~ 7, 역문항은 뒤집은 값). 높을수록 이 생각을 자주 하는 편입니다. */
  average: number
  /** 평균을 0 ~ 100 으로 바꾼 값. 1 → 0, 4 → 50, 7 → 100. 막대에 씁니다. */
  percent: number
}

/** 공부 스타일의 축 하나 */
export interface StudyStyleAxis {
  /** 축 이름. 예: '계획할 때' */
  name: string
  /** 이 축을 이루는 습관 2개 */
  habits: [ThinkingHabitKey, ThinkingHabitKey]
  /** 점수가 높을 때(습관 쪽)의 이름. 예: '낙관' */
  highLabel: string
  /** 점수가 낮을 때(건강한 쪽)의 이름. 예: '현실' */
  lowLabel: string
}

/**
 * 4개의 축. 축마다 습관 2개(문장 6개)를 묶습니다.
 * "포기형" 처럼 사람을 깎는 이름은 쓰지 않고, 바뀔 수 있는 "스타일" 의 이름으로 지었습니다.
 */
export const studyStyleAxes: StudyStyleAxis[] = [
  {
    name: '계획할 때',
    habits: ['PLANNING_FALLACY', 'FUTURE_SELF'],
    highLabel: '낙관',
    lowLabel: '현실',
  },
  {
    name: '넘어졌을 때',
    habits: ['WHAT_THE_HELL', 'ALL_OR_NOTHING'],
    highLabel: '멈춤',
    lowLabel: '회복',
  },
  {
    name: '움직이는 힘',
    habits: ['EMOTIONAL_REASONING', 'MORAL_LICENSING'],
    highLabel: '기분',
    lowLabel: '루틴',
  },
  {
    name: '원인을 볼 때',
    habits: ['EXTERNAL_BLAME', 'OVERGENERALIZING'],
    highLabel: '고정',
    lowLabel: '성장',
  },
]

/** 축 평균이 이 값 이상이면 높은 쪽 이름, 이하이면 낮은 쪽 이름, 그 사이면 "균형" 입니다. (7점 척도의 가운데는 4) */
export const STYLE_HIGH_AT = 4.5
export const STYLE_LOW_AT = 3.5

/** 축 하나의 결과 */
export interface StudyStyleResult {
  axis: StudyStyleAxis
  /** 두 습관 평균의 평균 (1 ~ 7) */
  average: number
  /** 평균을 0 ~ 100 으로 바꾼 값. 막대 위의 내 위치입니다. (0 = 낮은 쪽 끝, 100 = 높은 쪽 끝) */
  percent: number
  /** 보여 줄 이름. 높은 쪽 · 낮은 쪽 · '균형' 중 하나 */
  label: string
}

/** 테스트 결과 */
export interface ThinkingTestResult {
  /** 습관 8개의 점수. 평균이 높은 것부터 (같으면 목록 순서) */
  scores: ThinkingHabitScore[]
  /** 4개 축의 결과. studyStyleAxes 순서 */
  styles: StudyStyleResult[]
}

/**
 * 평균이 이 값보다 높은 습관만 "많이 해당하는 습관" 으로 봅니다. (5 = 약간 그렇다)
 * "이상" 이 아니라 "초과" 인 이유: 모든 문장에 7 만 누르면 역문항 때문에 모든 습관이 딱 5.0 이 됩니다.
 * 그런 경우에 아무 습관이나 뽑히지 않게 5.0 은 넣지 않습니다.
 */
export const TOP_HABIT_ABOVE = 5

// 1 ~ 7 평균을 0 ~ 100 으로 바꿉니다.   1 → 0, 4 → 50, 7 → 100
function toPercent(average: number): number {
  return Math.round(((average - 1) / 6) * 100)
}

// 소수 첫째 자리까지만 남깁니다. (4.333… → 4.3)
function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

/** 문장 하나의 점수. 역문항이면 뒤집습니다. (역문항에 7 → 1) */
export function itemScore(item: ThinkingTestItem, answer: number): number {
  return item.reverse ? 8 - answer : answer
}

/**
 * 답으로 점수를 냅니다. answers 는 "문장 id → 답(1 ~ 7)" 입니다. 1 ~ 7 이 아닌 답과 답하지 않은 문장은 셈에서 뺍니다.
 * 한 습관의 문장에 하나도 답하지 않았으면 그 습관의 평균은 가운데(4)로 봅니다.
 *
 *   계획 오류 문장에 6 · 7 · 역문항 2 로 답했으면 → (6 + 7 + 6) / 3 = 6.3 → 89%
 */
export function scoreThinkingTest(answers: Record<string, number>): ThinkingTestResult {
  const keys = Object.keys(thinkingHabits) as ThinkingHabitKey[]
  const sums: Record<string, number> = {}
  const counts: Record<string, number> = {}

  for (const item of thinkingTestItems) {
    const answer = answers[item.id]
    if (!Number.isInteger(answer) || answer < 1 || answer > 7) continue
    sums[item.habit] = (sums[item.habit] ?? 0) + itemScore(item, answer)
    counts[item.habit] = (counts[item.habit] ?? 0) + 1
  }

  const averages: Record<string, number> = {}
  for (const key of keys) {
    averages[key] = counts[key] ? sums[key] / counts[key] : 4
  }

  const scores = keys.map((key) => ({
    key,
    average: roundOne(averages[key]),
    percent: toPercent(averages[key]),
  }))
  // sort 는 같은 값이면 원래 순서를 지킵니다. 그래서 같으면 목록 순서가 됩니다.
  scores.sort((a, b) => b.average - a.average)

  const styles = studyStyleAxes.map((axis) => {
    // 두 습관의 평균을 똑같이 반씩 섞습니다. (문장 수가 달라져도 한 습관이 축을 더 끌지 않게)
    const average = (averages[axis.habits[0]] + averages[axis.habits[1]]) / 2
    let label = '균형'
    if (average >= STYLE_HIGH_AT) label = axis.highLabel
    else if (average <= STYLE_LOW_AT) label = axis.lowLabel
    return { axis, average: roundOne(average), percent: toPercent(average), label }
  })

  return { scores, styles }
}

/** 많이 해당하는 습관들 (평균이 5 보다 높은 것 중 위에서부터 max 개). 없으면 빈 목록 */
export function getTopHabits(result: ThinkingTestResult, max = 2): ThinkingHabitScore[] {
  return result.scores.filter((score) => score.average > TOP_HABIT_ABOVE).slice(0, max)
}

/**
 * 모든 문장에 같은 답을 했는지. (예: 전부 4, 전부 7)
 * 문장을 읽지 않고 같은 번호만 누른 것일 수 있어서, 결과 화면에서 다시 해 볼지 물어봅니다.
 */
export function isSameAnswerEverywhere(answers: Record<string, number>): boolean {
  const values = thinkingTestItems.map((item) => answers[item.id])
  return values.every((value) => value === values[0])
}

/** "지금 내 공부 스타일" 한 줄. 예: '낙관 · 회복 · 기분 · 성장' */
export function getStyleName(result: ThinkingTestResult): string {
  return result.styles.map((style) => style.label).join(' · ')
}

// ---- 내가 생각하는 나의 약점 (테스트 마지막 단계) ----

/** 약점 칩의 이름. BE 의 Weakness 이름과 같습니다. 통화를 걸 때 이 이름을 보냅니다. */
export type WeaknessKey =
  | 'GAME'
  | 'PHONE'
  | 'VIDEO'
  | 'SLEEP'
  | 'LAZY'
  | 'DELAY'
  | 'FOCUS'
  | 'FRIENDS'
  | 'TIRED'
  | 'MOOD'
  | 'PLANNING'

/** 약점 칩들. 화면에 이 순서로 보입니다. 글자는 BE 의 Weakness 와 같습니다. ("기타" 는 칩이 아니라 글 칸입니다) */
export const weaknessOptions: { key: WeaknessKey; label: string }[] = [
  { key: 'GAME', label: '게임' },
  { key: 'PHONE', label: '폰·SNS' },
  { key: 'VIDEO', label: '유튜브·영상' },
  { key: 'SLEEP', label: '잠·늦잠' },
  { key: 'LAZY', label: '게으름' },
  { key: 'DELAY', label: '미루기' },
  { key: 'FOCUS', label: '집중력' },
  { key: 'FRIENDS', label: '친구·약속' },
  { key: 'TIRED', label: '체력·피곤' },
  { key: 'MOOD', label: '기분·스트레스' },
  { key: 'PLANNING', label: '계획 세우기' },
]

/** "기타" 에 쓸 수 있는 글자 수 */
export const WEAKNESS_NOTE_MAX = 30

/** 약점 이름으로 칩의 글자를 찾습니다. 모르는 이름이면 null */
export function getWeaknessLabel(key: string): string | null {
  return weaknessOptions.find((option) => option.key === key)?.label ?? null
}

// ---- 저장 ----

// 저장 이름. (실제 키는 storage.ts 가 앞에 'study-' 를 붙입니다)
const STORAGE_KEY = 'thinking-test'

// 테스트 모양이 바뀌면 올리는 번호입니다. 번호가 다른 옛 기록은 "아직 안 함" 으로 보고 다시 하게 합니다.
// (1: 상황 4지선다 · 2: 리커트 7점 척도) 서버에도 이 번호를 같이 보냅니다. (lib/thinkingTestApi.ts)
export const TEST_VERSION = 2

/** 저장해 두는 테스트 기록 */
export interface SavedThinkingTest {
  /** 문장 id → 답 (1 ~ 7) */
  answers: Record<string, number>
  /** 내가 꼽은 약점 칩들 */
  weaknesses: WeaknessKey[]
  /** "기타" 에 쓴 약점. 안 썼으면 null. 내가 쓴 글이라 서버·AI 에는 보내지 않습니다. */
  weaknessNote: string | null
  /** 테스트를 한 날 'YYYY-MM-DD' */
  takenAt: string
}

/** 저장해 둔 테스트 기록. 아직 안 했거나 저장된 값이 깨져 있으면 null */
export function loadThinkingTest(): SavedThinkingTest | null {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const record = saved as Record<string, unknown>
  if (record.version !== TEST_VERSION) return null
  if (typeof record.takenAt !== 'string') return null
  if (typeof record.answers !== 'object' || record.answers === null) return null
  const answers: Record<string, number> = {}
  for (const [id, index] of Object.entries(record.answers)) {
    if (typeof index === 'number') answers[id] = index
  }
  // 약점은 나중에 더한 칸이라, 없거나 모양이 틀리면 "안 고름" 으로 봅니다. 모르는 이름은 뺍니다.
  const weaknesses = Array.isArray(record.weaknesses)
    ? record.weaknesses.filter(
        (key): key is WeaknessKey => typeof key === 'string' && getWeaknessLabel(key) !== null,
      )
    : []
  const weaknessNote = typeof record.weaknessNote === 'string' ? record.weaknessNote : null
  return { answers, weaknesses, weaknessNote, takenAt: record.takenAt }
}

/** 테스트를 끝냈는지. 안 했으면 RequireAuth 가 테스트 화면으로 보냅니다. */
export function hasThinkingTest(): boolean {
  return loadThinkingTest() !== null
}

/** 테스트 기록을 저장합니다. 다시 하면 덮어씁니다. "기타" 글은 앞뒤 빈칸을 떼고, 비었으면 null 로 둡니다. */
export function saveThinkingTest(
  answers: Record<string, number>,
  weaknesses: WeaknessKey[],
  weaknessNote: string,
): void {
  const note = weaknessNote.trim().slice(0, WEAKNESS_NOTE_MAX)
  saveData<SavedThinkingTest & { version: number }>(STORAGE_KEY, {
    version: TEST_VERSION,
    answers,
    weaknesses,
    weaknessNote: note === '' ? null : note,
    takenAt: getTodayKey(),
  })
}

/**
 * AI 통화에 넘길 "많이 고른 습관" 이름들 (최대 3개, 많이 고른 것부터). 테스트를 안 했으면 빈 목록
 * 서버는 통화 기록이 쌓이기 전 첫 질문을 고르는 데 씁니다. (BE 의 selfReportedBiases)
 */
export function loadSelfReportedHabits(): ThinkingHabitKey[] {
  const saved = loadThinkingTest()
  if (saved === null) return []
  return getTopHabits(scoreThinkingTest(saved.answers), 3).map((score) => score.key)
}

/**
 * AI 통화에 넘길 "내가 꼽은 약점" 이름들. 테스트를 안 했으면 빈 목록
 * "기타" 에 쓴 글은 넘기지 않습니다. 내가 직접 쓴 글이라, AI 의 지침에 들어가면 엉뚱한 지시가 섞일 수 있어서입니다.
 */
export function loadSelfReportedWeaknesses(): WeaknessKey[] {
  return loadThinkingTest()?.weaknesses ?? []
}

/** 테스트 화면의 주소. 안 했으면 RequireAuth 가 여기로 보냅니다. */
export const THINKING_TEST_PATH = '/onboarding/thinking'
