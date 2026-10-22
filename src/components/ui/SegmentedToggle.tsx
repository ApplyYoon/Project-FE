import { cn } from '@/lib/cn'

interface ToggleOption<T extends string> {
  value: T
  label: string
}

interface SegmentedToggleProps<T extends string> {
  /** 화면 읽기 프로그램에 읽어 줄 이름 (예: '우선순위') */
  label: string
  options: ToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/**
 * 두세 개 중 하나를 고르는 버튼 묶음입니다. (1회성/반복, 유연/절대, 점수형/완주형 등)
 *
 * <SegmentedToggle
 *   label="우선순위"
 *   options={[{ value: 'flexible', label: '유연' }, { value: 'absolute', label: '절대' }]}
 *   value={priority}
 *   onChange={setPriority}
 * />
 */
export function SegmentedToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex w-full rounded-xl bg-slate-100 p-1', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-10 flex-1 cursor-pointer rounded-lg px-3 text-sm font-medium transition-colors',
            value === option.value
              ? 'bg-white text-slate-900 ring-1 ring-slate-200'
              : 'text-slate-500 hover:text-slate-900',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
