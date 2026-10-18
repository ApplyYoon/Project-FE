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
      // 연회색 바탕 위의 흰 묶음. 테두리 · 그림자 없이 둥근 모서리(rounded-3xl)로 구분합니다. (2026-10-18 모바일 UI)
      className={cn('rounded-3xl bg-white p-5 sm:p-6', className)}
      {...props}
    >
      {title && (
        <h3 className="mb-3 text-[17px] font-bold tracking-tight text-slate-900">{title}</h3>
      )}
      {children}
    </div>
  )
}
