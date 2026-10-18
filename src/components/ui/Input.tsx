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
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">
          {label}
        </label>
      )}

      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          // 테두리 없이 연회색 칸. 글자는 16px(text-base) — 아이폰은 이보다 작은 칸을 누르면 화면을 확대합니다.
          'h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-base',
          'placeholder:text-slate-400',
          'focus:ring-brand/40 focus:bg-white focus:ring-2 focus:outline-none',
          error && 'bg-red-50 ring-2 ring-red-300 focus:ring-red-300',
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
