import { cn } from '@/lib/cn'
import { useEffect, type MouseEvent, type ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

/**
 * 화면 위에 뜨는 팝업창입니다.
 * 바깥 어두운 부분을 누르거나, ESC 키를 누르거나, ✕ 버튼을 누르면 onClose 가 불립니다.
 * 모바일에서는 화면 아래쪽에, PC(sm 이상)에서는 가운데에 뜹니다.
 */
export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  // 팝업이 열려 있을 때만 ESC 키를 듣습니다. 닫히면 정리(removeEventListener)합니다.
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // 훅(useEffect)은 항상 이 줄보다 위에 있어야 합니다. (return 뒤에 훅을 두면 에러)
  if (!isOpen) return null

  // 어두운 바깥을 직접 눌렀을 때만 닫습니다. (팝업 안쪽을 누른 건 무시)
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // max-h-full + overflow-y-auto: 내용이 길어도 화면 밖으로 넘치지 않고 안에서 스크롤됩니다.
        className={cn(
          'max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-lg',
          className,
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          {/* min-w-0 + break-words: 긴 제목이 가로로 튀어나가지 않게 합니다. */}
          <h2 className="min-w-0 text-lg font-semibold break-words text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <span aria-hidden className="text-lg leading-none">
              ✕
            </span>
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
