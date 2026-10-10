import type {
  AiMessage,
  Evaluation,
  Insight,
  ManualItem,
  ReflectionPrescription,
  StudyPlan,
  StudySession,
  Subject,
  Suggestion,
} from '@/types'

/**
 * 백엔드가 생기기 전까지 화면에 보여줄 가짜 데이터입니다.
 *
 * 날짜는 "오늘"을 기준으로 계산합니다. 그래서 언제 열어도
 * 오늘 계획과 최근 7일 기록이 화면에 나옵니다.
 * 서버가 생기면 이 파일 대신 api() 로 받아오면 됩니다.
 */

/* ---------- 날짜 도우미 (이 파일 안에서만 씁니다) ---------- */

const MINUTE = 60 * 1000 // 1분 = 60,000 밀리초

/**
 * n일 전 날짜를 'YYYY-MM-DD' 문자열로 돌려줍니다. (0 = 오늘)
 * toISOString() 은 영국 시간 기준이라 한국 새벽에는 날짜가 하루 밀려서, 직접 만듭니다.
 */
function dateDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** n일 전 hour시 minute분을 Date.now() 와 같은 숫자(밀리초)로 돌려줍니다. */
function timeDaysAgo(daysAgo: number, hour: number, minute: number): number {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  return date.getTime()
}

interface SessionInput {
  id: string
  subjectId: string
  daysAgo: number // 며칠 전인지 (1 = 어제)
  start: string // 시작 시각 'HH:MM'
  minutes: number // 공부한 시간(분)
  pauseCount?: number // 일시정지한 횟수 (안 적으면 0)
}

/** 읽기 쉬운 입력을 받아 StudySession 하나를 만듭니다. */
function makeSession({
  id,
  subjectId,
  daysAgo,
  start,
  minutes,
  pauseCount = 0,
}: SessionInput): StudySession {
  const [hour, minute] = start.split(':').map(Number)
  const startedAt = timeDaysAgo(daysAgo, hour, minute)
  return { id, subjectId, startedAt, endedAt: startedAt + minutes * MINUTE, pauseCount }
}

/* ---------- 가짜 데이터 ---------- */

/** 과목 5개 */
export const mockSubjects: Subject[] = [
  { id: 'korean', name: '국어', color: 'red' },
  { id: 'math', name: '수학', color: 'blue' },
  { id: 'english', name: '영어', color: 'purple' },
  { id: 'science', name: '과학', color: 'green' },
  { id: 'social', name: '사회', color: 'orange' },
]

const today = dateDaysAgo(0)

/** 오늘 계획 5개 (2개 완료, 3개 남음) */
export const mockPlans: StudyPlan[] = [
  {
    id: 'plan-1',
    date: today,
    subjectId: 'math',
    content: '수학 문제집 3단원 풀기',
    targetMinutes: 60,
    done: true,
  },
  {
    id: 'plan-2',
    date: today,
    subjectId: 'english',
    content: '영단어 50개 외우기',
    targetMinutes: 30,
    done: true,
  },
  {
    id: 'plan-3',
    date: today,
    subjectId: 'korean',
    content: '비문학 지문 3개 읽기',
    targetMinutes: 40,
    done: false,
  },
  {
    id: 'plan-4',
    date: today,
    subjectId: 'science',
    content: '화학 개념 정리 노트 쓰기',
    targetMinutes: 50,
    done: false,
  },
  {
    id: 'plan-5',
    date: today,
    subjectId: 'social',
    content: '한국사 인강 1강 듣기',
    targetMinutes: 45,
    done: false,
  },
]

/**
 * 최근 7일(어제 ~ 7일 전) 공부 기록
 * 오늘 기록은 넣지 않았습니다. 시각을 정해 두면 아침에 열었을 때
 * "아직 오지 않은 시각"의 기록이 생기기 때문입니다. 오늘 기록은 타이머로 만들어 보세요.
 */
export const mockSessions: StudySession[] = [
  makeSession({ id: 'session-1', subjectId: 'math', daysAgo: 1, start: '19:00', minutes: 50 }),
  makeSession({ id: 'session-2', subjectId: 'english', daysAgo: 1, start: '20:00', minutes: 30 }),
  makeSession({ id: 'session-3', subjectId: 'korean', daysAgo: 2, start: '21:00', minutes: 40 }),
  makeSession({ id: 'session-4', subjectId: 'science', daysAgo: 3, start: '19:00', minutes: 60 }),
  makeSession({ id: 'session-5', subjectId: 'math', daysAgo: 3, start: '20:20', minutes: 25 }),
  makeSession({ id: 'session-6', subjectId: 'social', daysAgo: 4, start: '21:00', minutes: 45 }),
  makeSession({ id: 'session-7', subjectId: 'english', daysAgo: 5, start: '17:00', minutes: 20 }),
  makeSession({ id: 'session-8', subjectId: 'math', daysAgo: 6, start: '19:30', minutes: 90 }),
  makeSession({ id: 'session-9', subjectId: 'korean', daysAgo: 7, start: '20:00', minutes: 35 }),
]

/**
 * 지난 3일의 AI 평가 3개
 * 태도는 #28 의 예시 기준을 따릅니다. (70점 이상 kind, 40~69 normal, 40 미만 cynical)
 */
export const mockEvaluations: Evaluation[] = [
  {
    date: dateDaysAgo(1),
    score: 85,
    mood: 'kind',
    summary: '계획을 거의 다 지켰어요! 이대로만 하면 됩니다.',
  },
  {
    date: dateDaysAgo(2),
    score: 30,
    mood: 'cynical',
    summary: '40분 공부하고 하루를 끝냈네요. 계획표는 장식인가요?',
  },
  {
    date: dateDaysAgo(3),
    score: 55,
    mood: 'normal',
    summary: '절반은 해냈어요. 내일은 수학 시간을 조금 늘려 봐요.',
  },
]

/**
 * 성찰 일기 처방 예시 (#70)
 * AI 가 패턴을 보고 내려주는 처방이라, 서버가 생기기 전까지 예시로 둡니다.
 * startDate 를 2일 전으로 둬서, 오늘 열면 "3일째 / 5일"이 됩니다.
 */
export const mockReflectionPrescription: ReflectionPrescription = {
  id: 'reflection-1',
  startDate: dateDaysAgo(2),
  days: 5,
  reason: "최근 '하기 싫음'이 3번 나와서, 5일 동안 짧게 돌아보기로 했어.",
  questions: ['오늘 계획을 못 지킨 진짜 이유는?', '내일 하나만 바꾼다면?', '오늘 잘한 한 가지는?'],
}

/**
 * 폰·SNS 때문에 계획을 못 채운 사람에게 맞춘 개선안 3개 (쉬움·보통·강함)
 * 원인별 분기(#91)가 생기기 전까지는 이 세트 하나만 보여줍니다.
 */
export const mockSuggestions: Suggestion[] = [
  {
    id: 'suggestion-1',
    cause: 'phone',
    level: 'easy',
    ifText: '공부를 시작하면',
    thenText: '알림을 모두 끈다',
    reason: '버튼 하나라 부담이 제일 적어.',
    status: 'suggested',
  },
  {
    id: 'suggestion-2',
    cause: 'phone',
    level: 'normal',
    ifText: '학원에서 돌아오면',
    thenText: '폰을 가방에 넣고 시작한다',
    reason: '학원 다음이 제일 약한 시간이었어.',
    status: 'suggested',
  },
  {
    id: 'suggestion-3',
    cause: 'phone',
    level: 'hard',
    ifText: '계획된 공부 시간이 되면',
    thenText: '집중 모드를 켠다',
    reason: '나가려면 10초 기다리고 이유를 적어야 해.',
    status: 'suggested',
  },
]

/**
 * 인사이트 2개 (#73)
 * 계산은 서버(AI)가 하고 FE 는 결과만 보여주므로, 서버가 생기기 전까지 예시로 둡니다.
 */
export const mockInsights: Insight[] = [
  {
    id: 'insight-1',
    sentence: '스스로 밤형이라고 했지만, 오전 세션은 일시정지가 밤의 절반이야.',
    // 비교하는 두 조건(오전/밤) 중 하나가 아직 5일 미만이라 "가설" 배지가 붙습니다.
    evidenceDates: [dateDaysAgo(1), dateDaysAgo(2), dateDaysAgo(3), dateDaysAgo(4)],
    isHypothesis: true,
  },
  {
    id: 'insight-2',
    sentence: '공부 시간을 매일 평균 1시간 20분 높게 예상해. 계획을 예상의 75%로 잡아보자.',
    evidenceDates: [
      dateDaysAgo(1),
      dateDaysAgo(2),
      dateDaysAgo(3),
      dateDaysAgo(4),
      dateDaysAgo(5),
      dateDaysAgo(6),
    ],
    isHypothesis: false,
  },
]

/** 지금으로부터 n분 전 시각을 Date.now() 와 같은 숫자(밀리초)로 돌려줍니다. */
function minutesAgo(minutes: number): number {
  return Date.now() - minutes * MINUTE
}

/**
 * 메시지함에 보여줄 AI 메시지 7개 (어제 4개 + 최근 3개)
 * 최근 메시지는 "n분 전" 으로 만들었습니다. 오늘 시각을 정해 두면
 * 아침에 열었을 때 아직 오지 않은 시각의 메시지가 생기기 때문입니다.
 * 마지막 3개는 안 읽은 메시지입니다.
 */
export const mockAiMessages: AiMessage[] = [
  {
    id: 'message-1',
    sentAt: timeDaysAgo(1, 7, 30),
    careLevel: 2,
    kind: 'regular',
    text: '좋은 아침! 오늘 계획은 4시간이야. 첫 과목은 수학 어때?',
    read: true,
  },
  {
    id: 'message-2',
    sentAt: timeDaysAgo(1, 19, 10),
    careLevel: 2,
    kind: 'event',
    eventLabel: '계획 시간 지남',
    text: '계획 시간 10분 지났어. 타이머부터 켜 볼까?',
    read: true,
  },
  {
    id: 'message-3',
    sentAt: timeDaysAgo(1, 21, 35),
    careLevel: 1,
    kind: 'event',
    eventLabel: '목표 달성',
    text: '오늘 목표 달성! 첫 시작이 그저께보다 25분 빨랐어.',
    read: true,
  },
  {
    id: 'message-4',
    sentAt: minutesAgo(180),
    careLevel: 2,
    kind: 'regular',
    text: '어제 순공 3시간 10분, 계획의 80%야. 폰은 다른 방에 두기 5일째!',
    read: true,
  },
  {
    id: 'message-5',
    sentAt: minutesAgo(90),
    careLevel: 1,
    kind: 'regular',
    text: '점심 먹고 20분만 영어 단어 어때? 어제 약속 지킨 거 멋있었어.',
    read: false,
  },
  {
    id: 'message-6',
    sentAt: minutesAgo(30),
    careLevel: 3,
    kind: 'event',
    eventLabel: '계획 시간 지남',
    text: '벌써 40분 지났는데 아직 시작 안 했네. 오늘도 폰이야?',
    read: false,
  },
  {
    id: 'message-7',
    sentAt: minutesAgo(5),
    careLevel: 2,
    kind: 'regular',
    text: '지금 25분만 해 보자. 끝나면 칭찬해 줄게.',
    read: false,
  },
]

/**
 * 나 사용설명서(#87)에 보여줄 검증된 사실 5개.
 * 4가지 분류가 다 나오고, "효과 있는 방법" 은 2개라서 한 분류에 여러 개가 묶이는 모습도 볼 수 있습니다.
 * 나중에는 실험 결과(#93)에서 효과가 확인된 것만 여기에 올라옵니다.
 */
export const mockManualItems: ManualItem[] = [
  {
    id: 'manual-1',
    category: 'rhythm',
    title: '오전 집중형',
    confirmedDate: '2026-10-02',
    evidence: '오전 세션은 일시정지가 밤의 절반이야. 기록 18일 (온보딩 때는 "밤형" 이라고 했어)',
  },
  {
    id: 'manual-2',
    category: 'cautionDay',
    title: '학원 늦게 끝난 다음 날',
    confirmedDate: '2026-10-04',
    evidence: '그다음 날 미달이 세 배 많아. 비교한 날 각각 6일',
  },
  {
    id: 'manual-3',
    category: 'effectiveMethod',
    title: '책상에 앉으면 → 타이머 켜고 쉬운 문제 1개',
    confirmedDate: '2026-10-04',
    evidence: '2주 실험: 첫 시작 40분 빨라짐, 하루 순공 35분 늘어남 (이행률 79%)',
  },
  {
    id: 'manual-4',
    category: 'effectiveMethod',
    title: '폰을 다른 방에 두기',
    confirmedDate: '2026-09-20',
    evidence: '2주 실험: 순공 +35분',
  },
  {
    id: 'manual-5',
    category: 'careStyle',
    title: '독촉에 잘 반응',
    confirmedDate: '2026-09-28',
    evidence: '칭찬받은 주보다 독촉받은 주에 공부 시작이 25분 빨랐어. 당근 2주와 독촉 2주 비교',
  },
]
