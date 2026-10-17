import { AI_MESSAGES_CHANGE_EVENT, loadAiMessages } from '@/lib/aiMessages'
import type { AiMessage } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 저장된 알림 목록을 돌려줍니다. 알림이 더해지거나 읽음으로 바뀌면 화면이 바로 다시 그려집니다.
 * 헤더의 빨간 점과 알림 화면이 같이 씁니다.
 *
 *   const messages = useAiMessages()
 *
 * 목록을 state 에 담아 두지 않고, 그릴 때마다 저장소에서 새로 읽습니다.
 * "모든 기록 지우기" 처럼 신호 없이 저장소가 바뀌는 경우에도, 화면을 옮기면 맞는 값이 보이게 하려는 것입니다.
 */
export function useAiMessages(): AiMessage[] {
  // 신호가 올 때마다 1 씩 올려서 화면을 다시 그리게 하는 숫자입니다. 숫자 자체는 쓰지 않습니다.
  const [, setChangeCount] = useState(0)

  useEffect(() => {
    function handleChange() {
      setChangeCount((count) => count + 1)
    }
    window.addEventListener(AI_MESSAGES_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(AI_MESSAGES_CHANGE_EVENT, handleChange)
  }, [])

  return loadAiMessages()
}
