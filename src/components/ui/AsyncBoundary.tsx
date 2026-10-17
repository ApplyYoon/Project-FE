import { Button } from '@/components/ui/Button'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { Suspense, type ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

interface AsyncBoundaryProps {
  /** 받아오는 동안 보여줄 것. 보통 Skeleton 으로 만든 자리 표시입니다. */
  pendingFallback: ReactNode
  /** 받아오지 못했을 때 보여줄 안내 문구 */
  errorMessage?: string
  /**
   * 받아오지 못했을 때 안내 아래에 같이 보여줄 것. (없어도 됩니다)
   * 예) 구글 일정을 못 받아와도 내 계획 플래너는 보여야 할 때, 구글 일정 없이 그린 플래너를 넣습니다.
   */
  errorExtra?: ReactNode
  /**
   * 이 값이 바뀌면 "실패" 상태를 지우고 처음부터 다시 그립니다.
   * 예) 검색어를 넣어 두면, 실패한 뒤 다른 검색어로 찾을 때 실패 안내가 남지 않습니다.
   */
  resetKeys?: unknown[]
  children: ReactNode
}

/**
 * 서버에서 받아오는 컴포넌트(useSuspenseQuery 를 쓰는 컴포넌트)를 감싸는 틀입니다.
 * 안쪽 컴포넌트가 할 일을 줄여 줍니다. 안쪽은 "데이터가 있을 때" 만 그리면 됩니다.
 *
 *   받아오는 중   -> pendingFallback (스켈레톤)        … Suspense 가 맡습니다
 *   실패          -> 안내 문구 + "다시 시도" 버튼       … ErrorBoundary 가 맡습니다
 *   성공          -> children
 *
 * <AsyncBoundary pendingFallback={<Skeleton className="h-14 w-full" />}>
 *   <SchoolResults query="디지털" />
 * </AsyncBoundary>
 *
 * ⚠️ useSuspenseQuery 를 부르는 컴포넌트를 이 틀 "안" 에 두어야 합니다. 같은 컴포넌트 안에서 부르면 잡지 못합니다.
 */
export function AsyncBoundary({
  pendingFallback,
  errorMessage = '불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  errorExtra,
  resetKeys,
  children,
}: AsyncBoundaryProps) {
  return (
    // QueryErrorResetBoundary: "다시 시도" 를 눌렀을 때 TanStack Query 도 실패 기록을 지우고 다시 받아오게 합니다.
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          resetKeys={resetKeys}
          fallbackRender={({ resetErrorBoundary }) => (
            <>
              {/* role="alert": 안내가 뜨면 스크린리더가 바로 읽어 줍니다. */}
              <div
                role="alert"
                className="flex flex-col items-start gap-2 rounded-xl bg-red-50 p-4"
              >
                <p className="text-sm break-keep text-red-700">{errorMessage}</p>
                <Button variant="secondary" className="bg-white" onClick={resetErrorBoundary}>
                  다시 시도
                </Button>
              </div>
              {errorExtra}
            </>
          )}
        >
          <Suspense fallback={pendingFallback}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
