/**
 * 가입 직후 하는 "생각 습관 테스트" 입니다. 상황 질문 24개로 내가 자주 하는 생각 습관(인지편향)을 알아보고,
 * 마지막에 "내가 생각하는 나의 약점" 을 칩으로 고릅니다.
 *
 * ■ 어떻게 만들었나
 *  - 질문마다 보기 4개. 보기 3개는 생각 습관 하나씩과 이어져 있고, 1개는 건강한 대처('healthy')입니다.
 *  - 생각 습관 8개가 보기에 정확히 9번씩 나옵니다. 그래서 "9번 나왔는데 몇 번 골랐는지" 로 비율을 냅니다.
 *    한 습관을 여러 상황으로 물어야, 그날 기분에 따라 한두 번 흔들려도 결과가 크게 바뀌지 않습니다.
 *  - "나는 남 탓을 해" 처럼 직접 묻지 않고 상황으로 묻습니다. 생각 습관은 본인이 잘 알아채지 못하기 때문입니다.
 *
 * ■ 결과는 "유형" 이 아니라 "가설" 입니다
 *  - "너는 ○○형" 이라고 하지 않습니다. 한 번의 테스트로 사람을 정하는 것 자체가 "한 번으로 단정하기" 입니다.
 *  - 많이 고른 습관은 AI 통화에 넘겨서, 통화에서 진짜 그런지 확인합니다. (BE 의 selfReportedBiases)
 *
 * ⚠️ 문항과 보기는 전문가 검토 전 초안입니다. (Tmax-IT-Hope-School/Project#8)
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

/** 보기 하나. habit 이 'healthy' 면 건강한 대처입니다. */
export interface ThinkingTestOption {
  text: string
  habit: ThinkingHabitKey | 'healthy'
}

/** 상황 질문 하나 */
export interface ThinkingTestQuestion {
  /** 질문을 구분하는 이름 (저장할 때 씁니다) */
  id: string
  /** 상황 */
  situation: string
  /** 보기 4개 */
  options: ThinkingTestOption[]
}

/**
 * 상황 질문 24개. 건강한 대처가 늘 같은 자리에 있으면 눈치로 고르게 되어서 자리를 섞어 두었습니다. (1 ~ 4번째 자리에 6번씩)
 * 습관이 보기에 나오는 횟수: 8개 모두 9번 (합 72)
 */
export const thinkingTestQuestions: ThinkingTestQuestion[] = [
  {
    id: 'plan-making',
    situation: '오늘 공부 계획을 짤 때 나는…',
    options: [
      { text: '"이 정도는 금방 하지" 하고 이것저것 많이 넣는다', habit: 'PLANNING_FALLACY' },
      { text: '지난번에 실제로 걸린 시간을 보고 짠다', habit: 'healthy' },
      { text: '오늘 못 하면 내일 하면 되니까 대충 짠다', habit: 'FUTURE_SELF' },
      { text: '완벽한 계획이 아니면 시작하기 싫어서 계획만 계속 고친다', habit: 'ALL_OR_NOTHING' },
    ],
  },
  {
    id: 'exam-eve-broken',
    situation: '시험 전날, 계획이 다 틀어졌어. 제일 먼저 드는 생각은?',
    options: [
      { text: '어차피 망했으니 오늘은 쉬자', habit: 'WHAT_THE_HELL' },
      { text: '학원 숙제 때문에 어쩔 수 없었어', habit: 'EXTERNAL_BLAME' },
      { text: '남은 것 중에 하나라도 해 보자', habit: 'healthy' },
      { text: '난 원래 이래, 늘 이런 식이야', habit: 'OVERGENERALIZING' },
    ],
  },
  {
    id: 'before-start',
    situation: '공부를 시작하기 전에 나는 보통…',
    options: [
      { text: '의욕이 생길 때까지 기다린다', habit: 'EMOTIONAL_REASONING' },
      { text: '"이것만 보고 하자" 하고 폰을 먼저 본다', habit: 'FUTURE_SELF' },
      { text: '제대로 할 시간이 없으면 아예 미룬다', habit: 'ALL_OR_NOTHING' },
      { text: '일단 5분이라도 시작한다', habit: 'healthy' },
    ],
  },
  {
    id: 'after-good-day',
    situation: '어제 계획을 다 해냈어. 오늘 아침 드는 생각은?',
    options: [
      { text: '어제 잘 된 방법을 오늘도 써 봐야지', habit: 'healthy' },
      { text: '어제 열심히 했으니 오늘은 좀 쉬어도 돼', habit: 'MORAL_LICENSING' },
      { text: '어제처럼 하면 되니까 오늘도 금방 끝나겠지', habit: 'PLANNING_FALLACY' },
      { text: '오늘은 기분이 별로라 어제만큼은 못 할 것 같아', habit: 'EMOTIONAL_REASONING' },
    ],
  },
  {
    id: 'half-done',
    situation: '계획한 공부의 절반만 했어. 나는…',
    options: [
      { text: '절반이면 못 한 거나 마찬가지야', habit: 'ALL_OR_NOTHING' },
      { text: '오늘은 컨디션 탓이야', habit: 'EXTERNAL_BLAME' },
      { text: '또 다 못 했네, 나는 늘 끝까지 못 해', habit: 'OVERGENERALIZING' },
      { text: '절반이라도 했으니 내일은 조금 더 해 보자', habit: 'healthy' },
    ],
  },
  {
    id: 'missed-afternoon',
    situation: '오후 계획을 놓쳤어. 저녁 계획은?',
    options: [
      { text: '저녁 계획 하나는 지킨다', habit: 'healthy' },
      { text: '이미 틀어졌으니 저녁도 그냥 쉰다', habit: 'WHAT_THE_HELL' },
      { text: '내일 몰아서 하면 된다', habit: 'FUTURE_SELF' },
      { text: '하기 싫은 걸 보니 오늘은 나랑 안 맞는 날이다', habit: 'EMOTIONAL_REASONING' },
    ],
  },
  {
    id: 'low-score',
    situation: '모의고사 점수가 기대보다 낮게 나왔어. 드는 생각은?',
    options: [
      { text: '이번엔 문제가 이상하게 나왔어', habit: 'EXTERNAL_BLAME' },
      { text: '틀린 문제에서 내가 바꿀 수 있는 게 뭔지 본다', habit: 'healthy' },
      { text: '역시 나는 이 과목은 안 돼', habit: 'OVERGENERALIZING' },
      { text: '이렇게 된 이상 이번 시험 준비는 망했어', habit: 'WHAT_THE_HELL' },
    ],
  },
  {
    id: 'weekend-friend',
    situation: '주말에 공부하려고 했는데 친구가 놀자고 해. 나는…',
    options: [
      { text: '월요일부터 진짜 열심히 하면 돼', habit: 'FUTURE_SELF' },
      { text: '이번 주에 열심히 했으니 이 정도는 괜찮아', habit: 'MORAL_LICENSING' },
      { text: '놀 시간과 공부할 시간을 정해 두고 논다', habit: 'healthy' },
      { text: '다들 주말엔 노니까', habit: 'EXTERNAL_BLAME' },
    ],
  },
  {
    id: 'taking-longer',
    situation: '과제를 하는데 생각보다 오래 걸려. 나는…',
    options: [
      { text: '집중이 안 되는 걸 보니 오늘은 아닌가 보다', habit: 'EMOTIONAL_REASONING' },
      { text: '완벽하게 못 할 바엔 내일 처음부터 다시 한다', habit: 'ALL_OR_NOTHING' },
      { text: '다음엔 시간을 더 넉넉하게 잡아야겠다고 적어 둔다', habit: 'healthy' },
      {
        text: '원래 금방 끝날 일인데 이상하다며, 다음에도 비슷하게 잡는다',
        habit: 'PLANNING_FALLACY',
      },
    ],
  },
  {
    id: 'good-week',
    situation: '일주일 동안 계획을 꽤 잘 지켰어. 다음 주 계획은?',
    options: [
      { text: '이번 주가 잘 됐으니 다음 주는 두 배로 넣어도 되겠지', habit: 'PLANNING_FALLACY' },
      { text: '잘 된 이유를 적어 두고 비슷하게 짠다', habit: 'healthy' },
      { text: '이번 주에 잘했으니 다음 주는 좀 느슨하게', habit: 'MORAL_LICENSING' },
      { text: '한 번 잘 됐다고 달라지진 않아, 난 원래 오래 못 가', habit: 'OVERGENERALIZING' },
    ],
  },
  {
    id: 'hard-problems',
    situation: '공부하다가 모르는 문제가 계속 나와. 나는…',
    options: [
      { text: '선생님 설명이 별로라서 그래', habit: 'EXTERNAL_BLAME' },
      { text: '하나도 모르겠으니 오늘은 그만', habit: 'WHAT_THE_HELL' },
      { text: '이 과목은 나랑 안 맞나 봐', habit: 'EMOTIONAL_REASONING' },
      { text: '아는 데까지 풀고 모르는 건 표시해 둔다', habit: 'healthy' },
    ],
  },
  {
    id: 'exam-eve-left',
    situation: '내일이 시험인데 아직 다 못 봤어. 오늘 밤 나는…',
    options: [
      { text: '중요한 단원부터 하나씩 본다', habit: 'healthy' },
      { text: '밤새면 다 볼 수 있어', habit: 'PLANNING_FALLACY' },
      { text: '오늘 낮에 많이 했으니 이제 좀 놀아도 돼', habit: 'MORAL_LICENSING' },
      { text: '내일 아침 일찍 일어나서 보면 돼', habit: 'FUTURE_SELF' },
    ],
  },
  {
    id: 'phone-break',
    situation: '공부하다 잠깐 쉬려고 폰을 집었는데, 30분이 지났어. 나는…',
    options: [
      { text: '이미 30분 날렸으니 오늘은 그냥 놀자', habit: 'WHAT_THE_HELL' },
      { text: '알림이 계속 와서 어쩔 수 없었어', habit: 'EXTERNAL_BLAME' },
      { text: '폰을 다른 방에 두고 다시 시작한다', habit: 'healthy' },
      { text: '역시 난 폰을 못 끊어', habit: 'OVERGENERALIZING' },
    ],
  },
  {
    id: 'disliked-subject',
    situation: '싫어하는 과목을 공부할 차례야. 나는…',
    options: [
      { text: '마음이 안 내키니까 좋아하는 과목부터 한다', habit: 'EMOTIONAL_REASONING' },
      { text: '제대로 이해 못 할 바엔 아예 손대지 않는다', habit: 'ALL_OR_NOTHING' },
      { text: '가장 쉬운 문제 하나부터 풀어 본다', habit: 'healthy' },
      { text: '이 과목은 다음 주에 몰아서 하면 돼', habit: 'FUTURE_SELF' },
    ],
  },
  {
    id: 'karaoke',
    situation: '공부하기로 한 날, 친구들이 노래방 가자고 해. 나는…',
    options: [
      { text: '공부 끝나는 시간을 말하고 그 뒤에 합류한다', habit: 'healthy' },
      { text: '오전에 많이 했으니 이제 놀아도 돼', habit: 'MORAL_LICENSING' },
      { text: '다들 가는데 나만 빠지면 안 되지', habit: 'EXTERNAL_BLAME' },
      { text: '어차피 오늘 계획은 반쯤 날아갔으니 다 놀자', habit: 'WHAT_THE_HELL' },
    ],
  },
  {
    id: 'two-weeks-left',
    situation: '시험까지 2주 남았어. 공부 계획을 세울 때 나는…',
    options: [
      { text: '2주면 넉넉하지, 하루에 세 과목씩은 하겠지', habit: 'PLANNING_FALLACY' },
      { text: '다음 주부터 본격적으로 시작하면 돼', habit: 'FUTURE_SELF' },
      { text: '완벽한 계획표가 나올 때까지 계획만 짠다', habit: 'ALL_OR_NOTHING' },
      { text: '과목마다 지난 시험 때 걸린 시간을 보고 나눈다', habit: 'healthy' },
    ],
  },
  {
    id: 'overslept',
    situation: '늦잠을 자서 아침 공부를 못 했어. 나는…',
    options: [
      { text: '나는 원래 아침에 약해, 늘 이래', habit: 'OVERGENERALIZING' },
      { text: '점심 뒤에 아침 분량의 절반만 한다', habit: 'healthy' },
      { text: '아침을 망쳤으니 오늘은 글렀다', habit: 'WHAT_THE_HELL' },
      { text: '어젯밤 늦게까지 공부했으니 이 정도는 괜찮아', habit: 'MORAL_LICENSING' },
    ],
  },
  {
    id: 'friend-score',
    situation: '친구 점수가 나보다 훨씬 높아. 드는 생각은?',
    options: [
      { text: '쟤는 좋은 학원에 다녀서 그래', habit: 'EXTERNAL_BLAME' },
      { text: '역시 나는 공부 머리가 아닌가 봐', habit: 'OVERGENERALIZING' },
      { text: '의욕이 확 떨어져서 오늘은 공부하기 싫다', habit: 'EMOTIONAL_REASONING' },
      { text: '친구가 어떻게 공부하는지 하나 물어본다', habit: 'healthy' },
    ],
  },
  {
    id: 'big-assignment',
    situation: '수행평가 과제가 생각보다 커. 나는…',
    options: [
      { text: '작게 나눠서 오늘 할 첫 조각을 정한다', habit: 'healthy' },
      { text: '하루 날 잡고 하면 금방 끝나', habit: 'PLANNING_FALLACY' },
      { text: '완벽하게 할 자신이 없어서 시작을 미룬다', habit: 'ALL_OR_NOTHING' },
      { text: '마감 전날 밤에 하면 집중이 더 잘 돼', habit: 'FUTURE_SELF' },
    ],
  },
  {
    id: 'tired-after-academy',
    situation: '학원 끝나고 너무 피곤해. 오늘 집 공부는?',
    options: [
      { text: '학원에서 공부했으니 집에서는 안 해도 돼', habit: 'MORAL_LICENSING' },
      { text: '피곤하다는 건 오늘은 쉬라는 뜻이야', habit: 'EMOTIONAL_REASONING' },
      { text: '10분짜리 복습 하나만 하고 잔다', habit: 'healthy' },
      { text: '제대로 머리에 안 들어갈 거면 아예 안 하는 게 낫다', habit: 'ALL_OR_NOTHING' },
    ],
  },
  {
    id: 'streak-broken',
    situation: '7일 동안 이어 온 공부 연속 기록이 끊겼어. 나는…',
    options: [
      { text: '기록 끊겼으니 이번 주는 그냥 쉬자', habit: 'WHAT_THE_HELL' },
      { text: '오늘부터 다시 1일째를 시작한다', habit: 'healthy' },
      { text: '난 뭘 해도 꾸준하지 못해', habit: 'OVERGENERALIZING' },
      { text: '월요일부터 새로 시작하면 깔끔하지', habit: 'FUTURE_SELF' },
    ],
  },
  {
    id: 'evening-review',
    situation: '저녁에 돌아보니 오늘 계획의 반도 못 했어. 드는 생각은?',
    options: [
      { text: '계획을 많이 넣긴 했지만 내일도 비슷하게 넣지 뭐', habit: 'PLANNING_FALLACY' },
      { text: '중간에 일이 자꾸 생겨서 어쩔 수 없었어', habit: 'EXTERNAL_BLAME' },
      { text: '오늘 기분이 계속 별로였으니까', habit: 'EMOTIONAL_REASONING' },
      { text: '못 한 이유 중에서 내가 바꿀 수 있는 걸 하나 적는다', habit: 'healthy' },
    ],
  },
  {
    id: 'after-hard-day',
    situation: '열심히 공부한 날 저녁, 나는…',
    options: [
      { text: '오늘 많이 했으니 게임 3시간은 괜찮아', habit: 'MORAL_LICENSING' },
      { text: '내일 할 것 하나만 미리 정해 두고 쉰다', habit: 'healthy' },
      { text: '오늘처럼만 하면 내일 계획은 두 배도 할 수 있겠지', habit: 'PLANNING_FALLACY' },
      { text: '오늘 잘 된 건 운이야, 내일은 또 안 될 거야', habit: 'OVERGENERALIZING' },
    ],
  },
  {
    id: 'exam-failed',
    situation: '시험을 망쳤어. 다음 시험 준비는?',
    options: [
      { text: '틀린 문제 유형부터 다시 본다', habit: 'healthy' },
      { text: '이번 시험 망쳤으니 이번 학기는 끝났어', habit: 'WHAT_THE_HELL' },
      { text: '제대로 할 수 없으면 그 과목은 차라리 포기한다', habit: 'ALL_OR_NOTHING' },
      { text: '이번 시험 준비하느라 고생했으니 한동안은 쉬어도 돼', habit: 'MORAL_LICENSING' },
    ],
  },
]

/** 생각 습관 하나의 점수 */
export interface ThinkingHabitScore {
  key: ThinkingHabitKey
  /** 고른 횟수 */
  chosen: number
  /** 보기에 나온 횟수 */
  appeared: number
  /** 나온 것 중 고른 비율 (0 ~ 100) */
  percent: number
}

/** 테스트 결과 */
export interface ThinkingTestResult {
  /** 습관 8개의 점수. 비율이 높은 것부터 (같으면 많이 고른 것부터, 그래도 같으면 목록 순서) */
  scores: ThinkingHabitScore[]
  /** 건강한 대처를 고른 횟수 */
  healthyCount: number
}

/** 이만큼 이상 고른 습관만 "많이 고른 습관" 으로 봅니다. 한 번은 우연일 수 있어서입니다. */
export const MIN_CHOSEN_FOR_TOP = 2

/**
 * 고른 답으로 점수를 냅니다. answers 는 "질문 id → 고른 보기 번호(0 ~ 3)" 입니다. 답하지 않은 질문은 셈에서 뺍니다.
 *
 *   계획 오류가 보기에 5번 나왔고 그중 3번 골랐으면 → chosen 3, appeared 5, percent 60
 */
export function scoreThinkingTest(answers: Record<string, number>): ThinkingTestResult {
  const keys = Object.keys(thinkingHabits) as ThinkingHabitKey[]
  const chosen: Record<string, number> = {}
  const appeared: Record<string, number> = {}
  let healthyCount = 0

  for (const question of thinkingTestQuestions) {
    // 보기에 나온 횟수는 답했든 안 했든 질문 전체로 셉니다. (비율의 기준이 사람마다 달라지지 않게)
    for (const option of question.options) {
      if (option.habit !== 'healthy') appeared[option.habit] = (appeared[option.habit] ?? 0) + 1
    }
    const picked = question.options[answers[question.id]]
    if (picked === undefined) continue
    if (picked.habit === 'healthy') healthyCount += 1
    else chosen[picked.habit] = (chosen[picked.habit] ?? 0) + 1
  }

  const scores = keys.map((key) => {
    const chosenCount = chosen[key] ?? 0
    const appearedCount = appeared[key] ?? 0
    return {
      key,
      chosen: chosenCount,
      appeared: appearedCount,
      percent: appearedCount === 0 ? 0 : Math.round((chosenCount / appearedCount) * 100),
    }
  })
  // sort 는 같은 값이면 원래 순서를 지킵니다. 그래서 마지막 기준은 목록 순서가 됩니다.
  scores.sort((a, b) => b.percent - a.percent || b.chosen - a.chosen)
  return { scores, healthyCount }
}

/** 많이 고른 습관들 (2번 이상 고른 것 중 위에서부터 max 개). 없으면 빈 목록 */
export function getTopHabits(result: ThinkingTestResult, max = 2): ThinkingHabitScore[] {
  return result.scores.filter((score) => score.chosen >= MIN_CHOSEN_FOR_TOP).slice(0, max)
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

/** 저장해 두는 테스트 기록 */
export interface SavedThinkingTest {
  /** 질문 id → 고른 보기 번호 */
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
  saveData<SavedThinkingTest>(STORAGE_KEY, {
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
