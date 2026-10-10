import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface CrisisHelpModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * 위기 표현이나 오랜 기분 저하가 보일 때 띄우는 도움 연결 안내 팝업입니다. (#95)
 * 글은 이미 저장된 뒤에 보여 주고, 판단하거나 다그치지 않는 말투로 도움받을 곳을 알려 줍니다.
 *
 * ⚠️ 간단한 임시 안내입니다. 전용 안내 화면(#96)이 만들어지면 그걸로 바꾸세요.
 */
export function CrisisHelpModal({ isOpen, onClose }: CrisisHelpModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="혼자 힘들어하지 않아도 돼요">
      <p className="text-sm break-words text-slate-700">
        요즘 많이 힘들어 보여서 마음이 쓰여요. 쓴 글은 잘 저장되어 있어요. 이야기할 사람이 필요하면
        아래로 언제든 연락해 보세요. 무료이고 비밀이 지켜져요.
      </p>

      {/* 모바일에서는 눌러서 바로 전화가 걸립니다. 누르는 곳은 최소 40px(h-11 = 44px) */}
      <div className="mt-4 flex flex-col gap-2">
        <a
          href="tel:1388"
          className="bg-brand hover:bg-brand-dark flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-white"
        >
          청소년 상담전화 1388
        </a>
        <a
          href="tel:109"
          className="bg-brand hover:bg-brand-dark flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-white"
        >
          자살예방 상담전화 109
        </a>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
          닫기
        </Button>
      </div>
    </Modal>
  )
}
