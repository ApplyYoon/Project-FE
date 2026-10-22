import { cn } from '@/lib/cn'

interface ChipButtonProps {
  selected: boolean
  onClick: () => void
  children: string
  className?: string
}

/**
 * 여러 개 중 하나(또는 여러 개)를 고르는 동그란 버튼입니다. 고르면 테두리가 브랜드 색이 됩니다.
 *
 * <ChipButton selected={reason === '기타'} onClick={() => setReason('기타')}>기타</ChipButton>
 */
export function ChipButton({ selected, onClick, children, className }: ChipButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition active:scale-[0.97]',
        // 고른 것은 연한 brand 바탕 + 굵은 글자. brand 로 꽉 채우는 것은 화면의 1순위 버튼에만 씁니다. (2026-10-22)
        selected
          ? 'border-brand bg-brand-light text-brand font-semibold'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
        className,
      )}
    >
      {children}
    </button>
  )
}
