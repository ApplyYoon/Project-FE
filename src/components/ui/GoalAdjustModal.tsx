import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatMinutes } from '@/lib/dailyRecords'
import type { GoalAdjustProposal } from '@/lib/goalAdjust'

interface GoalAdjustModalProps {
  /** 제안 내용. null 이면 팝업이 닫혀 있습니다. */
  proposal: GoalAdjustProposal | null
  /** 수락 버튼을 눌렀을 때 */
  onAccept: () => void
  /** 거절 버튼·✕·바깥·ESC 로 닫았을 때 (며칠 동안 다시 묻지 않습니다) */
  onDecline: () => void
}

/**
 * "목표를 바꿔 볼까요?" 하고 묻는 팝업입니다. (#67)
 * 올리자는 제안과 낮추자는 제안에서 문구만 다르고 모양은 같습니다.
 */
export function GoalAdjustModal({ proposal, onAccept, onDecline }: GoalAdjustModalProps) {
  if (proposal === null) return null

  const isRaise = proposal.kind === 'raise'
  const from = formatMinutes(proposal.fromMinutes)
  const to = formatMinutes(proposal.toMinutes)

  return (
    <Modal
      isOpen
      onClose={onDecline}
      title={isRaise ? '목표를 조금 올려 볼까요?' : '목표를 조금 낮춰 볼까요?'}
    >
      <p className="text-sm break-words text-slate-700">
        {isRaise
          ? '요즘 잘 지키고 있고 효과도 보여요. 오늘 목표를 살짝 올려 볼게요.'
          : '요즘 목표가 조금 버거워 보여요. 최근 실제로 한 시간에 맞춰서 목표를 낮춰 볼게요.'}
      </p>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-center text-base font-semibold break-words text-slate-900">
        {from} → {to}
      </p>

      {/* 모바일은 세로로 쌓고, PC(sm 이상)는 가로로 나란히 놓습니다. */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDecline} className="w-full sm:w-auto">
          괜찮아요
        </Button>
        <Button onClick={onAccept} className="w-full sm:w-auto">
          바꿀게요
        </Button>
      </div>
    </Modal>
  )
}
