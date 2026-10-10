import { BackToRecordsLink } from '@/components/layout/BackToRecordsLink'
import { BottomTabNav } from '@/components/layout/BottomTabNav'
import { Header } from '@/components/layout/Header'
import { RecordsSubNav } from '@/components/layout/RecordsSubNav'
import { useAiMessageNotifications } from '@/hooks/useAiMessageNotifications'
import { isRecordsCardPath, isRecordsTabPath } from '@/lib/recordsMenu'
import { Outlet, useLocation } from 'react-router-dom'

/**
 * 모든 페이지가 공통으로 쓰는 껍데기입니다.
 * <Outlet /> 자리에 현재 주소에 맞는 페이지가 끼워집니다.
 */
export function Layout() {
  // 앱이 열려 있는 동안 안 읽은 AI 메시지를 브라우저 알림으로 띄웁니다. (#62)
  useAiMessageNotifications()
  const { pathname } = useLocation()

  return (
    // pb-14: 모바일에서 하단 탭(높이 h-14)이 마지막 내용을 가리지 않도록 아래 여백을 줍니다.
    <div className="flex min-h-screen flex-col pb-14 sm:pb-0">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {/* 기록 아래 화면에는 맨 위에 하위 탭 막대(기록·리포트·사용설명서)나 "‹ 기록" 돌아가기 링크를 둡니다. (#101) */}
        {isRecordsTabPath(pathname) && <RecordsSubNav />}
        {isRecordsCardPath(pathname) && <BackToRecordsLink />}
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        © 2026 Tmax IT Hope School
      </footer>

      <BottomTabNav />
    </div>
  )
}
