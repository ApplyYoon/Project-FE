import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ReasonChips } from '@/components/ui/ReasonChips'
import { CARD_FAIL_CAUSES, type CardFailCause } from '@/lib/cardMarks'
import { getChatRoom, TALK_ROOM_OF } from '@/lib/chatRooms'
import { toggleReason } from '@/lib/reasons'

interface FailCardModalProps {
  isOpen: boolean
  cardTitle: string
  onClose: () => void
  /** 고른 원인 모두. 맨 앞(처음 고른 것)이 대표 원인입니다 */
  onFail: (causes: CardFailCause[]) => void
  /**
   * [💬 코치랑 이야기하며 정하기] — 원인을 고르지 않고 대화방에서 말로 나눕니다. (#582)
   * AI 가 짐작한 원인을 학생이 확인하면 그때 실패로 기록합니다. 안 주면 버튼이 없습니다.
   */
  onTalk?: () => void
}

/**
 * 실패로 기록하는 창 — 원인을 하나 이상 골라야 합니다. 여러 개 골라도 됩니다. (최종 기획서 「4.4 타이머」 미실행, #400 · 2026-10-18)
 * 실패는 혼내려는 기록이 아니라, 무엇 때문에 못 하는지 패턴을 보려는 기록입니다. 카드 탭(#394)에서도 씁니다.
 */
export function FailCardModal({ isOpen, cardTitle, onClose, onFail, onTalk }: FailCardModalProps) {
  const [causes, setCauses] = useState<CardFailCause[]>([])

  // 창을 닫으면 고른 것을 비워서, 다음에 열 때 처음부터 고르게 합니다.
  function handleClose() {
    setCauses([])
    onClose()
  }

  function handleFail() {
    onFail(causes)
    setCauses([])
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`'${cardTitle}' 못 했어요`}>
      <p className="text-sm text-slate-700">무엇 때문이었나요? 여러 개 골라도 돼요.</p>
      <ReasonChips
        options={CARD_FAIL_CAUSES}
        selected={causes}
        onToggle={(key) => setCauses((prev) => toggleReason(prev, key))}
        label="못 한 원인"
        className="mt-3"
      />
      <Button className="mt-4 w-full" disabled={causes.length === 0} onClick={handleFail}>
        실패로 기록
      </Button>
      {onTalk && (
        <Button variant="secondary" className="mt-2 w-full" onClick={onTalk}>
          💬 {getChatRoom(TALK_ROOM_OF.CARD_FAIL).name} 방에서 이야기하며 정하기
        </Button>
      )}
    </Modal>
  )
}
