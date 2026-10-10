import { Layout } from '@/components/layout/Layout'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { AboutPage } from '@/pages/AboutPage'
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
 * 페이지(주소)를 추가하려면 한 줄 추가하면 됩니다.
 *   { path: 'todo', element: <TodoPage /> }  ->  http://localhost:5173/todo
 *
 * 어디에 넣을지는 "로그인 안 한 사람도 봐야 하나?" 로 정합니다.
 *   로그인해야 볼 수 있다 (대부분)      -> <RequireAuth> 안쪽 children
 *   로그인 없이 볼 수 있다 (로그인 관련) -> RequireAuth 바깥
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      // ---- 로그인 없이 볼 수 있는 곳 ----
      // 여기를 막으면 로그인하러 가는 길도 막힙니다.
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      // SNS 로그인 뒤 돌아오는 콜백 주소(/auth/callback)를 만들면 이 자리에 넣어 주세요.

      // ---- 로그인해야 볼 수 있는 곳 ----
      // 로그인 안 한 사람이 들어오면 RequireAuth 가 /login 으로 보냅니다.
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'about', element: <AboutPage /> },
          { path: 'planner', element: <PlannerPage /> },
          { path: 'timer', element: <TimerPage /> },
          { path: 'check', element: <CheckPage /> },
          { path: 'call/result', element: <CallResultPage /> },
          { path: 'records', element: <RecordsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },

      // 없는 주소는 404 화면으로. 이 줄은 항상 맨 마지막에 둡니다.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // 아래 화면들도 로그인해야 볼 수 있어서 RequireAuth 로 감쌉니다.
  {
    element: <RequireAuth />,
    children: [
      // 전화 화면은 헤더·하단 탭 없이 화면 전체를 쓰므로 Layout 밖에 둡니다.
      { path: '/call', element: <CallPage /> },
      { path: '/call/active', element: <CallActivePage /> },
      // 온보딩은 메뉴·하단 탭 없이 앱 이름만 있는 틀(PlainLayout)을 쓰므로 Layout 밖에 둡니다.
      { path: '/onboarding', element: <OnboardingPage /> },
    ],
  },
])
