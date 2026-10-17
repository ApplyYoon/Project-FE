import { Layout } from '@/components/layout/Layout'
import { RedirectWithQuery } from '@/components/layout/RedirectWithQuery'
import { RequireAuth } from '@/components/layout/RequireAuth'
import {
  ONBOARDING_CARE_PATH,
  ONBOARDING_HYPOTHESES_PATH,
  ONBOARDING_INTRO_PATH,
  ONBOARDING_RESULT_PATH,
  ONBOARDING_RESUME_PATH,
} from '@/lib/onboardingProgress'
import { PSYCH_TEST_PATH } from '@/lib/psychTest'
import { ANALYSIS_PATH } from '@/lib/tabMenu'
import { THINKING_TEST_PATH } from '@/lib/thinkingTest'
import { PageBoundary } from '@/components/layout/PageBoundary'
import { SubjectsGate } from '@/components/layout/SubjectsGate'
import { ErrorPage } from '@/pages/ErrorPage'
import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'

/*
 * 화면 파일은 그 주소에 처음 갈 때 받아옵니다. (Lazy Load)
 * 처음에 앱 전체를 한꺼번에 받지 않아서 첫 화면이 빨리 뜹니다. 받아오는 동안의 스켈레톤과 실패 안내는 PageBoundary 가 맡습니다.
 * 화면들은 export function XxxPage 로 내보내서(named export), lazy 가 바라는 default 모양으로 바꿔 넘깁니다.
 * ErrorPage 는 에러가 났을 때 바로 떠야 해서 lazy 로 받지 않습니다.
 */
const AboutPage = lazy(() => import('@/pages/AboutPage').then((m) => ({ default: m.AboutPage })))
const AccountPage = lazy(() =>
  import('@/pages/AccountPage').then((m) => ({ default: m.AccountPage })),
)
const AnalysisPage = lazy(() =>
  import('@/pages/AnalysisPage').then((m) => ({ default: m.AnalysisPage })),
)
const CallActivePage = lazy(() =>
  import('@/pages/CallActivePage').then((m) => ({ default: m.CallActivePage })),
)
const CallPage = lazy(() => import('@/pages/CallPage').then((m) => ({ default: m.CallPage })))
const CallResultPage = lazy(() =>
  import('@/pages/CallResultPage').then((m) => ({ default: m.CallResultPage })),
)
const CardEditPage = lazy(() =>
  import('@/pages/CardEditPage').then((m) => ({ default: m.CardEditPage })),
)
const CardsPage = lazy(() => import('@/pages/CardsPage').then((m) => ({ default: m.CardsPage })))
const CheckPage = lazy(() => import('@/pages/CheckPage').then((m) => ({ default: m.CheckPage })))
const CounselPage = lazy(() =>
  import('@/pages/CounselPage').then((m) => ({ default: m.CounselPage })),
)
const DiaryPage = lazy(() => import('@/pages/DiaryPage').then((m) => ({ default: m.DiaryPage })))
const ExamResultPage = lazy(() =>
  import('@/pages/ExamResultPage').then((m) => ({ default: m.ExamResultPage })),
)
const ExamsPage = lazy(() => import('@/pages/ExamsPage').then((m) => ({ default: m.ExamsPage })))
const GoalDetailPage = lazy(() =>
  import('@/pages/GoalDetailPage').then((m) => ({ default: m.GoalDetailPage })),
)
const GoalNewPage = lazy(() =>
  import('@/pages/GoalNewPage').then((m) => ({ default: m.GoalNewPage })),
)
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const OnboardingDonePage = lazy(() =>
  import('@/pages/OnboardingDonePage').then((m) => ({ default: m.OnboardingDonePage })),
)
const OnboardingCarePage = lazy(() =>
  import('@/pages/OnboardingCarePage').then((m) => ({ default: m.OnboardingCarePage })),
)
const OnboardingResultPage = lazy(() =>
  import('@/pages/OnboardingResultPage').then((m) => ({ default: m.OnboardingResultPage })),
)
const OnboardingIntroPage = lazy(() =>
  import('@/pages/OnboardingIntroPage').then((m) => ({ default: m.OnboardingIntroPage })),
)
const OnboardingPage = lazy(() =>
  import('@/pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
)
const OnboardingPlanPage = lazy(() =>
  import('@/pages/OnboardingPlanPage').then((m) => ({ default: m.OnboardingPlanPage })),
)
const OnboardingPsychTestPage = lazy(() =>
  import('@/pages/OnboardingPsychTestPage').then((m) => ({ default: m.OnboardingPsychTestPage })),
)
const OnboardingResumePage = lazy(() =>
  import('@/pages/OnboardingResumePage').then((m) => ({ default: m.OnboardingResumePage })),
)
const OnboardingThinkingPage = lazy(() =>
  import('@/pages/OnboardingThinkingPage').then((m) => ({ default: m.OnboardingThinkingPage })),
)
const OnboardingVoicePage = lazy(() =>
  import('@/pages/OnboardingVoicePage').then((m) => ({ default: m.OnboardingVoicePage })),
)
const PhoneFocusGuidePage = lazy(() =>
  import('@/pages/PhoneFocusGuidePage').then((m) => ({ default: m.PhoneFocusGuidePage })),
)
const ReflectionPage = lazy(() =>
  import('@/pages/ReflectionPage').then((m) => ({ default: m.ReflectionPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })))
const SuggestionsPage = lazy(() =>
  import('@/pages/SuggestionsPage').then((m) => ({ default: m.SuggestionsPage })),
)
const SupportPage = lazy(() =>
  import('@/pages/SupportPage').then((m) => ({ default: m.SupportPage })),
)
const TimerRoute = lazy(() => import('@/pages/TimerRoute').then((m) => ({ default: m.TimerRoute })))

/**
 * 페이지(주소)를 추가하려면 위의 lazy 목록에 한 줄, children 배열에 한 줄 추가하면 됩니다.
 *   const TodoPage = lazy(() => import('@/pages/TodoPage').then((m) => ({ default: m.TodoPage })))
 *   { path: 'todo', element: <TodoPage /> }  ->  http://localhost:5173/todo
 *
 * 로그인 안 한 사람은 RequireAuth 가 /login 으로 보냅니다. 새 페이지는 따로 할 일 없이 자동으로 막힙니다.
 * 로그인 없이 열려야 하는 주소(로그인·회원가입·도움 연결 안내)만 lib/authRedirect.ts 의 PUBLIC_PATHS 에 적어 둡니다.
 */
// errorElement: 그 주소의 화면을 그리다가 에러가 나면 대신 보여줄 화면입니다. (저장된 값이 깨져 있을 때 등)
export const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <ErrorPage />,
    // Layout 안의 모든 주소를 RequireAuth 가 지켜 줍니다.
    // 그날 첫 체크인은 화면을 막지 않고 Layout 맨 위의 한 줄(DailyTagBar)로 묻습니다. (#387)
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      // 아래 탭 5개: 홈 · 카드 · 타이머 · 상담 · 분석 (기획서 3장, #386)
      { path: 'cards', element: <CardsPage /> },
      // 카드 만들기 · 고치기 (#392). /cards/new?date=2026-10-17 · /cards/카드id/edit
      { path: 'cards/new', element: <CardEditPage /> },
      { path: 'cards/:cardId/edit', element: <CardEditPage /> },
      // 목표 만들기 (WOOP, #391). 카드 탭에서 들어옵니다. /goals/new?step=wish
      { path: 'goals/new', element: <GoalNewPage /> },
      // 목표 상세 (진척 · 2주 목표 점검, #403). 카드 탭의 목표 목록에서 들어옵니다.
      { path: 'goals/:goalId', element: <GoalDetailPage /> },
      // 카드 타이머가 기본이고, 옛 계획으로 연 타이머만 옛 화면입니다. (pages/TimerRoute.tsx, #395)
      { path: 'timer', element: <TimerRoute /> },
      { path: 'counsel', element: <CounselPage /> },
      // 분석 탭. 기록 · 리포트 · 사용설명서는 이 화면 안의 하위 탭입니다. (?tab=)
      { path: 'analysis', element: <AnalysisPage /> },
      { path: 'check', element: <CheckPage /> },
      { path: 'diary', element: <DiaryPage /> },
      { path: 'diary/reflection', element: <ReflectionPage /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'phone-focus', element: <PhoneFocusGuidePage /> },
      { path: 'exams/:examId/result', element: <ExamResultPage /> },
      { path: 'call/result', element: <CallResultPage /> },
      { path: 'suggestions', element: <SuggestionsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      // 내 계정(내 정보 고치기 · 비밀번호 바꾸기 · 탈퇴). 설정의 계정 카드에서 들어옵니다. (#296)
      { path: 'settings/account', element: <AccountPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      // 예전 주소(/messages)로 들어오면 새 주소로 넘겨 줍니다. 저장해 둔 주소나 예전 알림을 눌러도 열리게 하려는 것입니다.
      { path: 'messages', element: <Navigate to="/notifications" replace /> },
      // 탭 이름을 바꾸기 전의 옛 주소들. ?date= 같은 값은 그대로 가져갑니다. (#386)
      { path: 'planner', element: <RedirectWithQuery to="/cards" /> },
      { path: 'records', element: <RedirectWithQuery to={ANALYSIS_PATH} /> },
      { path: 'report', element: <RedirectWithQuery to={ANALYSIS_PATH} tab="report" /> },
      { path: 'manual', element: <RedirectWithQuery to={ANALYSIS_PATH} tab="manual" /> },
      // 없는 주소는 404 화면으로. 이 줄은 항상 맨 마지막에 둡니다.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // Layout 밖의 화면은 하나씩 RequireAuth 로 감쌉니다.
  // 화면 파일을 받는 동안의 스켈레톤·실패 안내도 Layout 이 없으니 하나씩 PageBoundary(fullScreen) 로 감쌉니다.
  // 전화 화면은 헤더·하단 탭 없이 화면 전체를 쓰므로 Layout 밖에 둡니다.
  {
    path: '/call',
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <CallPage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  {
    path: '/call/active',
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <CallActivePage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 온보딩과 가입은 메뉴·하단 탭 없이 앱 이름만 있는 틀(PlainLayout)을 쓰므로 Layout 밖에 둡니다.
  // 온보딩 순서(앱 소개 → 학년 → 심리검사 → 자기 인식 4문항 → 관리 설정 → 결과)는 lib/onboardingProgress.ts 의 STAGES 가 정합니다. (#388 · #389)
  {
    path: ONBOARDING_INTRO_PATH,
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingIntroPage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 학년 (OnboardingPage 의 basic 묶음)
  {
    path: '/onboarding',
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <SubjectsGate>
            <OnboardingPage />
          </SubjectsGate>
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 자기 인식 4문항 = 내 가설 (OnboardingPage 의 hypotheses 묶음). 심리검사 다음에 나옵니다.
  {
    path: ONBOARDING_HYPOTHESES_PATH,
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingPage mode="hypotheses" />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 관리 설정 동의 → 결과 (#389). 4문항 다음에 나옵니다.
  {
    path: ONBOARDING_CARE_PATH,
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingCarePage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  {
    path: ONBOARDING_RESULT_PATH,
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingResultPage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 온보딩을 하다 만 사람이 다음에 들어왔을 때 "이어하기 / 처음부터 다시" 를 고르는 화면. RequireAuth 가 보냅니다.
  {
    path: ONBOARDING_RESUME_PATH,
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingResumePage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 설정의 "내 정보 더 알려주기". 같은 설문 화면으로 아직 안 답한 질문만 이어서 묻습니다. (#239)
  {
    path: '/onboarding/more',
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingPage mode="more" />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 생각 습관 테스트. 온보딩에서는 빠졌고(#388), 기록 화면에서 다시 할 때 씁니다. (lib/thinkingTest.ts)
  {
    path: THINKING_TEST_PATH,
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingThinkingPage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 온보딩 심리검사 14문항. 학년 다음, 자기 인식 4문항 앞에 나옵니다. (lib/psychTest.ts)
  {
    path: PSYCH_TEST_PATH,
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingPsychTestPage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 처음 계획 세우기. 온보딩에서는 빠졌고(#388), 설정에서 다시 세울 때 씁니다. (#240)
  {
    path: '/onboarding/plan',
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <SubjectsGate>
            <OnboardingPlanPage />
          </SubjectsGate>
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 처음의 나에게 한마디(목소리·글) 남기기. 온보딩에서는 빠졌고 첫 목표를 만들 때로 옮깁니다(#388 → #391). (#241)
  {
    path: '/onboarding/voice',
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingVoicePage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  {
    path: '/onboarding/done',
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth>
        <PageBoundary fullScreen>
          <OnboardingDonePage />
        </PageBoundary>
      </RequireAuth>
    ),
  },
  // 로그인 화면도 메뉴·하단 탭 없이 앱 이름만 있는 틀(PlainLayout)을 써서 Layout 밖에 둡니다.
  // 로그인 없이 열려야 해서 RequireAuth 로 감싸지 않습니다. (PUBLIC_PATHS 에도 있습니다)
  {
    path: '/login',
    errorElement: <ErrorPage />,
    element: (
      <PageBoundary fullScreen>
        <LoginPage />
      </PageBoundary>
    ),
  },
  // 가입 화면은 로그인 없이 열려야 해서 RequireAuth 로 감싸지 않습니다. (PUBLIC_PATHS 에도 있습니다)
  {
    path: '/signup',
    errorElement: <ErrorPage />,
    element: (
      <PageBoundary fullScreen>
        <SignupPage />
      </PageBoundary>
    ),
  },
  // 도움 연결 안내는 헤더·하단 탭 없이 화면 전체를 쓰고, 힘든 순간에 로그인 때문에 막히면 안 돼서
  // RequireAuth 로 감싸지 않습니다. (PUBLIC_PATHS 에도 있습니다)
  {
    path: '/support',
    errorElement: <ErrorPage />,
    element: (
      <PageBoundary fullScreen>
        <SupportPage />
      </PageBoundary>
    ),
  },
])
