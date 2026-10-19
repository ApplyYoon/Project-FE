import { NotificationsBell } from '@/components/ui/NotificationsBell'
import { useAuth } from '@/hooks/useAuth'
import { useCards } from '@/hooks/useCards'
import { CALL_LOCKED_TEXT, localCheckCall } from '@/lib/checkCall'
import { CALL_ENTRY, CHAT_ROOMS, chatRoomPath, loadLastSeen } from '@/lib/chatRooms'
import { lastTalkBubble, loadCoachThread, type ThreadBubble } from '@/lib/coachThread'
import { cn } from '@/lib/cn'
import { loadAllSessions } from '@/lib/dailyRecords'
import { getTodayKey, toDayKey } from '@/lib/date'
import { useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * 채팅 탭("/chat") — 대화방 목록입니다. (2026-10-18 저녁, #582)
 * 사용자 결정: "맨 위 📞 매일 통화 카드 + 채팅방 3개 📅 계획 · 💬 상담 · 📚 과목 쌤", "채팅 탭은 하나 있어야 됨 무조건"
 *
 * - 맨 위 📞 매일 통화: 오늘 공부를 하나 끝내면 열리는 확인 통화(#584). 누르면 통화 화면(/call)이 문을 다시 확인합니다.
 *   여기서는 이 기기의 기록으로만 열렸는지 미리 보여 줍니다. (서버에 묻지 않아서 열기만 해서는 아무 요청도 안 감)
 * - 방마다 마지막 말 한 줄과, 마지막으로 열어 본 뒤에 AI 가 한 말이 있으면 파란 점을 보여 줍니다.
 * - 방 이름 · 아이콘 · 설명은 lib/chatRooms.ts 의 CHAT_ROOMS 한 곳에서 읽습니다.
 */
export function ChatListPage() {
  const { user } = useAuth()
  const { cards } = useCards()
  // 화면을 열 때 한 번만 읽습니다. (대화방 기록 · 마지막으로 본 시각 · 공부 기록)
  const [threads] = useState(() =>
    CHAT_ROOMS.map((room) => lastTalkBubble(loadCoachThread(user?.id ?? 'unknown', room.id))),
  )
  const [lastSeen] = useState(loadLastSeen)
  const [sessions] = useState(loadAllSessions)
  const [todayKey] = useState(getTodayKey)
  const call = localCheckCall(sessions, cards, todayKey)

  return (
    // 홈과 같이 모바일은 연회색 바탕 위에 흰 묶음을 올립니다. (-mx-4 -mt-3 -mb-6 으로 Layout 의 여백까지 덮음)
    <div className="-mx-4 -mt-3 -mb-6 flex flex-col gap-4 bg-slate-100 px-4 pt-3 pb-6 sm:mx-0 sm:my-0 sm:rounded-3xl sm:p-6">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-snug font-bold tracking-tight text-slate-900">채팅</h1>
          <p className="truncate text-[15px] text-slate-500">
            AI 랑 계획 · 상담 · 공부 질문을 나눠서 해요
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 알림은 탭 없이 채팅 머리에 둡니다. (2026-10-18 "탭을 명확히") 설정은 2026-10-19 에 헤더로 옮겼습니다. */}
          <NotificationsBell />
        </div>
      </div>

      {CALL_ENTRY && (
        <Link
          to={CALL_ENTRY.path}
          className="flex min-h-16 items-center gap-3 rounded-3xl bg-white px-4 py-3 transition-transform active:scale-[0.99]"
        >
          <span
            aria-hidden
            className="bg-brand-light flex size-12 shrink-0 items-center justify-center rounded-full text-2xl"
          >
            {CALL_ENTRY.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[17px] font-bold text-slate-900">{CALL_ENTRY.name}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  call.open ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                )}
              >
                {call.open ? '열림' : '잠김'}
              </span>
            </span>
            <span className="block text-sm break-keep text-slate-500">
              {call.open && call.studied
                ? `방금 한 ${call.studied.title ? `'${call.studied.title}'` : '공부'}(${call.studied.minutes}분)를 코치한테 3분 설명해 봐`
                : CALL_LOCKED_TEXT}
            </span>
          </span>
          <span aria-hidden className="text-slate-400">
            ›
          </span>
        </Link>
      )}

      <ul className="flex flex-col overflow-hidden rounded-3xl bg-white">
        {CHAT_ROOMS.map((room, index) => {
          const last = threads[index]
          const seenAt = lastSeen[room.id] ?? 0
          // 마지막 말이 AI 의 말이고, 마지막으로 열어 본 뒤에 생겼으면 "새 말" 점을 보여 줍니다.
          const hasNew = last !== null && last.speaker === 'ai' && last.at > seenAt
          return (
            <li key={room.id} className="border-b border-slate-100 last:border-b-0">
              <Link
                to={chatRoomPath(room.id)}
                className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <span
                  aria-hidden
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl"
                >
                  {room.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[17px] font-bold text-slate-900">
                      {room.name}
                    </span>
                    {last && (
                      <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                        {timeLabel(last, todayKey)}
                      </span>
                    )}
                  </span>
                  {/* 아직 대화가 없으면 방의 역할 한 줄을, 있으면 마지막 말 한 줄을 보여 줍니다. */}
                  <span className="block truncate text-sm text-slate-500">
                    {last ? previewText(last) : room.role}
                  </span>
                </span>
                {hasNew && (
                  <span className="bg-brand size-2.5 shrink-0 rounded-full">
                    <span className="sr-only">새 말</span>
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="px-1 text-xs break-keep text-slate-400">
        대화는 이 기기에만 남아요. 설정의 "모든 기록 지우기" 로 지울 수 있어요.
      </p>
    </div>
  )
}

/** 목록에 보일 마지막 말 한 줄. 사진을 보냈으면 앞에 📎 */
function previewText(bubble: ThreadBubble): string {
  const text = bubble.text.replace(/\s+/g, ' ')
  return bubble.hasPhoto ? `📎 ${text}` : text
}

/** 마지막 말의 때: 오늘이면 '오후 7:40' 처럼 시각, 아니면 '10/17' 처럼 날짜 */
function timeLabel(bubble: ThreadBubble, todayKey: string): string {
  const date = new Date(bubble.at)
  if (toDayKey(bubble.at) === todayKey) {
    return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}
