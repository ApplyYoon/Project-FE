import { Header } from '@/components/layout/Header'
import type { ReactNode } from 'react'

interface PlainLayoutProps {
  /** 헤더 오른쪽에 보여줄 것. 예) "나중에 하기" 링크 */
  headerAction?: ReactNode
  children: ReactNode
}

/**
 * 메뉴·하단 탭 없이 뜨는 화면(온보딩 등)의 틀입니다.
 * 위에는 앱 이름만 있고, 오른쪽 자리(headerAction)에 필요한 것을 하나 둘 수 있습니다.
 *
 * Layout 은 router.tsx 가 <Outlet /> 으로 끼워 주지만, 이 틀은 페이지가 직접 감싸서 씁니다.
 *   <PlainLayout headerAction={...}>화면 내용</PlainLayout>
 * 이 틀을 쓰는 페이지는 router.tsx 에서 Layout 밖에 둡니다.
 */
export function PlainLayout({ headerAction, children }: PlainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header hideNav action={headerAction} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      {/* 시안대로 모바일에서는 푸터를 숨깁니다. */}
      <footer className="hidden border-t border-slate-200 py-6 text-center text-sm text-slate-500 sm:block">
        © 2026 Tmax IT Hope School
      </footer>
    </div>
  )
}
