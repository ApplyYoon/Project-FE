import type { Evaluation, ReflectionPrescription, StudyPlan, StudySession, Subject } from '@/types'

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
}

/** 읽기 쉬운 입력을 받아 StudySession 하나를 만듭니다. */
function makeSession({ id, subjectId, daysAgo, start, minutes }: SessionInput): StudySession {
  const [hour, minute] = start.split(':').map(Number)
  const startedAt = timeDaysAgo(daysAgo, hour, minute)
  return { id, subjectId, startedAt, endedAt: startedAt + minutes * MINUTE }
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
