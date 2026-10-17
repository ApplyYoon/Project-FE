import { mockSubjects } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import type { Subject, SubjectColor } from '@/types'

/**
 * 과목에 쓸 수 있는 색과 그 한국어 이름입니다. 적힌 순서대로 색 고르기 버튼에 보입니다. (무지개 순서 + 회색)
 * Record<SubjectColor, ...> 라서, 타입에 색을 더하고 여기에 안 적으면 타입 검사가 바로 알려 줍니다.
 */
export const SUBJECT_COLOR_LABELS: Record<SubjectColor, string> = {
  red: '빨강',
  orange: '주황',
  yellow: '노랑',
  lime: '연두',
  green: '초록',
  teal: '청록',
  sky: '하늘',
  blue: '파랑',
  indigo: '남색',
  purple: '보라',
  pink: '분홍',
  slate: '회색',
}

/**
 * 쓸 수 있는 색 전체입니다. (위 이름표에 적힌 순서 그대로)
 * 이 밖의 색이 저장돼 있으면 태그 색을 못 찾아서 화면이 깨지기 때문에, 불러올 때 이 목록으로 걸러냅니다.
 */
export const SUBJECT_COLORS = Object.keys(SUBJECT_COLOR_LABELS) as SubjectColor[]

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
