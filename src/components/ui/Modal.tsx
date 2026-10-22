import { cn } from '@/lib/cn'
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'

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
 * 모바일에서는 화면 아래에서 올라오는 시트(위 모서리만 둥근 판)로, PC(sm 이상)에서는 가운데에 뜹니다. (2026-10-18 모바일 UI)
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

  // 팝업 상자. 열릴 때 키보드 포커스를 여기로 옮기는 데 씁니다.
  const dialogRef = useRef<HTMLDivElement>(null)

  // 팝업이 열리면 포커스를 팝업으로 옮기고, 뒤 화면이 스크롤되지 않게 막습니다. 닫히면 원래대로 돌립니다.
  // (포커스가 뒤 화면에 남아 있으면 키보드·스크린리더 사용자가 팝업이 뜬 줄 모릅니다)
  // [isOpen] 만 지켜봅니다. onClose 까지 넣으면 부모가 다시 그려질 때마다 포커스를 다시 빼앗습니다.
  useEffect(() => {
    if (!isOpen) return

    // 팝업을 열기 전에 포커스가 있던 곳(보통 팝업을 연 버튼)을 기억해 둡니다.
    const previousFocus = document.activeElement
    dialogRef.current?.focus()
    document.body.classList.add('overflow-hidden')

    return () => {
      document.body.classList.remove('overflow-hidden')
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [isOpen])

  // 훅(useEffect)은 항상 이 줄보다 위에 있어야 합니다. (return 뒤에 훅을 두면 에러)
  if (!isOpen) return null

  // 어두운 바깥을 직접 눌렀을 때만 닫습니다. (팝업 안쪽을 누른 건 무시)
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
    >
      <div
        ref={dialogRef}
        // tabIndex -1: 탭 키로는 안 오지만 코드로 포커스를 줄 수 있게 합니다.
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // max-h-full + overflow-y-auto: 내용이 길어도 화면 밖으로 넘치지 않고 안에서 스크롤됩니다.
        // outline-none: 상자 전체에 포커스 테두리가 그려지지 않게 합니다. (안의 버튼들은 그대로 테두리가 보입니다)
        className={cn(
          // pb: 아이폰 아래 홈 막대에 버튼이 가리지 않게 안전 영역만큼 더 띄웁니다.
          'max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none sm:rounded-3xl sm:pb-6',
          className,
        )}
      >
        {/* 모바일 시트 맨 위의 작은 손잡이 (꾸밈) */}
        <div
          aria-hidden
          className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden"
        />
        <div className="mb-3 flex items-center justify-between gap-2">
          {/* min-w-0 + break-words: 긴 제목이 가로로 튀어나가지 않게 합니다. */}
          <h2 className="min-w-0 text-[20px] font-bold tracking-tight break-words text-slate-900">
            {title}
          </h2>
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
