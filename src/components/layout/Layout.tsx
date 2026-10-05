import { BottomTabNav } from '@/components/layout/BottomTabNav'
import { Header } from '@/components/layout/Header'
import { Outlet } from 'react-router-dom'

/**
 * 모든 페이지가 공통으로 쓰는 껍데기입니다.
 * <Outlet /> 자리에 현재 주소에 맞는 페이지가 끼워집니다.
 */
export function Layout() {
  return (
    // pb-14: 모바일에서 하단 탭(높이 h-14)이 마지막 내용을 가리지 않도록 아래 여백을 줍니다.
    <div className="flex min-h-screen flex-col pb-14 sm:pb-0">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        © 2026 Tmax IT Hope School
      </footer>

      <BottomTabNav />
    </div>
  )
}
