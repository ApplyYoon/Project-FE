import { cn } from '@/lib/cn'
import {
  getChatRoom,
  startTalk,
  TALK_ROOM_OF,
  type ChatAbout,
  type TalkTarget,
} from '@/lib/chatRooms'
import { useNavigate } from 'react-router-dom'

interface TalkButtonProps {
  /** 무엇에 대한 대화인지와 사실 줄 (lib/talkLines.ts 로 만듦) */
  about: ChatAbout
  /** 대화방에 내 말풍선으로 먼저 붙일 글. 예) '📅 이번 주 숫자 같이 볼래' */
  label: string
  /** AI 가 짐작한 이유를 저장할 곳 (후기 · 못 한 카드만). 없으면 null */
  target?: TalkTarget | null
  /** 누르기 직전에 할 일 (예: 온보딩 결과를 봤다고 적기). 돌려준 주소가 있으면 대화방 대신 그리로 갑니다. */
  onBeforeTalk?: () => string | null
  className?: string
}

/**
 * 다른 화면에서 알맞은 대화방으로 들어가 그 주제로 이야기하는 버튼입니다. (2026-10-18 "후기 같은 데서 채팅 더 넣자", #582)
 * 어느 방으로 갈지는 주제로 정합니다. (lib/chatRooms.ts 의 TALK_ROOM_OF) 버튼 글자도 그 방 이름으로 만듭니다.
 * 주간 리포트 · AI 분석 · 성향 검사 결과 · 달력의 하루에서 씁니다.
 *
 *   <TalkButton about={{ kind: 'WEEKLY_REPORT', lines }} label="📅 이번 주 숫자 같이 볼래" />
 *   -> [📅 계획 방에서 이야기하기]
 */
export function TalkButton({
  about,
  label,
  target = null,
  onBeforeTalk,
  className,
}: TalkButtonProps) {
  const navigate = useNavigate()
  const room = getChatRoom(TALK_ROOM_OF[about.kind])

  function handleClick() {
    const elsewhere = onBeforeTalk?.() ?? null
    const path = startTalk({ about, label, target })
    navigate(elsewhere ?? path)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        // 화면의 1순위 행동이 아니라서 채우지 않은 버튼(흰 바탕 + 회색 선)으로 둡니다. (2026-10-22)
        'flex h-10 cursor-pointer items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition-transform hover:bg-slate-50 active:scale-[0.98]',
        className,
      )}
    >
      <span aria-hidden>{room.emoji}</span> {room.name} 방에서 이야기하기
    </button>
  )
}
