import type { SubjectLevel } from '@/types'

/**
 * 온보딩 "현재 수준" 단계(#88)에서 과목별 최근 성적·자신감을 다루는 함수들입니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 온보딩 답은 전부 글자로 저장되기 때문에, 과목별 수준 목록은 JSON 글자 하나로 저장합니다.
 *   저장되는 글자 예) '[{"subjectId":"math","grade":2,"confidence":4}]'
 *   하나도 안 적었으면(건너뛰었으면) 빈 글자 '' 입니다.
 * 불러올 때는 parseSubjectLevels, 저장할 때는 serializeSubjectLevels 를 씁니다.
 */

/** 성적을 등급으로 넣을지(grade), 점수로 넣을지(score) */
export type ScoreKind = 'grade' | 'score'

/** 등급은 1 ~ 9 */
export const GRADE_MIN = 1
export const GRADE_MAX = 9
/** 점수는 0 ~ 100 */
export const SCORE_MIN = 0
export const SCORE_MAX = 100
/** 자신감은 1 ~ 5 */
export const CONFIDENCE_MIN = 1
export const CONFIDENCE_MAX = 5

/** 성적 종류별로 쓸 수 있는 숫자 범위 */
export function getScoreRange(kind: ScoreKind): { min: number; max: number } {
  return kind === 'grade' ? { min: GRADE_MIN, max: GRADE_MAX } : { min: SCORE_MIN, max: SCORE_MAX }
}

/** 값이 min ~ max 사이의 정수인지 확인합니다. (소수·NaN·Infinity 는 아닙니다) */
function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/**
 * 입력칸에 적은 글자를 숫자로 바꿔서, 쓸 수 있는 범위 안이면 돌려줍니다. 아니면 null 입니다.
 *
 *   parseScoreInput('grade', '3')    -> 3
 *   parseScoreInput('grade', '10')   -> null   (등급은 1 ~ 9)
 *   parseScoreInput('score', '0')    -> 0      (점수는 0 도 됩니다)
 *   parseScoreInput('score', '85')   -> 85
 *   parseScoreInput('score', '101')  -> null   (점수는 0 ~ 100)
 *   parseScoreInput('score', '')     -> null   (비어 있음)
 *   parseScoreInput('score', '8.5')  -> null   (정수만)
 */
export function parseScoreInput(kind: ScoreKind, text: string): number | null {
  // Number('') 는 0 이라서, 빈 글자는 숫자로 바꾸기 전에 먼저 걸러냅니다.
  if (text.trim() === '') return null
  const { min, max } = getScoreRange(kind)
  const value = Number(text)
  return isIntegerBetween(value, min, max) ? value : null
}

/**
 * 한 과목의 입력(성적 종류·성적·자신감)을 SubjectLevel 로 만듭니다.
 * 성적이 범위 밖이거나 자신감을 안 골랐으면 아직 다 적은 것이 아니라서 null 입니다.
 *
 *   buildSubjectLevel('math', 'grade', '2', 4)     -> { subjectId: 'math', grade: 2, confidence: 4 }
 *   buildSubjectLevel('math', 'score', '85', 3)    -> { subjectId: 'math', score: 85, confidence: 3 }
 *   buildSubjectLevel('math', 'grade', '2', null)  -> null   (자신감을 안 골랐음)
 *   buildSubjectLevel('math', 'grade', '', 4)      -> null   (성적을 안 적었음)
 *   buildSubjectLevel('math', 'grade', '12', 4)    -> null   (등급은 1 ~ 9)
 */
export function buildSubjectLevel(
  subjectId: string,
  kind: ScoreKind,
  scoreText: string,
  confidence: number | null,
): SubjectLevel | null {
  const value = parseScoreInput(kind, scoreText)
  if (value === null) return null
  if (!isIntegerBetween(confidence, CONFIDENCE_MIN, CONFIDENCE_MAX)) return null

  return kind === 'grade'
    ? { subjectId, grade: value, confidence }
    : { subjectId, score: value, confidence }
}

/** 저장소에서 꺼낸 값이 SubjectLevel 모양(과목 + 등급 또는 점수 중 하나 + 자신감)이 맞는지 확인합니다. */
function isSubjectLevel(value: unknown): value is SubjectLevel {
  if (typeof value !== 'object' || value === null) return false
  const level = value as Record<string, unknown>

  if (typeof level.subjectId !== 'string' || level.subjectId === '') return false
  if (!isIntegerBetween(level.confidence, CONFIDENCE_MIN, CONFIDENCE_MAX)) return false

  // 등급과 점수는 둘 중 정확히 하나만 있어야 합니다.
  const hasGrade = level.grade !== undefined
  const hasScore = level.score !== undefined
  if (hasGrade === hasScore) return false
  return hasGrade
    ? isIntegerBetween(level.grade, GRADE_MIN, GRADE_MAX)
    : isIntegerBetween(level.score, SCORE_MIN, SCORE_MAX)
}

/**
 * 저장된 글자를 과목별 수준 목록으로 바꿉니다.
 * 빈 글자·깨진 글자·배열이 아닌 값이면 빈 목록이고, 모양이 틀린 항목은 그것만 뺍니다.
 * 같은 과목이 두 번 있으면 앞의 것만 씁니다.
 *
 *   parseSubjectLevels('')                                                     -> []
 *   parseSubjectLevels('깨진 글자')                                            -> []
 *   parseSubjectLevels('[{"subjectId":"math","grade":2,"confidence":4}]')      -> [{ subjectId: 'math', grade: 2, confidence: 4 }]
 *   parseSubjectLevels('[{"subjectId":"math","grade":12,"confidence":4}]')     -> []   (등급은 1 ~ 9)
 */
export function parseSubjectLevels(answer: string): SubjectLevel[] {
  if (answer === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(answer)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const seen = new Set<string>()
  const levels: SubjectLevel[] = []
  for (const item of parsed) {
    if (!isSubjectLevel(item) || seen.has(item.subjectId)) continue
    seen.add(item.subjectId)
    levels.push(item)
  }
  return levels
}

/**
 * 과목별 수준 목록을 저장할 글자로 바꿉니다. 목록이 비어 있으면 빈 글자('')입니다.
 * (온보딩에서는 빈 글자가 "건너뜀" 을 뜻합니다)
 *
 *   serializeSubjectLevels([])                                              -> ''
 *   serializeSubjectLevels([{ subjectId: 'math', grade: 2, confidence: 4 }]) -> '[{"subjectId":"math","grade":2,"confidence":4}]'
 */
export function serializeSubjectLevels(levels: SubjectLevel[]): string {
  return levels.length === 0 ? '' : JSON.stringify(levels)
}
