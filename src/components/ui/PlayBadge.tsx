import { cn } from '@/lib/cn'

interface PlayBadgeProps {
  className?: string
}

/**
 * 노는 계획이라는 것을 알려주는 회색 태그입니다. 과목 태그(SubjectBadge)가 들어갈 자리에 씁니다. (#238)
 * 노는 계획은 과목이 없어서, 과목 색 대신 회색으로 공부 계획과 구분합니다.
 *
 * <PlayBadge />
 */
export function PlayBadge({ className }: PlayBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700',
        // className 을 마지막에 두어야 쓰는 쪽에서 스타일을 덮어쓸 수 있습니다.
        className,
      )}
    >
      놀기
    </span>
  )
}
