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
  /** 이 세션에서 일시정지를 누른 횟수 */
  pauseCount: number
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

/** 어제 계획을 못 채운 이유 (#26 에서 버튼으로 고릅니다) */
export type MissReason =
  | 'tired' // 피곤·수면
  | 'event' // 약속·행사
  | 'phone' // 폰·SNS
  | 'tooMuch' // 계획 과다
  | 'unwilling' // 하기 싫음
  | 'sick' // 아픔
  | 'etc' // 기타

/** 매일 체크인 (하루에 하나) */
export interface CheckIn {
  /** 체크인한 날짜 (예: '2026-09-28') */
  date: string
  /** 오늘 컨디션 (1 ~ 5) */
  condition: number
  /** 오늘 기분 (1 ~ 5) */
  mood: number
  /** 어제 계획을 다 못 채운 날에만 고르는 미달 원인 (#26) */
  missReason?: MissReason
  /** 오늘 예상 순공시간(분) */
  expectedMinutes: number
  /** 오늘의 약속 "만약 ~하면" (#79) */
  promiseIf?: string
  /** 오늘의 약속 "~한다" (#79) */
  promiseThen?: string
}

/** 관리 강도 — 0 회복, 1 당근, 2 넛지, 3 심리적 채찍, 4 강제적 채찍 */
export type CareLevel = 0 | 1 | 2 | 3 | 4

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

/** 시험 종류 */
export type ExamType = 'mock' | 'school' | 'quiz' | 'etc' // 모의고사 / 내신 / 쪽지시험 / 기타

/** 시험 한 과목의 점수 */
export interface ExamSubjectScore {
  /** 어떤 과목인지 (Subject 의 id) */
  subjectId: string
  /** 시험 전에 입력하는 예상 점수 */
  expectedScore: number
  /** 시험이 끝난 뒤 입력하는 실제 점수 (시험 전에는 없음) */
  actualScore?: number
}

/** 시험 후 회고 3문항 (#81) */
export interface ExamReflection {
  /** ① 준비가 충분했나 (1 ~ 5) */
  preparedness: number
  /** ② 가장 아쉬운 점 (한 줄) */
  regret: string
  /** ③ 다음에 바꿀 한 가지 (한 줄) */
  nextChange: string
}

/** 시험 (모의고사·내신·쪽지시험 등) */
export interface Exam {
  /** 시험을 구분하는 고유 값 */
  id: string
  /** 시험 종류 */
  type: ExamType
  /** 시험 이름 (예: '10월 모의고사') */
  name: string
  /** 시험 날짜 */
  date: string
  /** 과목별 예상·실제 점수 */
  subjectScores: ExamSubjectScore[]
  /** 시험 후 회고 (#81, 시험 날짜가 지나야 입력합니다) */
  reflection?: ExamReflection
}

/** 과거에 공부 계획이 무너졌던 때 (#89, 여러 개 고를 수 있습니다) */
export type PastFailureCause =
  | 'afterExam' // 시험 끝난 직후
  | 'weekend' // 주말
  | 'lateAcademy' // 학원 늦게 끝난 날
  | 'phone' // 폰 보다가
  | 'tooMuchPlan' // 계획이 많아서

/** 아침형 / 밤형 (#89 자기 인식) */
export type Chronotype = 'morning' | 'night'

/** 온보딩에서 받은 과목별 현재 수준 (#88) */
export interface SubjectLevel {
  /** 어떤 과목인지 (Subject 의 id) */
  subjectId: string
  /** 최근 등급 (1 ~ 9). 점수로 입력했으면 없습니다 */
  grade?: number
  /** 최근 점수. 등급으로 입력했으면 없습니다 */
  score?: number
  /** 이 과목에 대한 자신감 (1 ~ 5) */
  confidence: number
}

/** 온보딩 설문 답 (#58, #88, #89) */
export interface OnboardingAnswers {
  /** 학년 */
  grade: '고1' | '고2' | '고3' | 'N수' | '대학생'
  /** 목표로 하는 시험 이름 (예: '수능') */
  targetExam: string
  /** 목표 시험 날짜 (D-day 계산용) */
  targetExamDate: string
  /** 목표 대학 (선택) */
  targetUniversity?: string
  /** 목표 점수 (선택) */
  targetScore?: string
  /** 평소 기상 시각 ('HH:MM') */
  wakeUpTime: string
  /** 평소 취침 시각 ('HH:MM') */
  sleepTime: string
  /** 학교 끝나는 시각 ('HH:MM') */
  schoolEndTime: string
  /** 학원 끝나는 시각 ('HH:MM') */
  academyEndTime: string
  /** 주로 공부하는 장소 */
  studyPlace: string
  /** 과목별 최근 성적·자신감 (#88, 건너뛰면 빈 배열) */
  subjectLevels: SubjectLevel[]
  /** 과거에 계획이 무너졌던 때 (여러 개) */
  pastFailureCauses: PastFailureCause[]
  /** 아침형 / 밤형 */
  chronotype: Chronotype
  /** 한 번에 집중 가능한 시간(분) */
  maxFocusMinutes: number
  /** 가장 큰 방해 요소 */
  biggestDistraction: string
  /** 하루 공부 가능 시간(분) */
  dailyAvailableMinutes: number
  /** 공부하는 이유 (한 줄, 최대 50자) */
  motivationReason: string
  /** 목표를 이루면 하고 싶은 것 (한 줄, 최대 50자) */
  goalReward: string
}

/** 나 사용설명서 항목의 분류 (#87) */
export type ManualItemCategory =
  | 'rhythm' // 리듬
  | 'cautionDay' // 주의할 날
  | 'effectiveMethod' // 효과 있는 방법
  | 'careStyle' // 잘 맞는 관리 방식

/** 나 사용설명서에 쌓이는 검증된 사실 한 줄 (#87) */
export interface ManualItem {
  /** 항목을 구분하는 고유 값 */
  id: string
  /** 4가지 분류 중 하나 */
  category: ManualItemCategory
  /** 한 줄 제목 (예: '오전 집중형') */
  title: string
  /** 이 사실이 확인된 날짜 */
  confirmedDate: string
  /** 근거 (예: '폰을 다른 방에 두면 효과 있음 (2주 실험: 순공 +35분)') */
  evidence: string
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

/**
 * 주간 회고 하나 (#82). 한 주(월~일)에 하나만 저장됩니다.
 * 건너뛴 주도 skipped: true 로 저장해서, 같은 주에 다시 묻지 않습니다.
 */
export interface WeeklyReview {
  /** 그 주의 월요일 날짜 (예: '2026-10-05'). 어느 주의 회고인지 구분합니다. */
  weekStart: string
  /** ① 이번 주 가장 잘한 것 (최대 100자) */
  best: string
  /** ② 가장 아쉬운 것 (최대 100자) */
  regret: string
  /** ③ 다음 주에 바꿀 한 가지 (최대 100자) */
  change: string
  /** 건너뛰었으면 true. 이때 세 답은 빈 글자입니다. */
  skipped: boolean
  /** 저장한 시각 (Date.now() 값) */
  savedAt: number
}
