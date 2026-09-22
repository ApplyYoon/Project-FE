import { cn } from '@/lib/cn'
import type { HTMLAttributes, ReactNode } from 'react'

// title 은 HTML 기본 속성(툴팁)과 이름이 겹쳐서 Omit 으로 제외한 뒤 다시 정의합니다.
interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  children: ReactNode
}

export function Card({ title, children, className, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}
      {...props}
    >
      {title && <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>}
      {children}
    </div>
  )
}
