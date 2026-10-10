import { cn } from '@/lib/cn'
import { useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  // label 과 input 을 연결하려면 id 가 필요합니다. 없으면 자동으로 만들어 줍니다.
  const inputId = id ?? props.name
  // 오류 문구에 붙일 이름표. 입력칸의 aria-describedby 에 적어 주면 스크린리더가 입력칸과 함께 읽어 줍니다.
  // useId: 화면 안에서 겹치지 않는 id 를 React 가 만들어 줍니다. (id·name 이 없는 입력칸도 있어서 따로 만듭니다)
  const errorId = useId()

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}

      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'h-10 w-full rounded-lg border border-slate-300 px-3 text-sm',
          'placeholder:text-slate-400',
          'focus:border-brand focus:ring-brand/30 focus:ring-2 focus:outline-none',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-200',
          className,
        )}
        {...props}
      />

      {error && (
        <p id={errorId} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
