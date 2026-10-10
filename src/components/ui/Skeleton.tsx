import { cn } from '@/lib/cn'

interface SkeletonProps {
  /** 크기와 모양을 정합니다. 예) "h-14 w-full rounded-xl" */
  className?: string
}

/**
 * 내용이 오기 전에 자리를 잡아 두는 회색 상자입니다. (스켈레톤)
 * 진짜 내용과 같은 크기로 그려 두면, 내용이 도착했을 때 화면이 덜컹거리지 않습니다.
 * Suspense 의 fallback 으로 씁니다. (AsyncBoundary 의 pendingFallback)
 *
 * <Skeleton className="h-14 w-full rounded-xl" />
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      // 꾸밈이라 스크린리더는 읽지 않습니다. "불러오는 중" 은 감싸는 쪽에서 글자로 알려 줍니다.
      aria-hidden
      // animate-pulse: 은은하게 깜빡입니다. "움직임 줄이기" 를 켠 사람에게는 멈춰 있게 합니다.
      className={cn('animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none', className)}
    />
  )
}
