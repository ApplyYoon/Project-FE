import { CrisisHelpModal } from '@/components/ui/CrisisHelpModal'
import { AI_SHOW_HELP_EVENT } from '@/lib/aiCardApi'
import { useEffect, useState } from 'react'

/**
 * AI 도우미(체크리스트 추천 · 준비 행동 · 실패 원인 선지 · 즉석 카드 정리 …)에 보낸 글에
 * 위기 표현이 있다고 서버가 알리면(showHelp), 어느 화면에 있든 도움 연결 안내를 띄웁니다. (#419)
 * 서버는 이때 AI 를 부르지 않고, 화면은 AI 없이 기본값으로 이어 갑니다. (lib/aiCardApi.ts)
 */
export function AiHelpListener() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    function handleShowHelp() {
      setIsOpen(true)
    }
    window.addEventListener(AI_SHOW_HELP_EVENT, handleShowHelp)
    // 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(AI_SHOW_HELP_EVENT, handleShowHelp)
  }, [])

  // 보낸 글은 아직 저장 전일 수 있어서 "저장되어 있어요" 는 빼고 보여 줍니다.
  return <CrisisHelpModal isOpen={isOpen} onClose={() => setIsOpen(false)} showSavedNote={false} />
}
