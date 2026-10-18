/**
 * AI 코치 화면을 열면 보여 주는 첫 말(아침 브리핑)과 빠른 답 칩을 만드는 순수 함수입니다. (2026-10-18)
 * AI 를 부르지 않고 코드가 만듭니다. 그래서 화면을 열기만 해서는 AI 사용량을 쓰지 않습니다.
 * (학생이 칩을 누르거나 말을 보낼 때 처음으로 서버 채팅을 엽니다. pages/CoachPage.tsx)
 *
 * 재료: 지금 시각 · 오늘 학교 정보(시간표 · 급식 · 시험) · 오늘 카드 · 오늘 체크인(컨디션 · 감정 태그)
 *
 *   buildMorningBriefing({ hour: 8, school, grade: 2, cards, checkIn })
 *   -> { text: '좋은 아침! 오늘은 미적분Ⅰ · 문학 · 영어Ⅰ 수업이 있는 날이야. …', chips: [...] }
 */
import type { SchoolToday } from '@/lib/schoolToday'
import type { TodayCardsState } from '@/lib/todayCards'
import type { CheckIn } from '@/types'

/**
 * 말풍선 아래의 빠른 답 칩 하나.
 *   say          — 누르면 그 말을 내 말풍선으로 보냅니다
 *   startCard    — 그 카드로 타이머를 엽니다 (/timer?card=…)
 *   startMinutes — 그 길이의 즉석 카드를 만들어 바로 시작합니다
 *   newCard      — 카드 만들기 화면으로 갑니다
 * 행동 칩(say 가 아닌 것)은 누를 때만 실행합니다. 자동으로 하지 않습니다.
 */
export type CoachChip =
  | { kind: 'say'; label: string }
  | { kind: 'startCard'; label: string; cardId: string }
  | { kind: 'startMinutes'; label: string; minutes: number }
  | { kind: 'newCard'; label: string }

/** 코치가 하는 말 하나와 그 아래 칩들 */
export interface CoachMessage {
  text: string
  chips: CoachChip[]
}

export interface BriefingInput {
  /** 지금 시각의 시 (0 ~ 23) */
  hour: number
  /** 오늘 학교 정보. 못 받았거나 학교를 안 골랐으면 null */
  school: SchoolToday | null
  /** 내 학년 (1 ~ 3). 모르면 null — 학년 구분 없이 시험을 고릅니다 */
  grade: number | null
  cards: TodayCardsState
  /** 오늘 체크인. 아직 안 했으면 undefined */
  checkIn: CheckIn | undefined
}

/** 피곤해서 목표를 줄여 잡을 때의 길이 (분) */
export const SMALL_START_MINUTES = 10

/** 칩 글자가 너무 길면 줄입니다. (칩은 한 줄로 보여야 해서) */
function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** 시각에 맞는 첫인사 */
function greetingOf(hour: number): string {
  if (hour < 11) return '좋은 아침!'
  if (hour < 17) return '오늘 수업 잘 듣고 있어?'
  if (hour < 22) return '오늘 하루 수고했어!'
  return '늦었네, 오늘은 마무리만 해 보자.'
}

/** 시간표에서 과목 이름을 겹치지 않게 3개까지 */
function subjectsOf(school: SchoolToday | null): string[] {
  const subjects: string[] = []
  for (const period of school?.timetable ?? []) {
    if (!subjects.includes(period.subject)) subjects.push(period.subject)
  }
  return subjects.slice(0, 3)
}

/** 오늘 점심(없으면 오늘 첫 끼) 메뉴 두 개. 첫 메뉴가 밥이면 그다음부터 고릅니다. */
function lunchOf(school: SchoolToday | null): string | null {
  const todayMeals = (school?.meals ?? []).filter((meal) => meal.date === school?.date)
  const meal = todayMeals.find((item) => item.kind === '중식') ?? todayMeals[0]
  if (!meal) return null
  const dishes = meal.dishes.filter((dish) => !dish.endsWith('밥'))
  return (dishes.length > 0 ? dishes : meal.dishes).slice(0, 2).join(', ')
}

/** 30일 안에서 가장 가까운 내 학년 시험. 없으면 null */
function nearestExamOf(
  school: SchoolToday | null,
  grade: number | null,
): { name: string; dDay: number } | null {
  const exams = (school?.events ?? []).filter(
    (event) =>
      event.exam &&
      event.dDay >= 0 &&
      (grade === null || event.grades.length === 0 || event.grades.includes(grade)),
  )
  if (exams.length === 0) return null
  const nearest = exams.reduce((best, event) => (event.dDay < best.dDay ? event : best))
  return { name: nearest.name, dDay: nearest.dDay }
}

/** 오늘 피곤하다고 했는지 (감정 태그 '피곤함' 이거나 컨디션 1 · 2) */
export function isTiredToday(checkIn: CheckIn | undefined): boolean {
  if (!checkIn) return false
  return (checkIn.emotions ?? []).includes('TIRED') || checkIn.condition <= 2
}

/** 코치 화면을 열면 보여 줄 첫 말과 칩을 만듭니다. */
export function buildMorningBriefing(input: BriefingInput): CoachMessage {
  const lines: string[] = [greetingOf(input.hour)]

  const subjects = subjectsOf(input.school)
  if (subjects.length > 0) lines.push(`오늘은 ${subjects.join(' · ')} 수업이 있는 날이야.`)
  const lunch = lunchOf(input.school)
  if (lunch) lines.push(`점심은 ${lunch} 🍚`)
  const exam = nearestExamOf(input.school, input.grade)
  if (exam) {
    lines.push(
      exam.dDay === 0 ? `오늘이 ${exam.name}이야. 힘내!` : `${exam.name}까지 D-${exam.dDay}.`,
    )
  }

  const card = input.cards.current ?? input.cards.next
  const isTired = isTiredToday(input.checkIn)
  if (isTired) {
    lines.push(`피곤하다고 했지? 오늘은 ${SMALL_START_MINUTES}분만 해 보자.`)
  } else if (card) {
    const time = card.startTime ?? '시간 미정'
    lines.push(
      `${input.cards.current ? '지금' : '다음에'} 할 카드는 '${card.title}'(${time} · ${card.durationMinutes}분)이야. 시작해 볼까?`,
    )
  } else {
    lines.push(`오늘 카드는 아직 없어. ${SMALL_START_MINUTES}분짜리로 가볍게 시작해 볼까?`)
  }

  const restChip: CoachChip = { kind: 'say', label: '오늘은 쉴래' }
  let chips: CoachChip[]
  if (isTired) {
    chips = [
      {
        kind: 'startMinutes',
        label: `▷ ${SMALL_START_MINUTES}분만 시작`,
        minutes: SMALL_START_MINUTES,
      },
      { kind: 'say', label: '그래도 다 할래' },
      restChip,
    ]
  } else if (card) {
    chips = [
      { kind: 'startCard', label: `▷ ${shorten(card.title, 10)} 시작`, cardId: card.id },
      { kind: 'say', label: `${SMALL_START_MINUTES}분만 할래` },
      restChip,
    ]
  } else {
    chips = [
      {
        kind: 'startMinutes',
        label: `▷ ${SMALL_START_MINUTES}분 시작`,
        minutes: SMALL_START_MINUTES,
      },
      { kind: 'newCard', label: '카드 만들기' },
      restChip,
    ]
  }

  return { text: lines.join('\n'), chips }
}

/**
 * 학생이 쓴 말에 "피곤 · 시간 없 · 하기 싫" 같은 핑계가 있으면 목표를 줄이는 행동 칩을 붙입니다. (핑계 협상)
 * AI 의 답(서버든 시연용이든) 아래에 코드가 붙입니다. 누를 때만 실행됩니다.
 *
 *   negotiationChipsFor('오늘 너무 피곤해') -> [▷ 10분으로 줄여서 시작, 그래도 다 할래]
 *   negotiationChipsFor('좋아')            -> []
 */
export function negotiationChipsFor(studentText: string): CoachChip[] {
  const isExcuse = EXCUSE_WORDS.some((word) => studentText.includes(word))
  if (!isExcuse) return []
  return [
    {
      kind: 'startMinutes',
      label: `▷ ${SMALL_START_MINUTES}분으로 줄여서 시작`,
      minutes: SMALL_START_MINUTES,
    },
    { kind: 'say', label: '그래도 다 할래' },
  ]
}

/** 목표를 줄여 주자고 할 핑계 말들 */
export const EXCUSE_WORDS = [
  '피곤',
  '졸려',
  '힘들',
  '시간 없',
  '시간이 없',
  '바빠',
  '하기 싫',
  '귀찮',
  '쉴래',
  '10분만',
]
