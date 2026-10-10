import { Layout } from '@/components/layout/Layout'
import { AboutPage } from '@/pages/AboutPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { CallActivePage } from '@/pages/CallActivePage'
import { CallPage } from '@/pages/CallPage'
import { CallResultPage } from '@/pages/CallResultPage'
import { CheckPage } from '@/pages/CheckPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { PlannerPage } from '@/pages/PlannerPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SignupPage } from '@/pages/SignupPage'
import { TimerPage } from '@/pages/TimerPage'
import { createBrowserRouter } from 'react-router-dom'

/**
 * 페이지(주소)를 추가하려면 children 배열에 한 줄 추가하면 됩니다.
 *   { path: 'todo', element: <TodoPage /> }  ->  http://localhost:5173/todo
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'planner', element: <PlannerPage /> },
      { path: 'timer', element: <TimerPage /> },
      { path: 'check', element: <CheckPage /> },
      { path: 'call/result', element: <CallResultPage /> },
      { path: 'records', element: <RecordsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'login', element: <LoginPage /> },
      // SNS 로그인을 마치고 돌아오는 주소. 주소에 ?code=... 가 붙어서 옵니다.
      { path: 'auth/callback', element: <AuthCallbackPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      // 없는 주소는 404 화면으로. 이 줄은 항상 맨 마지막에 둡니다.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // 전화 화면은 헤더·하단 탭 없이 화면 전체를 쓰므로 Layout 밖에 둡니다.
  { path: '/call', element: <CallPage /> },
  { path: '/call/active', element: <CallActivePage /> },
])
