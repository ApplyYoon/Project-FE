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
 *      답이 글자 하나가 아닌 단계(careLimits, messageSettings)는 OnboardingPage 가 StepInput 대신 따로 그립니다.
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
}

/** 보기 중 하나를 고르는 질문 */
interface ChoiceStep extends BaseStep {
  type: 'choice'
  options: string[]
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
 * AI 메시지 횟수·연락 금지 시간을 고르는 단계. 설정 화면과 같은 입력칸(MessageSettingsFields)을 씁니다.
 * 답은 온보딩 답이 아니라 메시지 설정(lib/messageSettings)으로 "완료" 때 저장됩니다.
 */
interface MessageSettingsStep extends BaseStep {
  type: 'messageSettings'
}

/**
 * 관리 강도 최대 한도·독설 허용 수위를 고르는 단계 (#59). 설정 화면과 같은 화면 조각(CareLimitPickers)을 씁니다.
 * 답은 온보딩 답이 아니라 관리 한도(lib/careLimits)로 "완료" 때 저장되고, 바로 적용됩니다.
 */
interface CareLimitsStep extends BaseStep {
  type: 'careLimits'
}

export type OnboardingStep =
  ChoiceStep | TextStep | DateStep | TimeStep | CareLimitsStep | MessageSettingsStep

/** 질문 목록. 위에서부터 차례로 보입니다. */
export const onboardingSteps: OnboardingStep[] = [
  /* ---------- 기본 정보 ---------- */
  {
    key: 'grade',
    group: '기본 정보',
    type: 'choice',
    title: '지금 몇 학년이야?',
    description: '학년에 맞춰서 공부 시간을 추천해 줄게요.',
    options: ['고1', '고2', '고3', 'N수', '대학생'],
  },
  {
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

  /* ---------- 관리 설정 ---------- */
  {
    key: 'careLimits',
    group: '관리 설정',
    type: 'careLimits',
    title: 'AI 가 얼마나 세게 챙겨도 돼?',
    description: '정한 한도는 절대 넘지 않아요. 나중에 설정에서 언제든 바꿀 수 있어요.',
  },
  {
    key: 'messageSettings',
    group: '관리 설정',
    type: 'messageSettings',
    title: 'AI 연락은 언제, 얼마나 받을래?',
    description: '나중에 설정에서 언제든 바꿀 수 있어요.',
  },
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 'YYYY-MM-DD' 날짜가 오늘로부터 며칠 뒤인지 셉니다. (오늘 = 0, 내일 = 1, 어제 = -1)
 * 날짜가 아닌 글자(빈 글자 등)가 들어오면 NaN 입니다.
 *
 * now 는 "오늘이 언제인지" 입니다. 평소엔 비워 두면 되고, 확인할 때 날짜를 바꿔 넣을 수 있습니다.
 *
 *   getDaysUntil('2026-10-15', new Date(2026, 9, 10))  ->  5
 *   getDaysUntil('2026-10-10', new Date(2026, 9, 10))  ->  0
 *   getDaysUntil('2026-10-09', new Date(2026, 9, 10))  ->  -1
 */
export function getDaysUntil(dateText: string, now: Date = new Date()): number {
  const [year, month, day] = dateText.split('-').map(Number)
  // 'YYYY-MM-DD' 글자를 그대로 new Date 에 넣으면 영국 시간으로 읽혀서 하루가 어긋납니다. 년·월·일을 쪼개서 만듭니다.
  const target = new Date(year, month - 1, day)
  // 오늘도 시각을 버리고 날짜만 남깁니다. (오후 3시에 봐도 오늘 = 0 이 되도록)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
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
  // 관리 한도·메시지 설정은 처음 값이 들어 있어서 그대로 넘어가도 됩니다.
  // (관리 한도 2단계·독설 3, 메시지 하루 3번·23:00 ~ 07:00)
  if (step.type === 'careLimits' || step.type === 'messageSettings') return true
  if (value.trim() === '') return step.optional === true
  if (step.type === 'date') return getDaysUntil(value, now) >= 0
  return true
}
