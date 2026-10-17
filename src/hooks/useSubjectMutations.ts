import {
  createSubject,
  deleteSubject,
  invalidateSubjects,
  updateSubject,
  type SubjectUpdateInput,
} from '@/lib/subjectsApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * 과목을 서버에서 추가 · 수정 · 삭제하는 훅입니다. (#201, docs/DATA-FETCHING.md 5장)
 * 성공하면 보관해 둔 과목 목록을 낡았다고 표시해서, 화면이 새 목록을 다시 받아옵니다.
 *
 *   const { create, update, remove } = useSubjectMutations()
 *   create.mutate({ name: '수학', color: 'blue' })
 *   update.mutate({ id: '3', input: { name: '국어' } })
 *   remove.mutate('3')
 *
 *   create.isPending  -> 보내는 중 (버튼을 잠급니다)
 *   create.isError    -> 실패 (create.error 를 getApiErrorMessage 에 넘기면 서버가 준 이유가 나옵니다)
 *
 * 화면은 아직 이 훅을 쓰지 않습니다. 과목 화면을 서버로 옮길 때 씁니다.
 */
export function useSubjectMutations() {
  const queryClient = useQueryClient()

  // 세 요청이 성공했을 때 같은 일을 합니다.
  const onSuccess = () => invalidateSubjects(queryClient)

  const create = useMutation({ mutationFn: createSubject, onSuccess })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SubjectUpdateInput }) =>
      updateSubject(id, input),
    onSuccess,
  })
  const remove = useMutation({ mutationFn: deleteSubject, onSuccess })

  return { create, update, remove }
}
