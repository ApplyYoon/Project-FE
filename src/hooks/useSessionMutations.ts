import { createSession, invalidateSessions } from '@/lib/sessionsApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * 공부 기록을 서버에 저장하는 훅입니다. (#203, docs/DATA-FETCHING.md 5장)
 * 성공하면 보관해 둔 기록 값(기간별 목록 · 오늘 합계 · 계획별 실제 시간)을 낡았다고 표시해서, 화면이 새로 받아옵니다.
 *
 *   const { create } = useSessionMutations()
 *   create.mutate({ subjectId: '3', startedAt, endedAt, pauseCount: 2, pausedMs: 300000, planId: '7', targetMinutes: 50 })
 *
 *   create.isPending  -> 보내는 중
 *   create.isError    -> 실패 (create.error 를 getApiErrorMessage 에 넘기면 서버가 준 이유가 나옵니다)
 *   create.variables  -> 마지막으로 보낸 기록. 실패했을 때 화면이 들고 있다가 다시 보내는 데 씁니다
 *
 * ⚠️ 저장에 실패해도 방금 공부한 기록이 사라지면 안 됩니다. 타이머 화면은 저장에 성공할 때까지 방금 잰 기록을 들고 있다가,
 * 실패하면 create.mutate(같은 기록) 으로 다시 보내게 해야 합니다. (이 훅은 실패한 기록을 대신 보관하지는 않습니다)
 *
 * 화면은 아직 이 훅을 쓰지 않습니다. 타이머 화면을 서버로 옮길 때 씁니다.
 */
export function useSessionMutations() {
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: createSession,
    onSuccess: () => invalidateSessions(queryClient),
  })

  return { create }
}
