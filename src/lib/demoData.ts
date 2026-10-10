import { toDateKey } from '@/lib/dailyRecords'
import { mockSubjects } from '@/lib/mock'
import { loadData, saveData } from '@/lib/storage'
import type { StudyPlan, StudySession, Subject } from '@/types'

/**
 * 주간·월간 리포트를 미리 볼 수 있게 "가상 데이터"를 넣고 빼는 함수입니다. (개발할 때만 씁니다)
 *
 * 월간 리포트는 기록이 42일(6주) 넘게 쌓여야 열리고, "지난달보다" 비교까지 보려면 8주가 더 필요합니다.
 * 손으로 그만큼 기록할 수는 없으니, 최근 9주치 계획과 공부 기록을 한 번에 만들어 저장합니다.
 *
 * ■ 정해 둔 규칙
 *   - 가상 데이터의 id 는 모두 'demo-' 로 시작합니다. 그래서 지울 때 내가 직접 만든 기록은 남습니다.
 *   - 오래된 날일수록 공부를 적게, 늦게 시작하고 → 최근일수록 많이, 일찍 시작합니다. (리포트의 ↑↓ 가 보이도록)
 *   - 일요일과 가끔 하루는 쉽니다. (빈 날이 있어야 진짜 기록처럼 보입니다)
 *   - 오늘은 계획만 넣고 공부 기록은 넣지 않습니다. 아직 오지 않은 시각의 기록이 생기면 안 되기 때문입니다.
 */

/** 가상 데이터 id 앞에 붙는 글자. 지울 때 이걸로 골라냅니다. */
const DEMO_ID_PREFIX = 'demo-'

/** 며칠 전까지 만들지 (9주 = 63일) */
const DEMO_DAYS = 63

const MINUTE = 60 * 1000 // 1분 = 60,000 밀리초

/** 날짜('YYYY-MM-DD')마다 그날의 계획 목록. usePlans 가 저장하는 모양과 같습니다. */
type PlansByDate = Record<string, StudyPlan[]>

// 과목마다 쓸 계획 내용 예시. 과목 id 가 여기 없으면 '복습하기' 를 씁니다.
const PLAN_CONTENTS: Record<string, string[]> = {
  korean: ['비문학 지문 3개 읽기', '문학 작품 정리', '모의고사 국어 1회'],
  math: ['수학 문제집 3단원', '오답노트 정리', '기출 20문제'],
  english: ['영단어 50개 외우기', '듣기 1회분', '독해 지문 5개'],
  science: ['화학 개념 정리', '물리 문제 풀기', '생명과학 인강 1강'],
  social: ['한국사 인강 1강', '사회문화 요약', '세계지리 문제'],
}

/** min 이상 max 이하의 정수를 아무거나 하나 고릅니다. */
function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** 배열에서 아무거나 하나 고릅니다. */
function pickOne<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)]
}

/** 내 과목 목록. 플래너에서 과목을 바꿨으면 그 과목으로 만듭니다. */
function loadSubjects(): Subject[] {
  const subjects = loadData<Subject[]>('subjects', mockSubjects)
  return subjects.length > 0 ? subjects : mockSubjects
}

/**
 * 하루치 가상 계획과 공부 기록을 만듭니다.
 * progress 는 0(가장 오래된 날) ~ 1(오늘) 사이 값입니다. 클수록 더 많이, 더 일찍 공부합니다.
 */
function makeDemoDay(
  date: Date,
  progress: number,
  subjects: Subject[],
  isToday: boolean,
): { plans: StudyPlan[]; sessions: StudySession[] } {
  const dateKey = toDateKey(date)
  const isSunday = date.getDay() === 0
  // 일요일은 쉬고, 다른 날도 10번에 1번쯤은 쉽니다. (오늘은 계획을 보여주려고 쉬지 않습니다)
  if (!isToday && (isSunday || Math.random() < 0.1)) return { plans: [], sessions: [] }

  // 계획은 처음엔 2~3개, 후반(progress 0.5 넘음)엔 3~4개. 과목이 겹치지 않게 섞은 뒤 앞에서부터 고릅니다.
  const planCount = Math.min(subjects.length, randomInt(2, 3) + (progress > 0.5 ? 1 : 0))
  const daySubjects = [...subjects].sort(() => Math.random() - 0.5).slice(0, planCount)

  // 계획을 얼마나 지키는지: 처음엔 50% 안팎 → 최근엔 90% 안팎
  const keepRate = 0.5 + progress * 0.4

  // 첫 시작 시각: 처음엔 밤 9시쯤 → 최근엔 저녁 7시쯤 (분 단위, 자정부터)
  let startMinutes = Math.round(21 * 60 - progress * 120) + randomInt(-20, 20)

  const plans: StudyPlan[] = []
  const sessions: StudySession[] = []

  daySubjects.forEach((subject, index) => {
    const targetMinutes = pickOne([30, 40, 50, 60, 90])
    // 실제로 공부한 시간 = 목표 × 지키는 비율 (±20% 흔들림)
    const studiedMinutes = Math.round(targetMinutes * keepRate * (0.8 + Math.random() * 0.4))

    plans.push({
      id: `${DEMO_ID_PREFIX}plan-${dateKey}-${index}`,
      date: dateKey,
      subjectId: subject.id,
      content: pickOne(PLAN_CONTENTS[subject.id] ?? ['복습하기']),
      targetMinutes,
      done: !isToday && studiedMinutes >= targetMinutes,
    })

    // 오늘은 공부 기록을 만들지 않습니다. (위 설명 참고) 10분이 안 되면 공부를 안 한 것으로 칩니다.
    if (isToday || studiedMinutes < 10) return

    const startedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const sessionStart = startedAt + startMinutes * MINUTE
    sessions.push({
      id: `${DEMO_ID_PREFIX}session-${dateKey}-${index}`,
      subjectId: subject.id,
      startedAt: sessionStart,
      endedAt: sessionStart + studiedMinutes * MINUTE,
      pauseCount: randomInt(0, 3),
    })

    // 다음 과목은 끝나고 10분 쉰 뒤 시작합니다.
    startMinutes += studiedMinutes + 10
  })

  return { plans, sessions }
}

/**
 * 최근 9주치 가상 데이터를 만들어 저장합니다.
 * 전에 넣은 가상 데이터는 먼저 지우고 새로 만듭니다. 내가 직접 만든 기록은 그대로 둡니다.
 * 온보딩에서 시험 날짜를 안 정했으면, 성장 곡선을 볼 수 있게 60일 뒤 "기말고사" 를 넣어 줍니다.
 */
export function addDemoData(): void {
  // 먼저 예전 가상 데이터를 빼서, 두 번 눌러도 기록이 두 배가 되지 않게 합니다.
  removeDemoData()

  const subjects = loadSubjects()
  const plansByDate = loadData<PlansByDate>('plans', {})
  const sessions = loadData<StudySession[]>('sessions', [])

  const today = new Date()
  for (let daysAgo = DEMO_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
    // new Date(년, 월, 일) 은 일이 범위를 넘어가면 달·해를 알아서 넘겨줍니다.
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo)
    const progress = 1 - daysAgo / (DEMO_DAYS - 1)
    const day = makeDemoDay(date, progress, subjects, daysAgo === 0)

    if (day.plans.length > 0) {
      const dateKey = toDateKey(date)
      plansByDate[dateKey] = [...(plansByDate[dateKey] ?? []), ...day.plans]
    }
    sessions.push(...day.sessions)
  }

  saveData('plans', plansByDate)
  saveData('sessions', sessions)

  const onboardingAnswers = loadData<Record<string, string>>('onboarding-answers', {})
  if (!onboardingAnswers.targetExamDate) {
    const examDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60)
    saveData('onboarding-answers', {
      ...onboardingAnswers,
      targetExam: onboardingAnswers.targetExam || '기말고사',
      targetExamDate: toDateKey(examDate),
    })
  }
}

/** 가상 데이터가 들어 있는지 알려줍니다. id 가 'demo-' 로 시작하는 공부 기록이 하나라도 있으면 true 입니다. */
export function hasDemoData(sessions: StudySession[]): boolean {
  return sessions.some((session) => session.id.startsWith(DEMO_ID_PREFIX))
}

/** 'demo-' 로 시작하는 가상 계획·공부 기록만 지웁니다. 온보딩에 넣어 준 시험 날짜는 남겨 둡니다. */
export function removeDemoData(): void {
  const plansByDate = loadData<PlansByDate>('plans', {})
  const nextPlans: PlansByDate = {}
  for (const [date, plans] of Object.entries(plansByDate)) {
    const remaining = plans.filter((plan) => !plan.id.startsWith(DEMO_ID_PREFIX))
    // 그날 계획이 하나도 안 남으면 날짜 칸도 지웁니다. (usePlans 의 deletePlan 과 같은 규칙)
    if (remaining.length > 0) nextPlans[date] = remaining
  }
  saveData('plans', nextPlans)

  const sessions = loadData<StudySession[]>('sessions', [])
  saveData(
    'sessions',
    sessions.filter((session) => !session.id.startsWith(DEMO_ID_PREFIX)),
  )
}
