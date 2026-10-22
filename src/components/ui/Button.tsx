import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/*
 * 종류별 스타일을 객체로 모아두면, 새 종류를 추가할 때 한 줄만 쓰면 됩니다.
 * 한 화면에 primary(채운 버튼)는 하나만 둡니다. 나머지는 secondary · outline · ghost 로 낮춥니다. (2026-10-22)
 *   outline: 흰 바탕 + 회색 선. 흰 묶음 밖(회색 바탕)이나 primary 옆의 "다른 길" 에 씁니다.
 *   inverse: brand 색 바탕 위에 놓는 흰 버튼입니다. (홈 · 타이머의 "지금 할 카드")
 */
const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
  outline: 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  inverse: 'bg-white text-brand-dark hover:bg-brand-light',
}

// 누르는 곳은 가장 작아도 40px(h-10). 큰 행동(다음 · 저장)은 h-14 로 화면 폭을 채워 씁니다. (2026-10-18 모바일 UI)
// 모서리: 작은 버튼일수록 덜 둥글게 해서, 큰 행동(lg)만 둥근 덩어리로 보이게 합니다. (2026-10-22)
const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-10 rounded-xl px-4 text-sm',
  md: 'h-12 rounded-xl px-5 text-[15px]',
  lg: 'h-14 rounded-2xl px-6 text-[17px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        // active:scale: 누르는 동안 살짝 작아져서 "눌렸다" 는 느낌을 줍니다.
        'inline-flex cursor-pointer items-center justify-center gap-2 font-semibold transition active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        variantStyles[variant],
        sizeStyles[size],
        // className 을 마지막에 두어야 사용하는 쪽에서 스타일을 덮어쓸 수 있습니다.
        className,
      )}
      {...props}
    />
  )
}
