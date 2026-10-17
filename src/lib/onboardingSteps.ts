import { toDayDate } from '@/lib/date'
import { loadData } from '@/lib/storage'

/**
 * 온보딩 설문의 질문(단계) 목록입니다.
 *
 * 한 화면에 질문 하나씩 보여주고, 화면(OnboardingPage)은 이 배열을 위에서부터 차례로 읽어서 그립니다.
 * 그래서 질문을 더하거나 순서를 바꾸려면 아래 onboardingSteps 배열만 고치면 됩니다.
 *
 * ■ 다른 이슈(#88 현재 수준, #89 실패 경험·자기 인식·동기)에서 단계를 끼워 넣는 방법
 *   1. onboardingSteps 에 객체를 하나 더합니다. (group 을 새 이름으로 쓰면 새 묶음이 됩니다)
 *   2. key 는 #78 의 OnboardingAnswers 필드 이름과 똑같이 씁니다. 답이 그 이름으로 저장됩니다.
 *   3. 아래 모양(choice, text, date, time)으로 안 되는 질문이면
 *      (예: 여러 개 고르기) 위에 Step 모양을 하나 더 만들고, OnboardingPage 의 StepInput 에도 한 줄 더하세요.
 *
 * ■ 처음에 묻는 질문과 나중에 묻는 질문 (#239 → #388)
 *   질문이 19개면 시작도 하기 전에 지칩니다. 그래서 처음 온보딩에서 묻는 질문에만 firstStage 를 붙이고,
 *   나머지는 설정의 "내 정보 더 알려주기" 에서 천천히 답하게 했습니다. (아래 getFirstSteps, getUnansweredSteps)
 *   처음 온보딩(기획서 4.1, 약 3분)은 앱 소개 → 학년(basic) → 심리검사 → 자기 인식 4문항(hypotheses) 순서입니다.
 *   두 묶음 사이에 심리검사가 있어서 묶음을 나눴습니다. 순서는 lib/onboardingProgress.ts 의 STAGES 가 정합니다.
 *   관리 강도 한도와 메시지 설정은 묻지 않고 기본값으로 시작합니다. 설정 화면에서 언제든 바꿉니다.
 */

/** 모든 단계가 같이 가지는 정보 */
interface BaseStep {
  /** 답을 저장하는 이름. #78 의 OnboardingAnswers 필드 이름과 똑같이 씁니다. */
  key: string
  /** 묶음 이름. 진행 막대 위에 보입니다. (예: '기본 정보') */
  group: string
  /** 질문 */
  title: string
  /** 질문 아래에 보이는 작은 설명 (없어도 됩니다) */
  description?: string
  /** true 면 비워 두고 넘어갈 수 있습니다. */
  optional?: boolean
  /**
   * 처음 온보딩의 어느 묶음에서 묻는지. 없으면 나중에 "내 정보 더 알려주기" 에서 묻습니다. (#239, #388)
   *   basic: 학년 (심리검사 앞)
   *   hypotheses: 자기 인식 4문항 (심리검사 뒤). 답은 '내 가설' 로도 저장해서 나중에 기록으로 확인합니다. (lib/myHypotheses.ts)
   */
  firstStage?: FirstStage
}

/** 처음 온보딩의 질문 묶음 이름 */
export type FirstStage = 'basic' | 'hypotheses'

/** '잘 모르겠음' 보기의 값. 자기 인식 4문항은 모두 이 보기를 고를 수 있습니다. (기획서 4.1, BE#219 의 UNKNOWN) */
export const UNKNOWN_ANSWER = 'unknown'
const UNKNOWN_OPTION = { value: UNKNOWN_ANSWER, label: '잘 모르겠음' }

/**
 * 보기 하나. 글자(string)로 적으면 보이는 글자와 저장되는 값이 같습니다. (예: '고2')
 * 보이는 글자와 저장할 값이 다르면 { value, label } 로 적습니다. (예: 화면엔 '아침형', 저장은 'morning')
 */
export type ChoiceOption = string | { value: string; label: string }

/** 보기 하나를 { value, label } 모양으로 맞춥니다. (화면은 이걸 받아서 그립니다) */
export function toChoiceOption(option: ChoiceOption): { value: string; label: string } {
  return typeof option === 'string' ? { value: option, label: option } : option
}

/** 보기 중 하나를 고르는 질문 */
interface ChoiceStep extends BaseStep {
  type: 'choice'
  options: ChoiceOption[]
}

/**
 * 보기 중 여러 개를 고르는 질문. 답은 고른 값을 쉼표로 이은 글자 하나로 저장됩니다. (예: 'weekend,phone')
 * 하나도 안 골랐으면 빈 글자입니다. 쉼표로 자르려면 parseMultiAnswer 를 씁니다.
 */
interface MultiChoiceStep extends BaseStep {
  type: 'multiChoice'
  options: { value: string; label: string }[]
}

/** 한 줄로 글자를 적는 질문 */
interface TextStep extends BaseStep {
  type: 'text'
  placeholder: string
  maxLength: number
}

/** 날짜를 고르는 질문. 답은 'YYYY-MM-DD' 글자로 저장됩니다. */
interface DateStep extends BaseStep {
  type: 'date'
}

/** 시각을 고르는 질문. 답은 'HH:MM' 글자로 저장됩니다. */
interface TimeStep extends BaseStep {
  type: 'time'
}

/**
 * 과목마다 최근 성적(등급 또는 점수)과 자신감(1~5)을 받는 질문. (#88)
 * 과목은 과목 관리의 과목 목록(loadSubjects)을 그대로 보여줍니다.
 * 답은 과목별 수준 목록을 JSON 글자로 바꾼 것이고, 건너뛰면 빈 글자입니다. (lib/subjectLevel.ts)
 */
interface SubjectLevelsStep extends BaseStep {
  type: 'subjectLevels'
}

export type OnboardingStep =
  ChoiceStep | MultiChoiceStep | TextStep | DateStep | TimeStep | SubjectLevelsStep

/** 쉼표로 이은 여러 개 고르기 답을 값 목록으로 자릅니다. 빈 글자면 빈 목록입니다.  'weekend,phone' -> ['weekend', 'phone'] */
export function parseMultiAnswer(answer: string): string[] {
  return answer === '' ? [] : answer.split(',')
}

/**
 * 여러 개 고르기에서 값 하나를 켜거나 끕니다. 이미 골랐으면 빼고, 아니면 더합니다.
 * 저장되는 순서는 보기 순서(optionValues)를 따라서, 어떤 순서로 눌러도 같은 답이 됩니다.
 *
 *   toggleMultiAnswer('weekend', 'phone', ['afterExam', 'weekend', 'phone'])  -> 'weekend,phone'
 *   toggleMultiAnswer('weekend,phone', 'weekend', [...])                      -> 'phone'
 */
export function toggleMultiAnswer(
  answer: string,
  optionValue: string,
  optionValues: string[],
): string {
  const picked = new Set(parseMultiAnswer(answer))
  if (picked.has(optionValue)) picked.delete(optionValue)
  else picked.add(optionValue)
  return optionValues.filter((value) => picked.has(value)).join(',')
}

/** 질문 목록. 위에서부터 차례로 보입니다. */
export const onboardingSteps: OnboardingStep[] = [
  /* ---------- 기본 정보 ---------- */
  {
    key: 'grade',
    group: '기본 정보',
    firstStage: 'basic',
    type: 'choice',
    title: '지금 몇 학년이야?',
    description: '학년에 맞춰서 공부 시간을 추천해 줄게요.',
    options: ['고1', '고2', '고3', 'N수', '대학생', '기타'],
  },
  {
    // 시험·시험일·공부 이유는 처음 온보딩에서 빠지고 목표 만들기(#391)로 옮깁니다. 그때까지는 "내 정보 더 알려주기" 에서 묻습니다. (#388)
    key: 'targetExam',
    group: '기본 정보',
    type: 'text',
    title: '어떤 시험을 준비하고 있어?',
    description: '가장 가까운 큰 시험 하나만 적어 주세요.',
    placeholder: '예) 수능',
    maxLength: 30,
  },
  {
    key: 'targetExamDate',
    group: '기본 정보',
    type: 'date',
    title: '그 시험은 언제야?',
    description: '날짜를 고르면 시험까지 남은 날(D-day)을 계산해 줄게요.',
  },
  {
    key: 'targetUniversity',
    group: '기본 정보',
    type: 'text',
    optional: true,
    title: '가고 싶은 대학이 있어?',
    description: '아직 없으면 건너뛰어도 돼요.',
    placeholder: '예) 서울대학교',
    maxLength: 30,
  },
  {
    key: 'targetScore',
    group: '기본 정보',
    type: 'text',
    optional: true,
    title: '목표 점수나 등급이 있어?',
    description: '아직 없으면 건너뛰어도 돼요.',
    placeholder: '예) 평균 2등급',
    maxLength: 30,
  },

  /* ---------- 현재 수준 (#88) ---------- */
  // first 가 없어서 처음에는 묻지 않고, 설정의 "내 정보 더 알려주기" 에서 묻습니다. (#239)
  // 과목 배분과 성적 연결 분석(기획서 v2 3장 ⑦)에 쓰는 재료입니다.
  {
    key: 'subjectLevels',
    group: '현재 수준',
    type: 'subjectLevels',
    optional: true,
    title: '과목별 최근 성적과 자신감을 알려줘',
    description: '모르는 과목은 비워 두고, 전부 모르겠으면 건너뛰어도 돼요.',
  },

  /* ---------- 생활 리듬 ---------- */
  {
    key: 'wakeUpTime',
    group: '생활 리듬',
    type: 'time',
    title: '평소에 몇 시에 일어나?',
    description: '평일 기준으로 골라 주세요.',
  },
  {
    key: 'sleepTime',
    group: '생활 리듬',
    type: 'time',
    title: '평소에 몇 시에 자?',
    description: '평일 기준으로 골라 주세요.',
  },
  {
    key: 'schoolEndTime',
    group: '생활 리듬',
    type: 'time',
    optional: true,
    title: '학교는 몇 시에 끝나?',
    description: '학교에 안 다니면 건너뛰어도 돼요.',
  },
  {
    key: 'academyEndTime',
    group: '생활 리듬',
    type: 'time',
    optional: true,
    title: '학원은 몇 시에 끝나?',
    description: '학원에 안 다니면 건너뛰어도 돼요.',
  },
  {
    key: 'studyPlace',
    group: '생활 리듬',
    type: 'choice',
    title: '주로 어디서 공부해?',
    options: ['집', '학교', '학원', '독서실·도서관', '카페', '기타'],
  },

  /* ---------- 과거 실패 경험 (#89) ---------- */
  // 답은 PastFailureCause 값을 쉼표로 이은 글자입니다. (예: 'weekend,phone') 첫 가설과 첫 개선안에 씁니다.
  {
    key: 'pastFailureCauses',
    group: '과거 실패 경험',
    type: 'multiChoice',
    optional: true,
    title: '계획이 주로 언제 무너졌어?',
    description: '해당되는 걸 모두 골라 주세요. 잘 모르겠으면 건너뛰어도 돼요.',
    options: [
      { value: 'afterExam', label: '시험 끝난 직후' },
      { value: 'weekend', label: '주말' },
      { value: 'lateAcademy', label: '학원 늦게 끝난 날' },
      { value: 'phone', label: '폰 보다가' },
      { value: 'tooMuchPlan', label: '계획이 많아서' },
    ],
  },

  /* ---------- 자기 인식 (#89 → #388) ---------- */
  // 처음 온보딩의 마지막 묶음입니다. 답은 '내 가설' 로 저장해서, 나중에 기록으로 확인하거나 반박합니다. (#411)
  // "나보다 나를 더 잘 아네?" 를 만드는 재료라, 모르면 '잘 모르겠음' 을 골라도 됩니다.
  // 숫자 답(분)은 글자로 저장되고, 값은 OnboardingAnswers 의 단위(분)와 같습니다.
  {
    key: 'chronotype',
    group: '내 가설',
    firstStage: 'hypotheses',
    type: 'choice',
    title: '나는 아침형일까, 밤형일까?',
    description: '정답은 없어요. 2주 동안 기록으로 같이 확인해 볼게요.',
    options: [
      { value: 'morning', label: '아침형이야' },
      { value: 'night', label: '밤형이야' },
      UNKNOWN_OPTION,
    ],
  },
  {
    key: 'maxFocusMinutes',
    group: '내 가설',
    firstStage: 'hypotheses',
    type: 'choice',
    title: '한 번 앉으면 얼마나 집중할 수 있어?',
    options: [
      { value: '30', label: '30분 안팎' },
      { value: '50', label: '50분 안팎' },
      { value: '90', label: '1시간 반 안팎' },
      { value: '120', label: '2시간 이상' },
      UNKNOWN_OPTION,
    ],
  },
  {
    key: 'biggestDistraction',
    group: '내 가설',
    firstStage: 'hypotheses',
    type: 'choice',
    title: '공부할 때 가장 큰 방해 요소는?',
    options: ['폰·SNS', '졸림', '잡생각', '친구·가족', '소음·주변 환경', '기타', UNKNOWN_OPTION],
  },
  {
    key: 'dailyAvailableMinutes',
    group: '내 가설',
    firstStage: 'hypotheses',
    type: 'choice',
    title: '평일 하루에 공부할 수 있는 시간은?',
    description: '학교·학원 시간을 뺀, 내가 쓸 수 있는 시간이에요.',
    options: [
      { value: '60', label: '1시간' },
      { value: '120', label: '2시간' },
      { value: '180', label: '3시간' },
      { value: '240', label: '4시간' },
      { value: '300', label: '5시간 이상' },
      UNKNOWN_OPTION,
    ],
  },

  /* ---------- 동기 (#89) ---------- */
  // 글로 적는 질문은 비워도 됩니다. 적어 두면 당근 메시지에 씁니다.
  {
    key: 'motivationReason',
    group: '동기',
    type: 'text',
    optional: true,
    title: '공부하는 이유가 뭐야?',
    description: '한 줄이면 충분해요. 아직 없으면 건너뛰어도 돼요.',
    placeholder: '예) 하고 싶은 일을 하려고',
    maxLength: 50,
  },
  {
    key: 'goalReward',
    group: '동기',
    type: 'text',
    optional: true,
    title: '목표를 이루면 제일 하고 싶은 건?',
    description: '한 줄이면 충분해요. 아직 없으면 건너뛰어도 돼요.',
    placeholder: '예) 친구들이랑 여행 가기',
    maxLength: 50,
  },
]

/**
 * 저장해 둔 온보딩 답을 불러옵니다. 설문을 한 번도 안 했으면 null 입니다.
 * 저장된 값이 { 질문 이름: 답 } 모양이 아니면(깨졌으면) 설문을 안 한 것으로 봅니다.
 */
export function loadOnboardingAnswers(): Record<string, string> | null {
  const saved = loadData<unknown>('onboarding-answers', null)
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return null
  return saved as Record<string, string>
}

/** 처음 온보딩의 한 묶음에서 묻는 질문들 (firstStage 가 그 묶음인 것만). (#239, #388) */
export function getFirstSteps(stage: FirstStage): OnboardingStep[] {
  return onboardingSteps.filter((step) => step.firstStage === stage)
}

/**
 * 처음 온보딩의 한 묶음을 끝냈는지. 그 묶음의 질문이 모두 저장된 답에 있으면 끝낸 것입니다.
 * 묶음을 끝낼 때 답을 한꺼번에 저장해서, 하나라도 없으면 아직 안 끝낸 것입니다.
 *
 *   isFirstStageDone({ grade: '고2' }, 'basic')        -> true
 *   isFirstStageDone({ grade: '고2' }, 'hypotheses')   -> false
 */
export function isFirstStageDone(
  answers: Record<string, string> | null,
  stage: FirstStage,
): boolean {
  if (answers === null) return false
  return getFirstSteps(stage).every((step) => (answers[step.key] ?? '') !== '')
}

/**
 * 아직 답하지 않은 질문들을 돌려줍니다. 설정의 "내 정보 더 알려주기" 가 이 질문들을 이어서 묻습니다. (#239)
 *
 * "답한 질문" = 저장된 답(answers)에 그 질문의 이름(key)이 있는 질문입니다.
 * 건너뛴 선택 질문은 빈 글자('')로 저장해 두어서, 이름이 있으니 다시 묻지 않습니다.
 *
 * ■ 예시
 *   getUnansweredSteps({ grade: '고2', chronotype: 'night', maxFocusMinutes: '50', biggestDistraction: '폰·SNS', dailyAvailableMinutes: '180' })
 *     -> 처음 온보딩에서 안 묻는 질문 14개
 *   getUnansweredSteps({ ...위의 답, motivationReason: '', wakeUpTime: '07:00' })
 *     -> 12개  (이유는 건너뛴 것으로 저장됐고, 기상 시각은 답했음)
 */
export function getUnansweredSteps(answers: Record<string, string>): OnboardingStep[] {
  return onboardingSteps.filter((step) => !(step.key in answers))
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 'YYYY-MM-DD' 날짜가 오늘로부터 며칠 뒤인지 셉니다. (오늘 = 0, 내일 = 1, 어제 = -1)
 * 날짜가 아닌 글자(빈 글자 등)가 들어오면 NaN 입니다.
 *
 * now 는 "오늘이 언제인지" 입니다. 평소엔 비워 두면 되고, 확인할 때 날짜를 바꿔 넣을 수 있습니다.
 *
 *   (아래 now 는 10월 10일 낮 12시입니다)
 *   getDaysUntil('2026-10-15', new Date(2026, 9, 10, 12))  ->  5
 *   getDaysUntil('2026-10-10', new Date(2026, 9, 10, 12))  ->  0
 *   getDaysUntil('2026-10-09', new Date(2026, 9, 10, 12))  ->  -1
 */
export function getDaysUntil(dateText: string, now: Date = new Date()): number {
  const [year, month, day] = dateText.split('-').map(Number)
  // 'YYYY-MM-DD' 글자를 그대로 new Date 에 넣으면 영국 시간으로 읽혀서 하루가 어긋납니다. 년·월·일을 쪼개서 만듭니다.
  const target = new Date(year, month - 1, day)
  // 오늘도 시각을 버리고 날짜만 남깁니다. (오후 3시에 봐도 오늘 = 0 이 되도록)
  // 오늘은 하루의 기준(새벽 4시)으로 정합니다. 새벽 2시면 아직 어제입니다. (lib/date.ts)
  const todayDate = toDayDate(now)
  const today = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY)
}

/**
 * 이 단계의 답이 "다음" 으로 넘어갈 수 있는 답인지 알려줍니다.
 *
 * - 비어 있으면: 선택 질문(optional)일 때만 통과합니다.
 * - 날짜 질문이면: 오늘이거나 이후 날짜여야 합니다. (이미 지난 시험 날짜는 D-day 를 셀 수 없습니다)
 * - 그 밖에는 적었으면 통과합니다.
 */
export function isAnswerValid(
  step: OnboardingStep,
  value: string,
  now: Date = new Date(),
): boolean {
  if (value.trim() === '') return step.optional === true
  if (step.type === 'date') return getDaysUntil(value, now) >= 0
  return true
}
