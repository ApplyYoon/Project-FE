import { mockSubjects } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import type { Subject, SubjectColor } from '@/types'

// 과목에 쓸 수 있는 색. 이 밖의 색이 저장돼 있으면 태그 색을 못 찾아서 화면이 깨집니다.
const SUBJECT_COLORS: SubjectColor[] = ['red', 'orange', 'green', 'blue', 'purple']

/** 저장소에서 꺼낸 값이 과목 모양({ id, name, color })이 맞는지 확인합니다. */
function isSubject(value: unknown): value is Subject {
  if (typeof value !== 'object' || value === null) return false
  const subject = value as Record<string, unknown>
  return (
    typeof subject.id === 'string' &&
    typeof subject.name === 'string' &&
    SUBJECT_COLORS.includes(subject.color as SubjectColor)
  )
}

/**
 * 저장해 둔 과목 목록을 불러옵니다. 계획 · 타이머 · 기록 · 시험 화면이 모두 이 함수로 읽습니다.
 *
 * - 한 번도 저장한 적이 없으면 예시 과목(국어 · 수학 …)으로 시작합니다.
 * - 저장된 값이 배열이 아니면(깨졌으면) 예시 과목을 돌려줍니다.
 * - 배열 안에 모양이 틀린 것이 섞여 있으면 그것만 빼고 돌려줍니다.
 * - 과목을 전부 지워서 빈 배열이 저장돼 있으면 빈 목록 그대로입니다.
 */
export function loadSubjects(): Subject[] {
  const saved = loadData<unknown>('subjects', mockSubjects)
  if (!Array.isArray(saved)) return mockSubjects
  return saved.filter(isSubject)
}
