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
        'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors',
        selected
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-slate-200 text-slate-600 hover:border-slate-300',
        className,
      )}
    >
      {children}
    </button>
  )
}
