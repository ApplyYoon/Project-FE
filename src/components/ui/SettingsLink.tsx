import { cn } from '@/lib/cn'
import { Link } from 'react-router-dom'

interface SettingsLinkProps {
  className?: string
}

/**
 * 설정 화면으로 가는 톱니 아이콘 버튼입니다. 설정은 아래 탭에 없어서 모바일 헤더 오른쪽 위에 둡니다. (#386, 2026-10-19 헤더로 옮김)
 * PC 는 헤더 메뉴의 "설정" 글자로 갑니다. (components/layout/Header.tsx)
 * 누르기 쉽게 44×44px(h-11 w-11) 입니다.
 */
export function SettingsLink({ className }: SettingsLinkProps) {
  return (
    <Link
      to="/settings"
      aria-label="설정"
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200 active:scale-95',
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </Link>
  )
}
