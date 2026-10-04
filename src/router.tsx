import { Layout } from '@/components/layout/Layout'
import { AboutPage } from '@/pages/AboutPage'
import { CallPage } from '@/pages/CallPage'
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
      { path: 'call', element: <CallPage /> },
      { path: 'records', element: <RecordsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      // 없는 주소는 404 화면으로. 이 줄은 항상 맨 마지막에 둡니다.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
