import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CARD_FAIL_CAUSES, type CardFailCause } from '@/lib/cardMarks'

interface FailCardModalProps {
  isOpen: boolean
  cardTitle: string
  onClose: () => void
  onFail: (cause: CardFailCause) => void
}

/**
 * 실패로 기록하는 창 — 원인 태그 1탭이 필수입니다. (최종 기획서 「4.4 타이머」 미실행, #400)
 * 실패는 혼내려는 기록이 아니라, 무엇 때문에 못 하는지 패턴을 보려는 기록입니다. 카드 탭(#394)에서도 씁니다.
 */
export function FailCardModal({ isOpen, cardTitle, onClose, onFail }: FailCardModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`'${cardTitle}' 못 했어요`}>
      <p className="text-sm text-slate-700">무엇 때문이었나요? 하나만 골라요.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {CARD_FAIL_CAUSES.map((item) => (
          <Button
            key={item.key}
            variant="secondary"
            className="h-12"
            onClick={() => onFail(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </Modal>
  )
}
