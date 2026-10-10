import { Layout } from '@/components/layout/Layout'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { AboutPage } from '@/pages/AboutPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { CallActivePage } from '@/pages/CallActivePage'
import { CallPage } from '@/pages/CallPage'
import { CallResultPage } from '@/pages/CallResultPage'
import { CheckPage } from '@/pages/CheckPage'
import { DiaryPage } from '@/pages/DiaryPage'
import { ExamResultPage } from '@/pages/ExamResultPage'
import { ExamsPage } from '@/pages/ExamsPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ManualPage } from '@/pages/ManualPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OnboardingDonePage } from '@/pages/OnboardingDonePage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { PhoneFocusGuidePage } from '@/pages/PhoneFocusGuidePage'
import { PlannerPage } from '@/pages/PlannerPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { ReflectionPage } from '@/pages/ReflectionPage'
import { ReportPage } from '@/pages/ReportPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SignupPage } from '@/pages/SignupPage'
import { SuggestionsPage } from '@/pages/SuggestionsPage'
import { SupportPage } from '@/pages/SupportPage'
import { TimerPage } from '@/pages/TimerPage'
import { createBrowserRouter } from 'react-router-dom'

/**
 * 페이지(주소)를 추가하려면 children 배열에 한 줄 추가하면 됩니다.
 *   { path: 'todo', element: <TodoPage /> }  ->  http://localhost:5173/todo
 *
 * 로그인 안 한 사람은 RequireAuth 가 /login 으로 보냅니다. 새 페이지는 따로 할 일 없이 자동으로 막힙니다.
 * 로그인 없이 열려야 하는 주소(로그인·회원가입·SNS 콜백)만 lib/authRedirect.ts 의 PUBLIC_PATHS 에 적어 둡니다.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    // Layout 안의 모든 주소를 RequireAuth 가 지켜 줍니다. (login 은 PUBLIC_PATHS 에 있어서 열려 있습니다)
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'planner', element: <PlannerPage /> },
      { path: 'timer', element: <TimerPage /> },
      { path: 'check', element: <CheckPage /> },
      { path: 'diary', element: <DiaryPage /> },
      { path: 'diary/reflection', element: <ReflectionPage /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'phone-focus', element: <PhoneFocusGuidePage /> },
      { path: 'exams/:examId/result', element: <ExamResultPage /> },
      { path: 'call/result', element: <CallResultPage /> },
      { path: 'records', element: <RecordsPage /> },
      { path: 'report', element: <ReportPage /> },
      { path: 'manual', element: <ManualPage /> },
      { path: 'suggestions', element: <SuggestionsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'login', element: <LoginPage /> },
      // SNS 로그인을 마치고 돌아오는 주소. 주소에 ?code=... 가 붙어서 옵니다.
      // 로그인 전에 열려야 해서 lib/authRedirect.ts 의 PUBLIC_PATHS 에 이미 적혀 있습니다. (RequireAuth 가 막지 않습니다)
      { path: 'auth/callback', element: <AuthCallbackPage /> },
      // 없는 주소는 404 화면으로. 이 줄은 항상 맨 마지막에 둡니다.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // Layout 밖의 화면은 하나씩 RequireAuth 로 감쌉니다.
  // 전화 화면은 헤더·하단 탭 없이 화면 전체를 쓰므로 Layout 밖에 둡니다.
  {
    path: '/call',
    element: (
      <RequireAuth>
        <CallPage />
      </RequireAuth>
    ),
  },
  {
    path: '/call/active',
    element: (
      <RequireAuth>
        <CallActivePage />
      </RequireAuth>
    ),
  },
  // 온보딩과 가입은 메뉴·하단 탭 없이 앱 이름만 있는 틀(PlainLayout)을 쓰므로 Layout 밖에 둡니다.
  {
    path: '/onboarding',
    element: (
      <RequireAuth>
        <OnboardingPage />
      </RequireAuth>
    ),
  },
  // 설정의 "내 정보 더 알려주기". 같은 설문 화면으로 아직 안 답한 질문만 이어서 묻습니다. (#239)
  {
    path: '/onboarding/more',
    element: (
      <RequireAuth>
        <OnboardingPage mode="more" />
      </RequireAuth>
    ),
  },
  {
    path: '/onboarding/done',
    element: (
      <RequireAuth>
        <OnboardingDonePage />
      </RequireAuth>
    ),
  },
  // 가입 화면은 로그인 없이 열려야 해서 RequireAuth 로 감싸지 않습니다. (PUBLIC_PATHS 에도 있습니다)
  { path: '/signup', element: <SignupPage /> },
  // 도움 연결 안내는 헤더·하단 탭 없이 화면 전체를 쓰고, 힘든 순간에 로그인 때문에 막히면 안 돼서
  // RequireAuth 로 감싸지 않습니다. (PUBLIC_PATHS 에도 있습니다)
  { path: '/support', element: <SupportPage /> },
])
