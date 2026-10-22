import { useAiMessages } from '@/hooks/useAiMessages'
import { countUnreadAiMessages } from '@/lib/aiMessages'
import { Link } from 'react-router-dom'

/* 종 모양 아이콘 (라이브러리 없이 SVG 를 직접 그립니다) */
function BellIcon() {
  return (
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

/**
 * 알림 화면(/notifications)으로 가는 종 버튼. 안 읽은 알림이 있으면 빨간 점이 뜹니다. (예전에는 모든 화면 헤더에 있었음)
 * 누르기 쉽게 44×44px(h-11 w-11) 입니다. 채팅 목록 · 대화방 머리 두 곳에서 써서 여기로 뺐습니다. (2026-10-18, #582)
 *
 *   <NotificationsBell />
 */
export function NotificationsBell() {
  // 새 알림이 쌓이면 화면을 옮기지 않아도 바로 다시 그려져서 빨간 점이 뜹니다. (hooks/useAiMessages.ts)
  const unreadCount = countUnreadAiMessages(useAiMessages())
  // 화면을 읽어 주는 프로그램이 "알림, 안 읽은 알림 3개" 처럼 개수까지 읽어 줍니다.
  const label = unreadCount > 0 ? `알림, 안 읽은 알림 ${unreadCount}개` : '알림'
  return (
    <Link
      to="/notifications"
      aria-label={label}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95"
    >
      <BellIcon />
      {unreadCount > 0 && (
        <span
          aria-hidden
          className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
        />
      )}
    </Link>
  )
}
