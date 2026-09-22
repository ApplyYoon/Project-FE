import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 클래스 이름을 안전하게 합쳐주는 함수입니다.
 *
 * 1) clsx  : 조건부 클래스를 처리해 줍니다.  cn('p-2', isActive && 'bg-brand')
 * 2) twMerge: 충돌하는 Tailwind 클래스 중 "뒤에 온 것"만 남깁니다.
 *             cn('p-2', 'p-4') -> 'p-4'   (그냥 문자열로 붙이면 둘 다 남아서 버그가 납니다)
 *
 * 컴포넌트에서 className 을 props 로 받을 때는 항상 cn 을 쓰세요.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
