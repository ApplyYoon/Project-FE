import { useIsServerData } from '@/hooks/useIsServerData'
import { pushUnsentQuizResults } from '@/lib/quizResultsApi'
import { QUIZ_RESULTS_CHANGED_EVENT } from '@/lib/studyQuiz'
import { useEffect } from 'react'

/** 못 보낸 것이 있는지 다시 확인하는 간격 (1분) */
const CHECK_INTERVAL_MS = 60 * 1000

/**
 * 채팅 확인 문제의 결과를 서버로 보냅니다. (#653, 규칙은 lib/quizResultsApi.ts)
 * 모든 화면에 늘 있는 Layout 에서 한 번만 부릅니다. 테스트 로그인이면 아무것도 하지 않습니다.
 *
 *   - 문제를 다 풀어서 결과가 저장되면(saveQuizResult) 바로 보냅니다.
 *   - 앱을 열 때, 그리고 1분마다 못 보낸 것을 다시 보냅니다. (인터넷이 끊겼다 돌아온 경우)
 */
export function useQuizResultSync(): void {
  const isServerData = useIsServerData()

  useEffect(() => {
    if (!isServerData) return
    function push() {
      void pushUnsentQuizResults()
    }
    push()
    const timerId = setInterval(push, CHECK_INTERVAL_MS)
    window.addEventListener(QUIZ_RESULTS_CHANGED_EVENT, push)
    // 로그아웃하거나 화면을 떠날 때 멈춥니다.
    return () => {
      clearInterval(timerId)
      window.removeEventListener(QUIZ_RESULTS_CHANGED_EVENT, push)
    }
  }, [isServerData])
}
