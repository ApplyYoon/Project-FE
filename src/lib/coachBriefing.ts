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
import {
  DAILY_GOAL_MINUTES,
  REVIEW_MINUTES,
  countDoneMissions,
  nextMission,
  type Mission,
  type MissionSlot,
} from '@/lib/dailyMission'
import type { ChatReply } from '@/lib/chatApi'
import { sessionMinutes } from '@/lib/dailyRecords'
import type { SchoolToday } from '@/lib/schoolToday'
import { loadData } from '@/lib/storage'
import type { TodayCardsState } from '@/lib/todayCards'
import type { Card, CheckIn, EmotionTag, StudySession } from '@/types'

/**
 * 말풍선 아래의 빠른 답 칩 하나.
 *   say          — 누르면 그 말을 내 말풍선으로 보냅니다
 *   startCard    — 그 카드로 타이머를 엽니다 (/timer?card=…)
 *   startMinutes — 그 길이의 즉석 카드를 만들어 바로 시작합니다
 *   newCard      — 카드 만들기 화면으로 갑니다
 *   checkIn      — 오늘 컨디션으로 저장하고(그날의 체크인), 그 말을 내 말풍선으로 보냅니다 (2026-10-18)
 *   startTitled  — 그 제목 · 길이의 카드를 만들어 바로 시작합니다 (예: '미적분Ⅰ 복습' 10분)
 * 행동 칩(say · checkIn 이 아닌 것)은 누를 때만 실행합니다. 자동으로 하지 않습니다.
 */
export type CoachChip =
  | { kind: 'say'; label: string }
  | { kind: 'startCard'; label: string; cardId: string }
  | { kind: 'startMinutes'; label: string; minutes: number }
  | { kind: 'newCard'; label: string }
  | { kind: 'checkIn'; label: string; condition: number; emotions: EmotionTag[] }
  | { kind: 'startTitled'; label: string; title: string; minutes: number }
  /** 시험 범위 사진으로 카드 만들기 화면(/cards/photo)을 엽니다. 시험이 가까울 때만 나옵니다. */
  | { kind: 'photoCards'; label: string }

/**
 * 오늘 컨디션을 묻는 칩 3개. 누르면 그날의 체크인이 됩니다. (예전의 "하루 첫 한 줄" 대신)
 * 컨디션은 1 ~ 5 중 4 · 3 · 2 로, '피곤해' 는 감정 태그 '피곤함' 도 같이 남깁니다.
 */
/** 시험이 이만큼(일) 안으로 다가오면 "📸 시험 범위 찍기" 칩을 보여 줍니다. */
const PHOTO_CHIP_EXAM_DAYS = 21

export const CONDITION_CHIPS: CoachChip[] = [
  { kind: 'checkIn', label: '😄 좋아', condition: 4, emotions: [] },
  { kind: 'checkIn', label: '😐 그냥 그래', condition: 3, emotions: [] },
  { kind: 'checkIn', label: '😩 피곤해', condition: 2, emotions: ['TIRED'] },
]

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
  // 오늘 컨디션을 아직 모르면 그것부터 묻습니다. 칩을 누르면 그날의 체크인이 되고, 그다음은 AI 와 이야기합니다.
  if (input.checkIn === undefined) {
    lines.push('먼저, 오늘 컨디션은 어때? 하나만 골라 줘.')
    return { text: lines.join('\n'), chips: CONDITION_CHIPS }
  }
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

  // 시험이 3주 안이면 "시험 범위 사진 찍기" 칩을 더합니다. 범위표 한 장으로 시험 전날까지 카드를 나눠 줍니다.
  if (exam && exam.dDay >= 1 && exam.dDay <= PHOTO_CHIP_EXAM_DAYS) {
    chips = [...chips, { kind: 'photoCards', label: '📸 시험 범위 찍기' }]
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

/** 공부 중에 폰을 든 기록 (앱이 세션마다 저장. 키 'study-phone-lifts', 세션 번호별) */
export interface PhoneLiftRecord {
  /** 폰을 들고 있던 시간 합계 (밀리초) */
  liftedMs: number
  /** 잠깐 확인(5~30초) 횟수 */
  checks: number
  /** 30초 넘게 든 횟수 */
  longLifts: number
  /** 들고 앱 밖으로 나간 횟수 */
  outsideLifts: number
  /** 앱 밖에 있던 시간 합계 (밀리초) */
  outsideMs: number
}

function isPhoneLiftRecord(value: unknown): value is PhoneLiftRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return ['liftedMs', 'checks', 'longLifts', 'outsideLifts', 'outsideMs'].every(
    (key) => typeof record[key] === 'number' && (record[key] as number) >= 0,
  )
}

/** 그 세션의 폰 기록. 앱이 아니거나(웹) 기록이 없으면 null 입니다. */
export function loadPhoneLift(sessionId: string): PhoneLiftRecord | null {
  const saved = loadData<unknown>('phone-lifts', {})
  if (typeof saved !== 'object' || saved === null) return null
  const record = (saved as Record<string, unknown>)[sessionId]
  return isPhoneLiftRecord(record) ? record : null
}

/** 공부가 끝난 지 이만큼 안이면 코치가 먼저 결과를 물어봅니다. (3시간) */
export const RECAP_WITHIN_MS = 3 * 60 * 60 * 1000

/**
 * 코치가 먼저 결과를 물어볼 공부 기록. 3시간 안에 끝났고, 아직 물어보지 않은 가장 최근 것 하나입니다. 없으면 null
 *
 *   findRecapSession(기록들, 지금, '지난번에 물어본 기록 번호')
 */
export function findRecapSession(
  sessions: StudySession[],
  now: number,
  lastRecappedId: string | null,
): StudySession | null {
  const recent = sessions
    .filter((session) => session.endedAt <= now && now - session.endedAt <= RECAP_WITHIN_MS)
    .sort((a, b) => b.endedAt - a.endedAt)[0]
  if (!recent || recent.id === lastRecappedId) return null
  return recent
}

/** 밀리초 → '1분 40초' · '40초' */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}초`
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`
}

/**
 * 타이머가 끝나고 코치 탭에 오면 코치가 먼저 거는 말. 숫자는 기록으로 계산한 것만 씁니다.
 *
 *   buildSessionRecap(25분 기록, { checks: 1, longLifts: 1, outsideMs: 100000, … })
 *   -> '25분 했네! 폰은 2번 들었고, 그중 앱 밖에 1분 40초 있었어. 어땠어?'
 */
export function buildSessionRecap(
  session: StudySession,
  phone: PhoneLiftRecord | null,
): CoachMessage {
  const minutes = sessionMinutes(session)
  let text = `${minutes}분 했네!`
  if (phone) {
    const lifts = phone.checks + phone.longLifts
    if (lifts === 0) {
      text += ' 폰은 한 번도 안 들었어. 대단한데?'
    } else {
      text += ` 폰은 ${lifts}번 들었어`
      text +=
        phone.outsideMs > 0
          ? `, 그중 앱 밖에 ${formatDuration(phone.outsideMs)} 있었어.`
          : '. 앱 밖으로는 안 나갔고.'
    }
  }
  text += ' 어땠어?'
  return {
    text,
    chips: [
      { kind: 'say', label: '다 했어' },
      { kind: 'say', label: '일부만 했어' },
      { kind: 'say', label: '못 했어' },
    ],
  }
}

// ---- 오늘의 미션 (lib/dailyMission.ts) ----

/** 미션 알림을 누르고 들어왔을 때 코치의 첫 줄 */
const MISSION_SLOT_GREETINGS: Record<MissionSlot, string> = {
  morning: '☀️ 오늘의 미션이야!',
  afterSchool: '🎒 하교했지? 미션 확인하자.',
  evening: '🌙 오늘 마무리 전에 미션 보자.',
}

/**
 * 미션 하나를 하자고 권하는 코치의 말과 칩. 칩을 누르면 그 미션을 바로 할 수 있습니다.
 *
 *   buildMissionPrompt({ kind: 'review', subject: '미적분Ⅰ', … }, undefined)
 *   -> { text: '오늘 미적분Ⅰ 수업 있었지? 잊기 전에 10분만 복습하자.', chips: [▷ 미적분Ⅰ 복습 10분, 이따 할게] }
 */
export function buildMissionPrompt(mission: Mission, nowCard: Card | undefined): CoachMessage {
  const laterChip: CoachChip = { kind: 'say', label: '이따 할게' }
  if (mission.kind === 'checkIn') {
    return { text: '오늘 컨디션은 어때? 하나만 골라 줘.', chips: CONDITION_CHIPS }
  }
  if (mission.kind === 'firstStudy') {
    const startChip: CoachChip = nowCard
      ? { kind: 'startCard', label: `▷ ${shorten(nowCard.title, 10)} 시작`, cardId: nowCard.id }
      : {
          kind: 'startMinutes',
          label: `▷ ${DAILY_GOAL_MINUTES}분 시작`,
          minutes: DAILY_GOAL_MINUTES,
        }
    return {
      text: '폰을 화면이 바닥을 보게 엎어 두고 시작해 보자. 폰을 들면 내가 알려 줄게 📱',
      chips: [startChip, laterChip],
    }
  }
  if (mission.subject) {
    return {
      text: `오늘 ${mission.subject} 수업 있었지? 잊기 전에 ${REVIEW_MINUTES}분만 복습하자.`,
      chips: [
        {
          kind: 'startTitled',
          label: `▷ ${shorten(mission.subject, 8)} 복습 ${REVIEW_MINUTES}분`,
          title: `${mission.subject} 복습`,
          minutes: REVIEW_MINUTES,
        },
        laterChip,
      ],
    }
  }
  return {
    text: `오늘 공부 ${DAILY_GOAL_MINUTES}분 채우기가 남았어. 지금 시작해 볼까?`,
    chips: [
      {
        kind: 'startMinutes',
        label: `▷ ${DAILY_GOAL_MINUTES}분 시작`,
        minutes: DAILY_GOAL_MINUTES,
      },
      laterChip,
    ],
  }
}

/** '① ✅ 컨디션 알려 주기' 처럼 미션 목록을 줄로 만듭니다. */
function missionListText(missions: Mission[]): string {
  const numbers = ['①', '②', '③']
  return missions
    .map(
      (mission, index) => `${numbers[index] ?? '·'} ${mission.done ? '✅' : '⬜'} ${mission.title}`,
    )
    .join('\n')
}

/**
 * 오늘의 미션 전체를 보여 주고 다음 미션을 권하는 말. 미션 알림을 누르고 들어왔거나(slot) 미션 줄을 눌렀을 때 씁니다.
 * 다 끝냈으면 칭찬하고 칩은 [고마워!] 하나입니다.
 */
export function buildMissionBriefing(
  missions: Mission[],
  slot: MissionSlot | null,
  nowCard: Card | undefined,
): CoachMessage {
  const head = slot ? MISSION_SLOT_GREETINGS[slot] : '오늘의 미션이야.'
  const list = missionListText(missions)
  const next = nextMission(missions)
  if (!next) {
    return {
      text: `${head}\n${list}\n오늘 미션 다 끝냈어. 대단해 👏`,
      chips: [{ kind: 'say', label: '고마워!' }],
    }
  }
  const prompt = buildMissionPrompt(next, nowCard)
  return { text: `${head}\n${list}\n${prompt.text}`, chips: prompt.chips }
}

/**
 * 미션을 끝내고 코치 화면에 돌아왔을 때 코치가 먼저 거는 한 줄. (몇 개 끝냈는지 + 다음 미션)
 *
 *   -> '✅ 오늘의 미션 2/3 끝! 남은 건 '오늘 배운 미적분Ⅰ 10분 복습' 하나야.'
 */
export function buildMissionProgress(missions: Mission[], nowCard: Card | undefined): CoachMessage {
  const done = countDoneMissions(missions)
  const next = nextMission(missions)
  if (!next) {
    return {
      text: `✅ 오늘의 미션 ${done}/${missions.length} 다 끝냈어! 오늘 정말 잘했어 👏`,
      chips: [{ kind: 'say', label: '고마워!' }],
    }
  }
  const prompt = buildMissionPrompt(next, nowCard)
  return {
    text: `✅ 오늘의 미션 ${done}/${missions.length} 끝! 남은 건 '${next.title}'.\n${prompt.text}`,
    chips: prompt.chips,
  }
}

// ---- 서버 AI 가 준 빠른 답 · 행동 (lib/chatApi.ts 의 quickReplies · action) ----

/**
 * AI 가 고른 빠른 답과 행동을 칩으로 바꿉니다. 둘 다 없으면 빈 목록 — 그때는 화면이 코드 칩(핑계 협상)을 씁니다.
 * 행동 칩이 먼저, 빠른 답이 그 뒤입니다. 행동은 누를 때만 실행합니다.
 *
 *   chipsFromServer({ quickReplies: ['응 할게'], action: { type: 'shrink_today', minutes: 10, title: null } }, undefined)
 *   -> [▷ 10분으로 줄여서 시작, 응 할게]
 */
export function chipsFromServer(
  reply: Pick<ChatReply, 'quickReplies' | 'action'>,
  nowCard: Card | undefined,
): CoachChip[] {
  const chips: CoachChip[] = []
  const action = reply.action
  if (action?.type === 'shrink_today') {
    const minutes = action.minutes ?? SMALL_START_MINUTES
    chips.push({ kind: 'startMinutes', label: `▷ ${minutes}분으로 줄여서 시작`, minutes })
  } else if (action?.type === 'start_timer') {
    chips.push(
      nowCard && action.minutes === null
        ? { kind: 'startCard', label: `▷ ${shorten(nowCard.title, 10)} 시작`, cardId: nowCard.id }
        : {
            kind: 'startMinutes',
            label: `▷ ${action.minutes ?? DAILY_GOAL_MINUTES}분 시작`,
            minutes: action.minutes ?? DAILY_GOAL_MINUTES,
          },
    )
  } else if (action?.type === 'create_card' && action.title) {
    const minutes = action.minutes ?? DAILY_GOAL_MINUTES
    chips.push({
      kind: 'startTitled',
      label: `▷ ${shorten(action.title, 8)} ${minutes}분 시작`,
      title: action.title,
      minutes,
    })
  }
  for (const text of reply.quickReplies) {
    chips.push({ kind: 'say', label: text })
  }
  return chips
}
