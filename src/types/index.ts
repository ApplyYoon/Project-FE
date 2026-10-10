/** 프로젝트 전체에서 쓰는 타입을 모아둡니다. */

/*
 * 날짜·시각 표기 규칙 (모든 타입 공통)
 * - 날짜: 'YYYY-MM-DD' 형식의 문자열        예) '2026-09-28'
 * - 시각: Date.now() 로 얻은 밀리초 숫자     예) 1790000000000
 */

export interface Post {
  id: number
  userId: number
  title: string
  body: string
}

/** 로그인한 사람 정보 */
export interface AuthUser {
  /** 사람을 구분하는 고유 값 (서버가 정해 줍니다) */
  id: string
  /** 화면에 보이는 이름 */
  name: string
}

/** 과목 태그에 쓸 수 있는 색 */
export type SubjectColor = 'red' | 'orange' | 'green' | 'blue' | 'purple'

/** 과목 (예: 수학, 영어) */
export interface Subject {
  /** 과목을 구분하는 고유 값 */
  id: string
  /** 화면에 보이는 과목 이름 (예: '수학') */
  name: string
  /** 과목 태그에 칠할 색 */
  color: SubjectColor
}

/** 하루 공부 계획 한 줄 */
export interface StudyPlan {
  /** 계획을 구분하는 고유 값 */
  id: string
  /** 계획한 날짜 (예: '2026-09-28') */
  date: string
  /** 어떤 과목의 계획인지 (Subject 의 id) */
  subjectId: string
  /** 할 일 내용 (예: '수학 문제집 3단원 풀기') */
  content: string
  /** 목표 공부 시간 (분 단위) */
  targetMinutes: number
  /** 다 했으면 true, 아직이면 false */
  done: boolean
}

/** 타이머로 한 번 공부한 기록 (시작 ~ 정지) */
export interface StudySession {
  /** 기록을 구분하는 고유 값 */
  id: string
  /** 어떤 과목을 공부했는지 (Subject 의 id) */
  subjectId: string
  /** 공부를 시작한 시각 (Date.now() 값) */
  startedAt: number
  /** 공부를 끝낸 시각 (Date.now() 값) */
  endedAt: number
}

/** 뽀모도로의 구간 — study: 공부, break: 휴식 */
export type PomodoroPhase = 'study' | 'break'

/** 어제 계획을 못 채운 이유 */
export type MissReason = 'tired' | 'event' | 'phone' | 'tooMuch' | 'unwilling' | 'sick' | 'etc'

/** 개선안의 강도 — easy: 쉬움, normal: 보통, hard: 강함 */
export type SuggestionLevel = 'easy' | 'normal' | 'hard'

/** 개선안의 진행 상태 */
export type SuggestionStatus = 'suggested' | 'active' | 'done' | 'dropped'

/** AI 가 실패 원인에 맞춰 고른 개선안 한 장. "만약 ~하면 → ~한다" 문장입니다. */
export interface Suggestion {
  /** 개선안을 구분하는 고유 값 */
  id: string
  /** 어떤 실패 원인에 맞춘 것인지 */
  cause: MissReason
  /** 강도 — 쉬움·보통·강함 */
  level: SuggestionLevel
  /** "만약 ~하면" 에 들어갈 문장 */
  ifText: string
  /** "~한다" 에 들어갈 문장 */
  thenText: string
  /** 왜 추천하는지 한 줄 */
  reason: string
  /** 지금 상태 */
  status: SuggestionStatus
  /** 도전을 시작한 날짜 ('YYYY-MM-DD'). 아직 안 골랐으면 없음 */
  startDate?: string
  /** 실험 기간 (7~14일). 아직 안 골랐으면 없음 */
  days?: number
}

/** AI 의 태도 — kind: 친절, normal: 보통, cynical: 냉소 */
export type AiMood = 'kind' | 'normal' | 'cynical'

/** 하루가 끝난 뒤 AI 가 내린 평가 (날짜마다 하나) */
export interface Evaluation {
  /** 평가한 날짜 (예: '2026-09-28') */
  date: string
  /** 하루 점수 (0 ~ 100) */
  score: number
  /** 점수에 따라 정해진 AI 태도 */
  mood: AiMood
  /** AI 가 남긴 한마디 요약 */
  summary: string
}
