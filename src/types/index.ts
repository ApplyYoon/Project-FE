/** 프로젝트 전체에서 쓰는 타입을 모아둡니다. */

// 관리 강도 타입은 #78 이 끝나기 전까지 lib/careLevel.ts 에 있는 것을 가져다 씁니다.
import type { CareLevel } from '@/lib/careLevel'

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

/** 공부 중에 다른 탭·앱으로 나갔다 돌아온 기록 (딴짓 한 번) */
export interface AwayRecord {
  /** 기록을 구분하는 고유 값 */
  id: string
  /** 나간 날짜 (예: '2026-09-28'). 하루 단위로 모아서 셀 때 씁니다. */
  date: string
  /** 공부하던 과목 (Subject 의 id). 알 수 없으면 null */
  subjectId: string | null
  /** 나간 시각 (Date.now() 값) */
  leftAt: number
  /** 돌아온 시각 (Date.now() 값) */
  returnedAt: number
  /** 나가 있던 시간 (밀리초). returnedAt - leftAt 과 같습니다. */
  awayMs: number
}

/** 뽀모도로의 구간 — study: 공부, break: 휴식 */
export type PomodoroPhase = 'study' | 'break'

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

/** 인사이트에 대한 내 반응 (#84 버튼 3개) */
export type InsightResponse =
  | 'surprised' // 몰랐는데 맞아
  | 'alreadyKnew' // 이미 알던 거야
  | 'wrong' // 틀렸어

/** "나를 잘 아는" 인사이트 카드 (#73) */
export interface Insight {
  /** 인사이트를 구분하는 고유 값 */
  id: string
  /** 카드에 보여줄 한 문장 (예: "스스로 밤형이라고 했지만...") */
  sentence: string
  /** 이 결론의 근거가 된 날짜 목록 */
  evidenceDates: string[]
  /** 비교하는 두 조건이 각각 5일 이상 쌓이기 전이면 true ("가설" 배지를 붙입니다) */
  isHypothesis: boolean
  /** 내가 누른 반응 버튼 (#84, 아직 안 눌렀으면 없음) */
  response?: InsightResponse
}

/**
 * AI 가 보낸 메시지의 종류
 * - regular: 정해진 빈도(예: 하루 3번)에 맞춰 보낸 메시지
 * - event: 무슨 일이 생겨서 바로 보낸 메시지 (예: 계획 시간 지남, 목표 달성)
 */
export type AiMessageKind = 'regular' | 'event'

/** 메시지함에 쌓이는 AI 메시지 하나 */
export interface AiMessage {
  /** 메시지를 구분하는 고유 값 */
  id: string
  /** 보낸 시각 (Date.now() 값) */
  sentAt: number
  /** 보낼 때의 관리 강도 (0 회복 ~ 4 강제적 채찍). 말풍선 색이 이 값에 따라 바뀝니다. */
  careLevel: CareLevel
  /** 정기 메시지인지, 이벤트 알림인지 */
  kind: AiMessageKind
  /** 이벤트 알림일 때 말풍선 아래에 붙는 짧은 이름 (예: '계획 시간 지남') */
  eventLabel?: string
  /** 메시지 내용 */
  text: string
  /** 읽었으면 true, 아직 안 읽었으면 false */
  read: boolean
}
