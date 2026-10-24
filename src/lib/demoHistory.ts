import { moveDateKey, toDayKey } from '@/lib/date'
import { DEMO_ID_PREFIX, createRandom, hashSeed, type DemoPersona } from '@/lib/demoPersona'
import { getWeekStart } from '@/lib/historyReport'
import type { QuizQuestion, QuizResult } from '@/lib/studyQuiz'
import type { WeeklyPick } from '@/lib/weeklyPicks'
import type { CheckIn, ManualItem, StudySession } from '@/types'

/**
 * 기록 탭(History 리포트)을 시연할 때 필요한 가상 데이터를 더 만듭니다. (2026-10-24 History 리포트 시안)
 * 가상 사용자 28일(lib/demoPersona.ts) 위에 얹는 것이라, 28일 줄거리는 바꾸지 않습니다.
 * 넣고 빼는 것은 lib/demoData.ts 가 합니다. 만드는 것의 id 는 모두 'demo-' 로 시작합니다.
 *
 *   1. 쉬어 간 주: 28일이 시작한 주의 바로 전 주(월 ~ 일)에 목요일 40분 · 토요일 20분만 공부한 주
 *      + 그 주 전날(일요일) 기록 하나 (그래야 "시작한 주" 가 아니라 "쉬어 간 주" 로 보입니다)
 *      + 28일이 시작한 주의 앞부분(28일 전)이 비지 않게 하루 한 번씩 공부한 기록
 *   2. 확인 문제 결과: 수학 · 영어 · 국어 카드를 한 날의 2/3 쯤에 3문제씩. 뒤로 갈수록 조금씩 더 맞힙니다.
 *   3. 이번 주에 고른 것: 지난주와 이번 주 모두 '폰을 다른 방에 두기' (지난주 리포트에서 [1주 더 해 보기] 한 것)
 *   4. 사용설명서: 28일 줄거리의 항목에 출처 한 줄(note)을 붙이고, 시안처럼 두 항목을 더합니다.
 */

const MINUTE = 60 * 1000

/** 그 날짜 · 시각의 Date.now() 값 */
function atTime(dateKey: string, time: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes).getTime()
}

/** 과목별 확인 문제 예시 (채팅에서 AI 가 낸 것처럼 보이는 4지선다). 다음 날 코치가 틀린 문제를 다시 내도 어색하지 않게 진짜 문제로 둡니다. */
const QUESTION_BANK: Record<string, QuizQuestion[]> = {
  math: [
    {
      question: 'lim(n→∞) 1/n 의 값은?',
      choices: ['0', '1', '∞', '없다'],
      answerIndex: 0,
      explanation: 'n 이 한없이 커지면 1/n 은 0 에 가까워집니다.',
    },
    {
      question: '등차수열 3, 7, 11, … 의 10번째 항은?',
      choices: ['39', '40', '43', '37'],
      answerIndex: 0,
      explanation: '첫째항 3, 공차 4 이므로 3 + 9×4 = 39 입니다.',
    },
    {
      question: '등비수열 2, 6, 18, … 의 공비는?',
      choices: ['2', '3', '4', '6'],
      answerIndex: 1,
      explanation: '6 ÷ 2 = 3 이므로 공비는 3 입니다.',
    },
    {
      question: 'Σ(k=1~5) k 의 값은?',
      choices: ['10', '15', '20', '25'],
      answerIndex: 1,
      explanation: '1 + 2 + 3 + 4 + 5 = 15 입니다.',
    },
  ],
  english: [
    {
      question: "'reluctant' 의 뜻으로 알맞은 것은?",
      choices: ['꺼리는', '열정적인', '정확한', '느슨한'],
      answerIndex: 0,
      explanation: 'reluctant 는 "마지못해 하는, 꺼리는" 입니다.',
    },
    {
      question: "'abundant' 와 뜻이 가장 가까운 것은?",
      choices: ['scarce', 'plentiful', 'empty', 'narrow'],
      answerIndex: 1,
      explanation: 'abundant 와 plentiful 은 둘 다 "풍부한" 입니다.',
    },
    {
      question: "'I wish I ___ more time.' 빈칸에 알맞은 것은?",
      choices: ['have', 'had', 'will have', 'having'],
      answerIndex: 1,
      explanation: 'I wish 뒤 현재 사실의 반대는 과거형(had)을 씁니다.',
    },
    {
      question: "'consequence' 의 뜻은?",
      choices: ['결과', '원인', '조건', '순서'],
      answerIndex: 0,
      explanation: 'consequence 는 "결과, 영향" 입니다.',
    },
  ],
  korean: [
    {
      question: '"높푸른 하늘" 에서 "높푸른" 의 짜임은?',
      choices: ['합성어', '파생어', '단일어', '구'],
      answerIndex: 0,
      explanation: '"높다" 와 "푸르다" 가 합쳐진 합성어입니다.',
    },
    {
      question: '시에서 대상에 사람의 성질을 주는 표현법은?',
      choices: ['직유법', '의인법', '반어법', '과장법'],
      answerIndex: 1,
      explanation: '사람이 아닌 것을 사람처럼 나타내는 것은 의인법입니다.',
    },
    {
      question: '"신라의 달밤" 에서 "의" 의 품사는?',
      choices: ['조사', '어미', '부사', '관형사'],
      answerIndex: 0,
      explanation: '체언 뒤에 붙어 관계를 나타내는 관형격 조사입니다.',
    },
  ],
}

const SUBJECT_TOPICS: Record<string, string> = {
  math: '수학 수열 확인 문제',
  english: '영어 단어 · 문법 확인 문제',
  korean: '국어 문법 · 문학 확인 문제',
}

/** 시연용으로 더 넣는 것들 */
export interface DemoHistory {
  /** 28일 전의 공부 기록 (쉬어 간 주 등) */
  sessions: StudySession[]
  /** 28일 전 날짜의 체크인 */
  checkins: Record<string, CheckIn>
  quizResults: QuizResult[]
  picks: WeeklyPick[]
  /** 28일 줄거리의 사용설명서 항목(출처를 붙인 것) + 시안처럼 더한 항목 */
  manualItems: ManualItem[]
}

/** 카드 없이 잰 공부 기록 하나 (28일 전 날들) */
function plainSession(
  dateKey: string,
  time: string,
  minutes: number,
  subjectId: string,
): StudySession {
  const startedAt = atTime(dateKey, time)
  return {
    id: `${DEMO_ID_PREFIX}history-session-${dateKey}`,
    subjectId,
    startedAt,
    endedAt: startedAt + minutes * MINUTE,
    pauseCount: 0,
    pausedMs: 0,
    targetMinutes: minutes,
    kind: 'study',
  }
}

function plainCheckIn(dateKey: string, condition: number): CheckIn {
  return {
    date: dateKey,
    condition,
    mood: condition,
    emotions: condition <= 2 ? ['TIRED'] : ['CALM'],
  }
}

/** 날짜마다 맞힐 확률. 처음 0.62 에서 28일째 0.85 쯤까지 오릅니다. ("정답률이 지난주보다 올랐어요") */
function correctRateOn(dayIndex: number): number {
  return 0.62 + (0.23 * dayIndex) / 27
}

export function buildDemoHistory(persona: DemoPersona, todayKey: string, now: number): DemoHistory {
  const { startKey } = persona

  // ── 1. 28일 전: 쉬어 간 주와 그 앞뒤 ──
  const sessions: StudySession[] = []
  const checkins: Record<string, CheckIn> = {}
  const startWeek = getWeekStart(startKey)
  const restWeek = moveDateKey(startWeek, -7)
  // 쉬어 간 주 전날(일요일): 이 날이 있어야 쉬어 간 주가 "기록을 시작한 주" 가 아닙니다.
  const dayBefore = moveDateKey(restWeek, -1)
  sessions.push(plainSession(dayBefore, '14:00', 60, 'math'))
  checkins[dayBefore] = plainCheckIn(dayBefore, 4)
  // 쉬어 간 주: 목요일 40분 · 토요일 20분. 나머지 날은 지쳐서 체크인만.
  const thursday = moveDateKey(restWeek, 3)
  const saturday = moveDateKey(restWeek, 5)
  sessions.push(plainSession(thursday, '20:00', 40, 'math'))
  sessions.push(plainSession(saturday, '15:00', 20, 'english'))
  for (const dateKey of [moveDateKey(restWeek, 0), moveDateKey(restWeek, 2), thursday, saturday]) {
    checkins[dateKey] = plainCheckIn(dateKey, 2)
  }
  // 28일이 시작한 주의 앞부분(월요일 ~ 28일 전날): 하루 한 번씩 다시 시작한 기록
  for (let dateKey = startWeek; dateKey < startKey; dateKey = moveDateKey(dateKey, 1)) {
    sessions.push(plainSession(dateKey, '19:30', 45, 'english'))
    checkins[dateKey] = plainCheckIn(dateKey, 3)
  }

  // ── 2. 확인 문제 결과 ──
  const quizResults: QuizResult[] = []
  const personaStudy = persona.sessions.filter(
    (session) => session.kind !== 'play' && session.cardId && QUESTION_BANK[session.subjectId],
  )
  for (let dayIndex = 0; dayIndex <= 27; dayIndex++) {
    const dateKey = moveDateKey(startKey, dayIndex)
    const random = createRandom(hashSeed(`quiz|${dayIndex}`))
    // 2/3 쯤의 날에만 풉니다.
    if (random() > 0.67) continue
    const daySessions = personaStudy.filter((session) => toDayKey(session.startedAt) === dateKey)
    // 그날 공부한 카드 중 하나 (없으면 건너뜀)
    const session = daySessions[Math.floor(random() * daySessions.length)]
    if (!session || session.endedAt + 10 * MINUTE > now) continue

    const bank = QUESTION_BANK[session.subjectId]
    const first = Math.floor(random() * bank.length)
    const questions = [0, 1, 2].map((offset) => bank[(first + offset) % bank.length])
    const answers = questions.map((question) => {
      const isCorrect = random() < correctRateOn(dayIndex)
      // 틀린 답은 정답 바로 다음 보기
      const choiceIndex = isCorrect ? question.answerIndex : (question.answerIndex + 1) % 4
      return { choiceIndex, ms: 6000 + Math.floor(random() * 9000) }
    })
    quizResults.push({
      id: `${DEMO_ID_PREFIX}quiz-${dateKey}`,
      date: dateKey,
      at: session.endedAt + 10 * MINUTE,
      topic: SUBJECT_TOPICS[session.subjectId],
      cardId: session.cardId ?? null,
      questions,
      answers,
      correct: answers.filter(
        (answer, index) => answer.choiceIndex === questions[index].answerIndex,
      ).length,
      guessed: false,
      isDemo: true,
    })
  }

  // ── 3. 이번 주에 고른 것: 지난주 · 이번 주 ──
  const thisWeek = getWeekStart(todayKey)
  const lastWeek = moveDateKey(thisWeek, -7)
  const picks: WeeklyPick[] = [lastWeek, thisWeek].map((weekStart) => ({
    id: `${DEMO_ID_PREFIX}pick-${weekStart}`,
    weekStart,
    title: '폰을 다른 방에 두기',
    hint: '손이 안 닿으면 덜 멈춰요',
    skip: false,
    // 그 전 주 일요일 밤에 골랐다고 둡니다.
    decidedAt: Math.min(now, atTime(moveDateKey(weekStart, -1), '21:00')),
  }))

  // ── 4. 사용설명서 ──
  const notes: Record<string, string> = {
    [`${DEMO_ID_PREFIX}manual-rhythm`]: '기록 3주 · 온보딩 때는 "저녁형" 이라고 했어요',
    [`${DEMO_ID_PREFIX}manual-caution`]: '첫 2주 학원 날과 다른 날 비교',
    [`${DEMO_ID_PREFIX}manual-phone-room`]: '실험 14일 · 자기 실험에서 넣음',
  }
  const manualItems: ManualItem[] = [
    ...persona.manualItems.map((item) => ({ ...item, note: notes[item.id] ?? item.note })),
    {
      id: `${DEMO_ID_PREFIX}manual-desk-start`,
      category: 'effectiveMethod',
      title: '책상에 앉으면 → 타이머 켜고 쉬운 문제 1개',
      confirmedDate: moveDateKey(startKey, 6),
      evidence: '해 보니 첫 시작이 평균 15분 빨라지고, 하루 순공이 20분쯤 늘었어요.',
      note: '1주 해 보기 · 공부한 6일 중 5일',
    },
    {
      id: `${DEMO_ID_PREFIX}manual-care-push`,
      category: 'careStyle',
      title: '재촉해 주면 더 빨리 시작해요',
      confirmedDate: moveDateKey(startKey, 14),
      evidence: '칭찬받은 날보다 한 번 더 챙겨 준 날에 공부 시작이 평균 12분 빨랐어요.',
      note: '관리 1단계와 2단계 비교',
    },
  ]

  return { sessions, checkins, quizResults, picks, manualItems }
}
