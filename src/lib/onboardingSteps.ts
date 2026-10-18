import { toDayDate } from '@/lib/date'
import { loadData } from '@/lib/storage'

/**
 * 온보딩 설문의 질문(단계) 목록입니다.
 *
 * 한 화면에 질문 하나씩 보여주고, 화면(OnboardingPage)은 이 배열을 위에서부터 차례로 읽어서 그립니다.
 * 그래서 질문을 더하거나 순서를 바꾸려면 아래 onboardingSteps 배열만 고치면 됩니다.
 *
 * ■ 질문을 더하는 방법
 *   1. onboardingSteps 에 객체를 하나 더합니다. (group 을 새 이름으로 쓰면 새 묶음이 됩니다)
 *   2. key 는 #78 의 OnboardingAnswers 필드 이름과 똑같이 씁니다. 답이 그 이름으로 저장됩니다.
 *   3. 지금은 보기 중 하나 고르기(choice)만 있습니다. 다른 모양이 필요하면 Step 모양을 더하고 OnboardingPage 의 StepInput 에도 더하세요.
 *
 * ■ 묻는 질문 (최종 기획서 「4.1 온보딩」)
 *   앱 소개 → 학년(basic) → 심리검사 → 자기 인식 4문항(hypotheses) → 관리 설정 → 결과 순서입니다. 순서는 lib/onboardingProgress.ts 의 STAGES 가 정합니다.
 *   두 묶음 사이에 심리검사가 있어서 묶음을 나눴습니다.
 *   예전에 설정의 "내 정보 더 알려주기" 에서 묻던 질문 13개(시험 · 과목별 성적 · 생활 리듬 · 공부 장소 · 실패 경험 · 동기)와
 *   생각 습관 테스트는 최종 기획서에 없어서 #417 에서 지웠습니다. (수면 보호 시각은 관리 설정 화면이 묻습니다)
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
   * 처음 온보딩의 어느 묶음에서 묻는지. (#239, #388)
   *   basic: 학년 (심리검사 앞)
   * (자기 인식 4문항 'hypotheses' 묶음은 2026-10-18 사용자 결정 "주관적이라 쓸데가 없어, 객관적 데이터만" 으로 지웠습니다)
   */
  firstStage?: FirstStage
}

/** 처음 온보딩의 질문 묶음 이름 */
export type FirstStage = 'basic'

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

/** 질문 한 개. 지금 남은 질문(학년)은 보기 중 하나 고르기입니다. */
export type OnboardingStep = ChoiceStep

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
 *   isFirstStageDone({ grade: '고2' }, 'basic')   -> true
 *   isFirstStageDone({}, 'basic')                -> false
 */
export function isFirstStageDone(
  answers: Record<string, string> | null,
  stage: FirstStage,
): boolean {
  if (answers === null) return false
  return getFirstSteps(stage).every((step) => (answers[step.key] ?? '') !== '')
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
 * - 그 밖에는 골랐으면 통과합니다.
 */
export function isAnswerValid(step: OnboardingStep, value: string): boolean {
  if (value.trim() === '') return step.optional === true
  return true
}
