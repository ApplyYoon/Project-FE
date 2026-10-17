import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { Suspense, type ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useLocation } from 'react-router-dom'

interface PageBoundaryProps {
  /**
   * true 면 헤더 없이 화면 전체를 쓰는 화면(전화 · 온보딩 · 가입 등)용으로, 스켈레톤과 안내를 화면 가득 그립니다.
   * false 면 Layout 의 본문 칸 안에 그립니다. (헤더 · 하단 탭은 그대로 보입니다)
   */
  fullScreen?: boolean
  children: ReactNode
}

/**
 * 화면(페이지) 파일을 받아오는 동안과 받지 못했을 때를 맡는 틀입니다. (router.tsx 의 lazy)
 *
 *   받아오는 중 -> 화면 스켈레톤           … Suspense 가 맡습니다
 *   실패        -> 안내 + 새로고침 · 홈으로 … ErrorBoundary(react-error-boundary) 가 맡습니다
 *   성공        -> children
 *
 * 화면 파일을 못 받는 것은 보통 인터넷이 끊겼거나, 새 버전이 배포돼 예전 화면 파일이 사라졌을 때입니다.
 * 한 번 실패한 화면 파일은 브라우저가 다시 받지 않아서 "다시 시도" 대신 새로고침을 권합니다.
 * 화면을 그리다가 난 다른 에러도 여기서 잡히고, 다른 주소로 옮기면 안내가 사라집니다. (resetKeys)
 *
 * ⚠️ 서버 데이터를 받아오는 것은 AsyncBoundary 가 맡습니다. 이 틀은 "화면 코드" 를 받아오는 것만 맡습니다.
 *
 *   <PageBoundary><Outlet /></PageBoundary>                (Layout 안)
 *   <PageBoundary fullScreen><CallPage /></PageBoundary>  (Layout 밖)
 */
export function PageBoundary({ fullScreen = false, children }: PageBoundaryProps) {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary
      resetKeys={[pathname]}
      fallbackRender={() => <PageLoadError fullScreen={fullScreen} />}
    >
      <Suspense fallback={<PageSkeleton fullScreen={fullScreen} />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

interface PageStateProps {
  fullScreen: boolean
}

/** 화면 파일을 받는 동안 보여주는 자리 표시입니다. 제목 한 줄과 카드 몇 장의 대략적인 모양입니다. */
function PageSkeleton({ fullScreen }: PageStateProps) {
  return (
    // role="status": "불러오는 중" 이라는 것을 스크린리더에도 알려 줍니다. (회색 상자는 읽지 않습니다)
    <div
      role="status"
      className={cn(
        'flex w-full flex-col gap-4',
        // 헤더가 없는 화면은 Layout 의 본문 칸과 같은 여백을 직접 줍니다.
        fullScreen && 'mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6 sm:py-10',
      )}
    >
      <span className="sr-only">화면을 불러오는 중이에요</span>
      <Skeleton className="h-8 w-40 sm:w-56" />
      <Skeleton className="h-5 w-full max-w-md" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}

/** 화면 파일을 받지 못했을 때(또는 화면을 그리다 에러가 났을 때) 보여주는 안내입니다. */
function PageLoadError({ fullScreen }: PageStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'mx-auto flex w-full max-w-md flex-col items-center gap-4 py-10 text-center',
        fullScreen && 'min-h-screen justify-center px-4',
      )}
    >
      <h1 className="text-2xl font-bold tracking-tight">화면을 불러오지 못했어요</h1>
      <p className="text-sm break-keep text-slate-600">
        인터넷 연결을 확인하고 새로고침해 주세요. 앱이 새 버전으로 바뀌었을 때도 새로고침하면 돼요.
      </p>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={() => window.location.reload()}>새로고침</Button>
        {/* assign: 주소를 바꾸면서 페이지를 새로 엽니다. (앱의 상태도 처음부터 다시 만들어집니다) */}
        <Button variant="secondary" onClick={() => window.location.assign('/')}>
          홈으로
        </Button>
      </div>
    </div>
  )
}
