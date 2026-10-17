import {
  createPlan,
  createPlans,
  deletePlan,
  invalidatePlans,
  updatePlan,
  type PlanUpdateInput,
} from '@/lib/plansApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * 공부 계획을 서버에서 추가 · 수정 · 삭제하는 훅입니다. (#202, docs/DATA-FETCHING.md 5장)
 * 성공하면 보관해 둔 계획 목록을 낡았다고 표시해서, 화면이 새 목록을 다시 받아옵니다.
 *
 *   const { create, createMany, update, remove } = usePlanMutations()
 *   create.mutate({ date: '2026-10-05', subjectId: '3', content: '수학', targetMinutes: 60 })
 *   createMany.mutate([ ...계획 입력들 ])                    // 어제 계획 가져오기
 *   update.mutate({ id: '7', input: { done: true } })        // 완료 체크
 *   remove.mutate('7')
 *
 *   create.isPending  -> 보내는 중 (버튼을 잠급니다)
 *   create.isError    -> 실패 (create.error 를 getApiErrorMessage 에 넘기면 서버가 준 이유가 나옵니다)
 *
 * 화면은 아직 이 훅을 쓰지 않습니다. 계획 화면을 서버로 옮길 때 씁니다.
 */
export function usePlanMutations() {
  const queryClient = useQueryClient()

  // 네 요청이 성공했을 때 같은 일을 합니다.
  const onSuccess = () => invalidatePlans(queryClient)

  const create = useMutation({ mutationFn: createPlan, onSuccess })
  const createMany = useMutation({ mutationFn: createPlans, onSuccess })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PlanUpdateInput }) => updatePlan(id, input),
    onSuccess,
  })
  const remove = useMutation({ mutationFn: deletePlan, onSuccess })

  return { create, createMany, update, remove }
}
