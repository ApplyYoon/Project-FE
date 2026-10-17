/**
 * 온보딩(가입 직후 처음 한 번 하는 설정)이 어디까지 됐는지 계산하고, 처음부터 다시 하게 지웁니다.
 * React 없이 저장된 값만 봅니다.
 *
 *   순서: 처음 다짐 → 온보딩 질문 → 생각 습관 테스트 → 처음 계획 → (준비 끝)
 *
 * 끝나지 않은 첫 단계가 "이어서 할 자리" 입니다. RequireAuth 가 이 자리로 보내서,
 * 로고나 홈을 눌러도 하던 곳으로 돌아옵니다. 온보딩을 다 끝내야 앱의 다른 화면이 열립니다.
 * 하다 만 사람이 다음에 다시 들어오면 "이어하기 / 처음부터 다시" 를 먼저 고르게 합니다. (OnboardingResumePage)
 */
import { loadInitialPlan } from '@/lib/initialPlan'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { loadData, removeData } from '@/lib/storage'
import { THINKING_TEST_PATH, hasThinkingTest } from '@/lib/thinkingTest'
import { PLEDGE_PATH, hasSeenPledge } from '@/lib/voicePledge'

/** "이어하기 / 처음부터 다시" 를 고르는 화면의 주소 */
export const ONBOARDING_RESUME_PATH = '/onboarding/resume'

/** 온보딩 단계 하나 */
interface OnboardingStage {
  /** 화면에 보여줄 이름 */
  label: string
  /** 이 단계를 하는 주소 */
  path: string
  /** 이 단계를 끝냈는지 */
  isDone: () => boolean
}

const STAGES: OnboardingStage[] = [
  { label: '처음 다짐', path: PLEDGE_PATH, isDone: hasSeenPledge },
  // 하다 만 질문이 있으면 OnboardingPage 가 그 질문부터 보여 줍니다.
  { label: '온보딩 질문', path: '/onboarding', isDone: () => loadOnboardingAnswers() !== null },
  // 답하다 만 문제가 있으면 OnboardingThinkingPage 가 그 문제부터 보여 줍니다.
  // from=onboarding: 테스트가 끝나면 홈이 아니라 처음 계획으로 이어지게 합니다.
  {
    label: '생각 습관 테스트',
    path: `${THINKING_TEST_PATH}?from=onboarding`,
    isDone: hasThinkingTest,
  },
  { label: '처음 계획', path: '/onboarding/plan', isDone: () => loadInitialPlan() !== null },
]

/** 단계마다 이름과 끝냈는지를 돌려줍니다. "이어하기" 화면에서 어디까지 했는지 보여줄 때 씁니다. */
export function getOnboardingStages(): { label: string; isDone: boolean }[] {
  return STAGES.map((stage) => ({ label: stage.label, isDone: stage.isDone() }))
}

/** 온보딩을 이어서 할 주소(끝나지 않은 첫 단계)입니다. 다 끝났으면 null 입니다. */
export function getOnboardingResumePath(): string | null {
  const nextStage = STAGES.find((stage) => !stage.isDone())
  return nextStage ? nextStage.path : null
}

// 하다 만 답을 임시로 넣어 두는 이름들입니다. (OnboardingPage · OnboardingThinkingPage 의 DRAFT_KEY)
const DRAFT_KEYS = ['onboarding-draft', 'thinking-test-draft']

/** 온보딩을 조금이라도 해 둔 게 있는지. 끝낸 단계나 하다 만 답이 하나라도 있으면 true 입니다. */
export function hasOnboardingProgress(): boolean {
  const hasDoneStage = STAGES.some((stage) => stage.isDone())
  const hasDraft = DRAFT_KEYS.some((key) => loadData<unknown>(key, null) !== null)
  return hasDoneStage || hasDraft
}

/**
 * 온보딩을 처음부터 다시 하도록 지금까지의 답을 지웁니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙입니다)
 * - 처음 다짐의 녹음은 지우지 않습니다. 다짐 화면에 그대로 보이고, 거기서 다시 녹음할 수 있습니다.
 * - 처음 계획은 마지막 단계라서, 온보딩이 안 끝난 동안에는 아직 없습니다. 그래서 지울 것이 없습니다.
 */
export function resetOnboarding(): void {
  // 온보딩 질문의 답 (OnboardingPage 의 STORAGE_KEY), 생각 습관 테스트 결과 (lib/thinkingTest.ts)
  removeData('onboarding-answers')
  removeData('thinking-test')
  for (const key of DRAFT_KEYS) removeData(key)
}

// "이번 접속에서 이미 이어하기를 물었다" 는 표시입니다.
// sessionStorage 는 탭을 닫으면 사라져서, 다음에 들어오면 다시 묻게 됩니다. (같은 접속 안에서는 다시 묻지 않습니다)
const RESUME_ASKED_KEY = 'study-onboarding-resume-asked'

/** 이번 접속에서 "이어하기 / 처음부터 다시" 를 이미 물었는지 (또는 이번 접속에서 온보딩을 시작했는지) */
export function wasResumeAsked(): boolean {
  try {
    return sessionStorage.getItem(RESUME_ASKED_KEY) === 'true'
  } catch {
    // 저장소를 쓸 수 없는 브라우저(시크릿 창 등)에서는 묻지 않은 것으로 봅니다.
    return false
  }
}

/** 이번 접속에서는 다시 묻지 않게 표시합니다. */
export function markResumeAsked(): void {
  try {
    sessionStorage.setItem(RESUME_ASKED_KEY, 'true')
  } catch {
    // 저장하지 못해도 화면은 계속 쓸 수 있습니다. (로고를 누르면 한 번 더 물을 뿐입니다)
  }
}

/** 표시를 지웁니다. 로그아웃하고 다시 로그인하면 다시 묻게 하려고 씁니다. */
export function clearResumeAsked(): void {
  try {
    sessionStorage.removeItem(RESUME_ASKED_KEY)
  } catch {
    // 지우지 못하면 다음 로그인에서 묻지 않고 하던 자리로 바로 갑니다.
  }
}
