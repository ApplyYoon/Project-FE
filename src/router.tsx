import { Layout } from '@/components/layout/Layout'
import { AboutPage } from '@/pages/AboutPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
