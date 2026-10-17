import { CARD_FAIL_CAUSES } from '@/lib/cardMarks'
import { formatMinutes } from '@/lib/dailyRecords'
import { getWeekday } from '@/lib/routines'
import { moveDateKey, toDayKey } from '@/lib/date'
import type { MyHypotheses } from '@/lib/myHypotheses'
import type { JudgedCardDay } from '@/lib/relapseSignal'
import { getStudyMs } from '@/lib/studyTime'
import type { Card, PauseTag, StudySession } from '@/types'

/**
 * 내 가설 확인 (최종 기획서 「4.6 분석」 내 가설, #411)
 *
 * 온보딩 자기 인식 4개(아침형/밤형 · 한 번에 집중하는 시간 · 가장 큰 방해 요소 · 평일 공부 시간)를
 * AI 가설과 같은 방식으로 기록과 비교합니다. **3일째와 7일째**에 첫 확인을 보여 줘서 첫 2주 공백을 메웁니다.
 * 비교할 기록이 5일보다 적으면 '가설(확인 중)' 으로만 말합니다 (「2 수집 원칙」).
 * 숫자는 코드가 계산하고, 판정은 하지 않습니다 — "예상은 ○○였지?" 로 사실만 보여 줍니다.
 */

export type HypothesisKey =
  'chronotype' | 'maxFocusMinutes' | 'biggestDistraction' | 'dailyAvailableMinutes'

export interface HypothesisCheck {
  key: HypothesisKey
  /** 무엇에 대한 가설인지 */
  title: string
  /** 내가 적은 답 ('잘 모르겠음' 포함) */
  guess: string
  /** 기록으로 본 것 한 줄. 아직 비교할 기록이 없으면 null */
  message: string | null
  /** 예상과 비슷한지 — 비교할 수 없으면 null */
  isMatch: boolean | null
  /** 비교에 쓴 날 수 */
  sampleDays: number
}

/** 이보다 적은 날로 비교했으면 '가설(확인 중)' 입니다 */
export const MIN_CONFIRM_DAYS = 5
/** 첫 확인을 보여 주는 날 (가설을 적은 날 = 1일째) */
export const FIRST_CHECK_DAYS = [3, 7]
/** 시간(분) 가설은 예상의 ±25% 안이면 비슷하다고 봅니다 */
const MINUTES_TOLERANCE = 0.25
/** 아침/밤 실행률 차이가 이보다 작으면 '비슷함' */
const CHRONO_DIFF = 0.1

const MS_PER_MINUTE = 60 * 1000

/** 가설을 적은 지 며칠째인지 (적은 날 = 1일째) */
export function getHypothesisDay(
  hypotheses: Pick<MyHypotheses, 'savedAt'>,
  todayKey: string,
): number {
  const startKey = toDayKey(hypotheses.savedAt)
  let day = 1
  while (moveDateKey(startKey, day - 1) < todayKey && day < 400) day++
  return day
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

/** 시간(분) 가설 문장 — '예상은 ○분이었지?' */
function minutesCheck(
  key: HypothesisKey,
  title: string,
  guess: number | null,
  actual: number | null,
  sampleDays: number,
  describe: (minutes: number) => string,
): HypothesisCheck {
  const guessText = guess === null ? '잘 모르겠음' : formatMinutes(guess)
  if (actual === null)
    return { key, title, guess: guessText, message: null, isMatch: null, sampleDays }
  const rounded = Math.round(actual)
  const isMatch = guess === null ? null : Math.abs(rounded - guess) <= guess * MINUTES_TOLERANCE
  const tail = guess === null ? '' : ` 예상은 ${formatMinutes(guess)}이었지?`
  return {
    key,
    title,
    guess: guessText,
    message: `${describe(rounded)}${tail}`,
    isMatch,
    sampleDays,
  }
}

/** 방해 요소 가설의 보기(온보딩) ↔ 기록의 태그 */
const PAUSE_TO_DISTRACTION: Partial<Record<PauseTag, string>> = {
  phone: '폰·SNS',
  mindWander: '잡생각',
  external: '친구·가족',
}
const FAIL_TO_DISTRACTION: Record<string, string> = { phone: '폰·SNS', tired: '졸림' }

export interface HypothesisInput {
  cards: Pick<Card, 'id' | 'startTime'>[]
  sessions: StudySession[]
  judgedDays: JudgedCardDay[]
  todayKey: string
}

/**
 * 내 가설 4개를 기록과 비교합니다. 가설을 적은 날부터 오늘까지의 기록만 봅니다.
 *
 * ■ 예시
 *   밤형이라 했는데 아침 카드 실행률 82% · 밤 카드 54%  -> "아침 카드 실행률 82% · 밤 카드 54%. '밤형' 이라고 했지?" (isMatch false)
 *   50분 집중한다 했는데 첫 일시정지까지 평균 23분      -> "한 번에 평균 23분 이어서 했어. 예상은 50분이었지?"  (isMatch false)
 *   방해 요소 '폰·SNS', 기록 1위도 폰 확인            -> "멈추거나 놓친 이유 1위는 '폰·SNS'(7번)." (isMatch true)
 *   평일 3시간 한다 했는데 평균 1시간 40분             -> "평일 하루 평균 1시간 40분 했어. 예상은 3시간이었지?" (isMatch false)
 */
export function checkHypotheses(
  hypotheses: MyHypotheses,
  input: HypothesisInput,
): HypothesisCheck[] {
  const fromKey = toDayKey(hypotheses.savedAt)
  const days = input.judgedDays.filter((day) => day.dateKey >= fromKey && day.result !== 'rest')
  const sessions = input.sessions.filter(
    (session) =>
      session.kind !== 'play' &&
      session.mode !== 'selfReport' &&
      toDayKey(session.startedAt) >= fromKey,
  )
  const startTimeOf = new Map(input.cards.map((card) => [card.id, card.startTime]))

  // ① 아침형 / 밤형 — 아침(04~12시) 카드와 밤(18~04시) 카드의 실행률
  const morning = days.filter((day) => {
    const time = startTimeOf.get(day.cardId)
    return time !== undefined && time >= '04:00' && time < '12:00'
  })
  const night = days.filter((day) => {
    const time = startTimeOf.get(day.cardId)
    return time !== undefined && (time >= '18:00' || time < '04:00')
  })
  const morningRate = average(morning.map((day) => day.runRate))
  const nightRate = average(night.map((day) => day.runRate))
  const chronoGuess =
    hypotheses.chronotype === 'morning'
      ? '아침형'
      : hypotheses.chronotype === 'night'
        ? '밤형'
        : '잘 모르겠음'
  const chronoDays = new Set([...morning, ...night].map((day) => day.dateKey)).size
  let chrono: HypothesisCheck = {
    key: 'chronotype',
    title: '아침형 / 밤형',
    guess: chronoGuess,
    message: null,
    isMatch: null,
    sampleDays: chronoDays,
  }
  if (morningRate !== null && nightRate !== null) {
    const diff = morningRate - nightRate
    const actual = diff >= CHRONO_DIFF ? 'morning' : diff <= -CHRONO_DIFF ? 'night' : 'similar'
    const base = `아침 카드 실행률 ${percent(morningRate)} · 밤 카드 ${percent(nightRate)}.`
    chrono = {
      ...chrono,
      message: hypotheses.chronotype
        ? `${base} '${chronoGuess}' 이라고 했지?`
        : `${base} ${actual === 'similar' ? '아직 큰 차이는 없어요.' : actual === 'morning' ? '아침이 더 잘 돼요.' : '밤이 더 잘 돼요.'}`,
      isMatch: hypotheses.chronotype ? actual === hypotheses.chronotype : null,
    }
  }

  // ② 한 번에 집중하는 시간 — 시작부터 첫 일시정지(없으면 끝)까지
  const focusRuns = sessions.map((session) => {
    const firstPause = (session.pauses ?? [])
      .map((pause) => pause.startedAt)
      .sort((a, b) => a - b)[0]
    return ((firstPause ?? session.endedAt) - session.startedAt) / MS_PER_MINUTE
  })
  const focusDays = new Set(sessions.map((session) => toDayKey(session.startedAt))).size
  const focus = minutesCheck(
    'maxFocusMinutes',
    '한 번에 집중하는 시간',
    hypotheses.maxFocusMinutes,
    average(focusRuns),
    focusDays,
    (minutes) => `한 번에 평균 ${formatMinutes(minutes)} 이어서 했어.`,
  )

  // ③ 가장 큰 방해 요소 — 일시정지 이유 + 실패 원인 중 가장 많은 것
  const counts = new Map<string, number>()
  function bump(label: string | undefined) {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  for (const session of sessions) {
    for (const pause of session.pauses ?? []) bump(PAUSE_TO_DISTRACTION[pause.tag])
  }
  for (const day of days) {
    if (!day.missReason) continue
    const cause = day.missReason
    bump(FAIL_TO_DISTRACTION[cause] ?? CARD_FAIL_CAUSES.find((item) => item.key === cause)?.label)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const distractionGuess = hypotheses.biggestDistraction ?? '잘 모르겠음'
  const distractionDays = new Set([
    ...sessions.map((session) => toDayKey(session.startedAt)),
    ...days.filter((day) => day.missReason).map((day) => day.dateKey),
  ]).size
  const distraction: HypothesisCheck = {
    key: 'biggestDistraction',
    title: '가장 큰 방해 요소',
    guess: distractionGuess,
    message: top
      ? `멈추거나 놓친 이유 1위는 '${top[0]}'(${top[1]}번).${hypotheses.biggestDistraction ? ` 예상은 '${distractionGuess}' 였지?` : ''}`
      : null,
    isMatch: top && hypotheses.biggestDistraction ? top[0] === hypotheses.biggestDistraction : null,
    sampleDays: distractionDays,
  }

  // ④ 평일 하루 공부 시간 — 가설을 적은 날부터 어제까지의 평일 (오늘은 아직 안 끝남)
  //    공부 기록이 하나도 없으면 아직 비교하지 않습니다 (0분이라고 말하지 않음)
  const minutesByDay = new Map<string, number>()
  for (const session of sessions) {
    const key = toDayKey(session.startedAt)
    minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + getStudyMs(session) / MS_PER_MINUTE)
  }
  const weekdays: number[] = []
  for (let key = fromKey; key < input.todayKey; key = moveDateKey(key, 1)) {
    const weekday = getWeekday(key)
    if (weekday >= 1 && weekday <= 5) weekdays.push(minutesByDay.get(key) ?? 0)
  }
  const daily = minutesCheck(
    'dailyAvailableMinutes',
    '평일 하루 공부 시간',
    hypotheses.dailyAvailableMinutes,
    sessions.length === 0 ? null : average(weekdays),
    weekdays.length,
    (minutes) => `평일 하루 평균 ${formatMinutes(minutes)} 했어.`,
  )

  return [chrono, focus, distraction, daily]
}
