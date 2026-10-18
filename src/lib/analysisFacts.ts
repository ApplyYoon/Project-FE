import { CARD_FAIL_CAUSES, type CardFailCause } from '@/lib/cardMarks'
import { isMissResult } from '@/lib/cardResult'
import { getCauseKind } from '@/lib/careStage'
import { formatMinutes } from '@/lib/dailyRecords'
import { moveDateKey, toDayKey } from '@/lib/date'
import { EXPERIMENT_STATUS_LABELS, type Experiment } from '@/lib/experiments'
import { getFixedBlocksOnDate } from '@/lib/fixedBlocks'
import type { JudgedCardDay } from '@/lib/relapseSignal'
import { getWeekday, getWeekdayName } from '@/lib/routines'
import { getSessionCardId } from '@/lib/sessionRecords'
import { GOOD_REASONS, PAUSE_TAGS, SHORTFALL_REASONS } from '@/lib/sessionTags'
import { findStrategy, getStrategiesFor } from '@/lib/strategyCatalog'
import { getStudyMs } from '@/lib/studyTime'
import { PREDICTION_OPTIONS, type WeeklyPrediction } from '@/lib/weeklyPrediction'
import type { Card, CheckIn, FixedBlock, StudySession } from '@/types'

/**
 * AI 자기 분석의 재료 (#419 표 14번, 최종 기획서 「2 자기분석의 목표」 · 「4.6 분석」)
 *
 * 최근 28일 기록(카드 하루치 · 공부 세션 · 실패 표시 · 체크인 · 주간 예측 · 실험)을
 * **숫자 몇 줄**(AnalysisFact)로 묶습니다. 서버의 AI(BE `POST /ai/analysis`)는 이 숫자만 읽고 말로 풀어 줍니다.
 * 숫자는 여기(코드)가 계산하고, AI 는 계산하지 않습니다. AI 가 못 쓰면 buildCodeAnalysis 의 기본 문장이 나옵니다.
 *
 * 묶음 5개 — 기획서의 자기분석 목표 ① 인지 왜곡 교정 · ② 성향 · 의지력 측정
 *   tendency   성향         언제 · 어떤 조건에서 잘 되나
 *   distortion 생각과 실제  내가 적은 가설 · 예측과 실제 기록의 차이
 *   willpower  약속 지키기  정시 시작 · 실행률 · 미루기 (점수로 보여 주지 않습니다, 「4.6」)
 *   efficiency 공부 효율    체크리스트 · 시작 지연 · 일시정지 · 강의 대 자습
 *   failure    실패 원인    못 한 이유 · 가장 어려운 카드 · 지난 실험
 *
 * React 도 저장소도 쓰지 않는 순수 함수입니다. 저장소에서 읽는 것은 hooks/useAnalysisMaterial.ts 가 합니다.
 */

export type AnalysisGroup = 'tendency' | 'distortion' | 'willpower' | 'efficiency' | 'failure'

/** 묶음과 화면에 보이는 이름 (화면 순서) */
export const ANALYSIS_GROUPS: { group: AnalysisGroup; label: string }[] = [
  { group: 'tendency', label: '성향' },
  { group: 'distortion', label: '생각과 실제' },
  { group: 'willpower', label: '약속 지키기' },
  { group: 'efficiency', label: '공부 효율' },
  { group: 'failure', label: '실패 원인' },
]

/** 숫자 한 줄. BE 의 AnalysisRequest.Fact 와 같은 모양입니다. */
export interface AnalysisFact {
  /** 숫자를 구분하는 이름 (영문·숫자). AI 가 "이 숫자를 근거로 썼다" 고 알려 줄 때 씁니다 */
  key: string
  group: AnalysisGroup
  /** 무슨 숫자인지 (30자까지). 예: '시간대별 실행률' */
  label: string
  /** 값 (80자까지). 예: '아침 95% · 밤 63%' */
  value: string
  /** 몇 개의 기록으로 계산했는지 (30자까지). 예: '카드 64번' */
  basis: string
}

/** 묶음 하나의 분석 (AI 가 썼거나 코드가 만든 기본 문장) */
export interface AnalysisSection {
  group: AnalysisGroup
  headline: string
  body: string
  /** 근거가 된 숫자의 key */
  evidenceKeys: string[]
}

/** 2주 동안 해 볼 실험 하나 ("만약 ~하면 → ~한다") */
export interface AnalysisExperiment {
  ifText: string
  thenText: string
  why: string
}

/** 화면에 보여 주는 분석 한 벌 */
export interface SelfAnalysis {
  summary: string
  sections: AnalysisSection[]
  nextExperiment: AnalysisExperiment | null
}

/** 분석에 쓰는 기간 (오늘 포함) */
export const ANALYSIS_DAYS = 28
/** 한 숫자를 만들려면 기록이 이만큼은 있어야 합니다. 적으면 그 숫자는 빼고 보냅니다 */
const MIN_SAMPLES = 3
/** 숫자가 이보다 적으면 분석하지 않습니다 ("기록이 쌓이면 분석해 줘요") */
export const MIN_FACTS = 3
/** 서버가 받는 숫자 수의 한도 (BE AnalysisRequest) */
const MAX_FACTS = 30

const MS_PER_MINUTE = 60 * 1000

export interface AnalysisInput {
  cards: Card[]
  /** 공부 기록 + 노는 기록 (노는 기록은 여기서 뺍니다) */
  sessions: StudySession[]
  /** 최근 ANALYSIS_DAYS 일의 카드 하루치 판정 (lib/cardDays.ts 의 buildJudgedCardDays) */
  judgedDays: JudgedCardDay[]
  fixedBlocks: FixedBlock[]
  /** 날짜 → 체크인 */
  checkIns: Record<string, CheckIn>
  predictions: WeeklyPrediction[]
  experiments: Experiment[]
  todayKey: string
}

/** 숫자 묶음과, 기본 실험 제안을 고를 때 쓰는 "가장 많은 실패 원인" */
export interface AnalysisMaterial {
  facts: AnalysisFact[]
  topFailCause?: CardFailCause
  /** 분석에 쓴 최근 날짜 (최근 것부터 7일까지). 인사이트의 '근거 보기' 에 씁니다 */
  evidenceDates: string[]
}

// ── 작은 도구 ──

/** 0 ~ 1 → '62%' */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * 서버가 받는 글자만 남깁니다. (한글 · 영문 · 숫자 · 띄어쓰기 · % · ( ) → , . : / ~ + ' -)
 * 카드 이름처럼 학생이 쓴 글이 값에 들어갈 때 씁니다.
 *
 *   toSafeText('수학!! 오답 😀', 10) -> '수학 오답'
 */
export function toSafeText(text: string, maxLength: number): string {
  return text
    .replace(/[^가-힣a-zA-Z0-9 %·()→,.:/~+'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim()
}

/** 시작 시각 → 시간대. 아침 04~12시 · 오후 12~18시 · 저녁 18~21시 · 밤 21~04시 */
const SLOTS = ['아침', '오후', '저녁', '밤'] as const
type Slot = (typeof SLOTS)[number]

function getSlot(startTime: string | undefined): Slot | null {
  if (!startTime) return null
  if (startTime >= '04:00' && startTime < '12:00') return '아침'
  if (startTime >= '12:00' && startTime < '18:00') return '오후'
  if (startTime >= '18:00' && startTime < '21:00') return '저녁'
  return '밤'
}

/** 실패 원인 이름. 예: 'phone' -> '폰·SNS' */
function causeLabel(cause: CardFailCause): string {
  return CARD_FAIL_CAUSES.find((item) => item.key === cause)?.label ?? '기타'
}

/** 많이 나온 것부터 [이름, 횟수] */
function countTop(items: string[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

/**
 * 카드에 미리 적은 "예상 실패 원인" 글이 실제 원인과 같은 뜻인지 볼 때 쓰는 낱말입니다.
 * 예상 원인은 학생이 자유롭게 쓴 글이라 낱말로만 대충 맞춰 봅니다.
 */
const CAUSE_WORDS: Partial<Record<CardFailCause, string[]>> = {
  phone: ['폰', '휴대', 'SNS', '유튜브', '게임', '카톡', '인스타'],
  tired: ['피곤', '졸', '잠', '수면', '지쳐'],
  tooMuch: ['많', '과다', '벅차', '양이'],
  unwilling: ['싫', '귀찮', '의욕', '하기 싫'],
  procrastinated: ['미루', '나중에'],
  event: ['약속', '행사', '친구', '가족', '모임'],
  sick: ['아프', '아픔', '아파', '병'],
}

// ── 숫자 만들기 ──

/**
 * 기록을 숫자 묶음으로 바꿉니다. 기록이 모자란 숫자는 빼므로 처음엔 몇 줄 안 나올 수 있습니다.
 *
 *   (가상 사용자 28일) buildAnalysisFacts(input).facts
 *     -> [ { key: 'slotRate', group: 'tendency', label: '시간대별 실행률', value: '아침 95% · 저녁 80% · 밤 63%', basis: '카드 70번' },
 *          { key: 'conditionRate', group: 'tendency', label: '컨디션별 실행률', value: '컨디션 4~5인 날 92% · 1~2인 날 55%', … },
 *          … ]
 */
export function buildAnalysisFacts(input: AnalysisInput): AnalysisMaterial {
  const fromKey = moveDateKey(input.todayKey, -(ANALYSIS_DAYS - 1))
  const cardById = new Map(input.cards.map((card) => [card.id, card]))
  // 쉰 날(휴식)은 모든 집계에서 뺍니다. (「4.4」 휴식)
  const days = input.judgedDays.filter((day) => day.dateKey >= fromKey && day.result !== 'rest')
  const sessions = input.sessions.filter(
    (session) => session.kind !== 'play' && toDayKey(session.startedAt) >= fromKey,
  )
  const facts: AnalysisFact[] = []
  function add(fact: AnalysisFact | null) {
    if (fact) facts.push(fact)
  }

  // ■ 성향 — 언제 · 어떤 조건에서 잘 되나

  // 시간대별 실행률 (기록이 3번 넘는 시간대가 2개 이상일 때)
  const rateBySlot = new Map<Slot, number[]>()
  for (const day of days) {
    const slot = getSlot(cardById.get(day.cardId)?.startTime)
    if (slot) rateBySlot.set(slot, [...(rateBySlot.get(slot) ?? []), day.runRate])
  }
  const slotParts = SLOTS.filter((slot) => (rateBySlot.get(slot)?.length ?? 0) >= MIN_SAMPLES)
  if (slotParts.length >= 2) {
    add({
      key: 'slotRate',
      group: 'tendency',
      label: '시간대별 실행률',
      value: slotParts
        .map((slot) => `${slot} ${percent(average(rateBySlot.get(slot) ?? []) ?? 0)}`)
        .join(' · '),
      basis: `카드 ${slotParts.reduce((sum, slot) => sum + (rateBySlot.get(slot)?.length ?? 0), 0)}번`,
    })
  }

  // 요일별 실행률 — 가장 잘 된 요일과 가장 어려운 요일
  const rateByWeekday = new Map<number, number[]>()
  for (const day of days) {
    const weekday = getWeekday(day.dateKey)
    rateByWeekday.set(weekday, [...(rateByWeekday.get(weekday) ?? []), day.runRate])
  }
  const weekdayRates = [...rateByWeekday.entries()]
    .filter(([, rates]) => rates.length >= MIN_SAMPLES)
    .map(([weekday, rates]) => ({ weekday, rate: average(rates) ?? 0 }))
    .sort((a, b) => b.rate - a.rate)
  if (weekdayRates.length >= 3) {
    const best = weekdayRates[0]
    const worst = weekdayRates[weekdayRates.length - 1]
    add({
      key: 'weekdayRate',
      group: 'tendency',
      label: '요일별 실행률',
      value: `가장 잘 된 ${getWeekdayName(best.weekday)}요일 ${percent(best.rate)} · 가장 어려운 ${getWeekdayName(worst.weekday)}요일 ${percent(worst.rate)}`,
      basis: `카드 ${days.length}번`,
    })
  }

  // 학원처럼 늦게 끝나는 고정 일정이 있는 날의 저녁 · 밤 카드 (학교처럼 오후 5시 전에 끝나는 일정은 빼고 봅니다)
  const lateBlocks = input.fixedBlocks.filter((block) => block.endTime >= '17:00')
  const eveningWith: number[] = []
  const eveningWithout: number[] = []
  const blockTitles: string[] = []
  for (const day of days) {
    const slot = getSlot(cardById.get(day.cardId)?.startTime)
    if (slot !== '저녁' && slot !== '밤') continue
    const blocksToday = getFixedBlocksOnDate(lateBlocks, day.dateKey)
    if (blocksToday.length > 0) {
      eveningWith.push(day.runRate)
      blockTitles.push(blocksToday[0].title)
    } else {
      eveningWithout.push(day.runRate)
    }
  }
  if (eveningWith.length >= MIN_SAMPLES && eveningWithout.length >= MIN_SAMPLES) {
    const blockName = toSafeText(countTop(blockTitles)[0]?.[0] ?? '', 10) || '고정 일정'
    add({
      key: 'fixedBlockEvening',
      group: 'tendency',
      label: '저녁·밤 카드 실행률',
      value: `${blockName} 있는 날 ${percent(average(eveningWith) ?? 0)} · 없는 날 ${percent(average(eveningWithout) ?? 0)}`,
      basis: `카드 ${eveningWith.length + eveningWithout.length}번`,
    })
  }

  // 한 번에 이어서 한 시간 — 시작부터 첫 일시정지(없으면 끝)까지 (사후 입력은 잰 것이 아니라 뺍니다)
  const measured = sessions.filter((session) => session.mode !== 'selfReport')
  const focusRuns = measured.map((session) => {
    const firstPause = Math.min(...(session.pauses ?? []).map((pause) => pause.startedAt))
    const until = Number.isFinite(firstPause) ? firstPause : session.endedAt
    return Math.max(0, (until - session.startedAt) / MS_PER_MINUTE)
  })
  const focusAverage = average(focusRuns)
  if (focusAverage !== null && focusRuns.length >= MIN_SAMPLES) {
    add({
      key: 'focusRun',
      group: 'tendency',
      label: '한 번에 이어서 공부한 시간',
      value: `평균 ${formatMinutes(Math.round(focusAverage))}`,
      basis: `세션 ${focusRuns.length}번`,
    })
  }

  // 컨디션과 실행률 — 체크인 컨디션 4~5 인 날과 1~2 인 날
  const goodMood: number[] = []
  const lowMood: number[] = []
  for (const day of days) {
    const condition = input.checkIns[day.dateKey]?.condition
    if (condition === undefined) continue
    if (condition >= 4) goodMood.push(day.runRate)
    if (condition <= 2) lowMood.push(day.runRate)
  }
  if (goodMood.length >= MIN_SAMPLES && lowMood.length >= MIN_SAMPLES) {
    add({
      key: 'conditionRate',
      group: 'tendency',
      label: '컨디션별 실행률',
      value: `컨디션 4~5인 날 ${percent(average(goodMood) ?? 0)} · 1~2인 날 ${percent(average(lowMood) ?? 0)}`,
      basis: `카드 ${goodMood.length + lowMood.length}번`,
    })
  }

  // ■ 생각과 실제 — 내가 맞혀 본 예측과 실제 기록
  // (온보딩의 "내 가설" 4문항은 주관적인 짐작이라 2026-10-18 에 지웠습니다. 예측과 실제만 봅니다)

  // 주간 리포트에서 먼저 맞혀 본 값과 실제 값 (예측 후 공개, 「8.2」)
  const recentPredictions = input.predictions.filter((item) => item.weekStart >= fromKey)
  const percentPredictions = recentPredictions.filter(
    (item) => PREDICTION_OPTIONS[item.kind].unit === '%',
  )
  if (percentPredictions.length > 0) {
    const predicted = average(percentPredictions.map((item) => item.predicted)) ?? 0
    const actual = average(percentPredictions.map((item) => item.actual)) ?? 0
    add({
      key: 'predictionPercent',
      group: 'distortion',
      label: '주간 예측과 실제 (%)',
      value: `예측 평균 ${Math.round(predicted)}% → 실제 ${Math.round(actual)}%`,
      basis: `예측 ${percentPredictions.length}번`,
    })
  }
  const delayPredictions = recentPredictions.filter((item) => item.kind === 'startDelay')
  if (delayPredictions.length > 0) {
    const predicted = average(delayPredictions.map((item) => item.predicted)) ?? 0
    const actual = average(delayPredictions.map((item) => item.actual)) ?? 0
    add({
      key: 'predictionDelay',
      group: 'distortion',
      label: '시작 지연 예측과 실제',
      value: `예측 ${Math.round(predicted)}분 → 실제 ${Math.round(actual)}분`,
      basis: `예측 ${delayPredictions.length}번`,
    })
  }

  // 카드에 미리 적은 실패 원인이 실제 원인과 맞았는지
  let expectedTotal = 0
  let expectedHit = 0
  for (const day of days) {
    const expected = cardById.get(day.cardId)?.expectedFailCauses ?? []
    if (!day.missReason || expected.length === 0) continue
    expectedTotal++
    const words = CAUSE_WORDS[day.missReason] ?? []
    if (expected.some((text) => words.some((word) => text.includes(word)))) expectedHit++
  }
  if (expectedTotal >= MIN_SAMPLES) {
    add({
      key: 'expectedCauseHit',
      group: 'distortion',
      label: '미리 적은 실패 원인 적중',
      value: `못 한 ${expectedTotal}번 중 미리 적은 원인과 같은 것 ${expectedHit}번`,
      basis: `실패 원인을 고른 카드 ${expectedTotal}개`,
    })
  }

  // 잘 된 이유는 내 덕, 못 한 이유는 남 탓으로 보는지 (자기위주 편향, 「8.1」 1번)
  const goodSources = sessions.flatMap((session) =>
    (session.endReport?.goodReasons ?? []).map(
      (reason) => GOOD_REASONS.find((item) => item.key === reason)?.source,
    ),
  )
  const failCauses = days.flatMap((day) => (day.missReason ? [day.missReason] : []))
  const knownFailCauses = failCauses.filter((cause) => getCauseKind(cause) !== 'unknown')
  if (goodSources.length >= MIN_SAMPLES && knownFailCauses.length >= MIN_SAMPLES) {
    const goodInner = goodSources.filter((source) => source === 'internal').length
    const failInner = knownFailCauses.filter((cause) => getCauseKind(cause) === 'internal').length
    add({
      key: 'attribution',
      group: 'distortion',
      label: '잘 된 이유와 못 한 이유',
      value: `잘 된 이유 중 내 덕 ${percent(goodInner / goodSources.length)} · 못 한 이유 중 내 행동 ${percent(failInner / knownFailCauses.length)}`,
      basis: `잘 된 이유 ${goodSources.length}번 · 못 한 이유 ${knownFailCauses.length}번`,
    })
  }

  // ■ 약속 지키기 — 행동으로만 (의지력 점수는 보여 주지 않습니다)

  // 실행률 — 최근 2주와 그 전 2주
  const halfKey = moveDateKey(input.todayKey, -13)
  const recentRates = days.filter((day) => day.dateKey >= halfKey).map((day) => day.runRate)
  const earlierRates = days.filter((day) => day.dateKey < halfKey).map((day) => day.runRate)
  if (recentRates.length >= MIN_SAMPLES) {
    const recent = `최근 2주 ${percent(average(recentRates) ?? 0)}`
    add({
      key: 'runRate',
      group: 'willpower',
      label: '카드 실행률',
      value:
        earlierRates.length >= MIN_SAMPLES
          ? `${recent} · 그 전 2주 ${percent(average(earlierRates) ?? 0)}`
          : recent,
      basis: `카드 ${recentRates.length + earlierRates.length}번`,
    })
  }

  // 정시 시작 (예정 시각 + 10분 안에 시작)
  const startedDays = days.filter((day) => day.startedOnTime !== undefined)
  if (startedDays.length >= MIN_SAMPLES) {
    const onTime = startedDays.filter((day) => day.startedOnTime).length
    add({
      key: 'onTimeRate',
      group: 'willpower',
      label: '정시 시작 (10분 안)',
      value: `${percent(onTime / startedDays.length)}`,
      basis: `시작한 카드 ${startedDays.length}번`,
    })
  }

  // 미루기 · 못 함
  if (days.length >= MIN_SAMPLES) {
    const postponed = days.filter((day) => day.result === 'postponed').length
    const missed = days.filter(
      (day) => day.result === 'failed' || day.result === 'unhandled',
    ).length
    add({
      key: 'missCount',
      group: 'willpower',
      label: '미루기와 못 한 카드',
      value: `미룸 ${postponed}번 · 못 함 ${missed}번 (전체의 ${percent((postponed + missed) / days.length)})`,
      basis: `카드 ${days.length}번`,
    })
  }

  // 꼭 하기로 한(절대) 카드를 지켰는지
  const absoluteDays = days.filter((day) => day.priority === 'absolute')
  if (absoluteDays.length >= 2) {
    const kept = absoluteDays.filter((day) => !isMissResult(day.result)).length
    add({
      key: 'absoluteKept',
      group: 'willpower',
      label: '꼭 하기로 한 카드',
      value: `${absoluteDays.length}번 중 ${kept}번 지킴`,
      basis: `절대 카드 ${absoluteDays.length}번`,
    })
  }

  // ■ 공부 효율

  // 체크리스트 달성률과 '시간은 채웠는데 체크리스트가 남은 날' (계획 과대)
  const checklistDays = days.filter((day) => day.checklistRate !== undefined)
  if (checklistDays.length >= MIN_SAMPLES) {
    const overPlanned = checklistDays.filter(
      (day) => day.runRate >= 0.8 && (day.checklistRate ?? 0) < 1,
    ).length
    add({
      key: 'checklistRate',
      group: 'efficiency',
      label: '체크리스트 달성률',
      value: `평균 ${percent(average(checklistDays.map((day) => day.checklistRate ?? 0)) ?? 0)} · 시간은 채웠는데 남은 날 ${overPlanned}번`,
      basis: `카드 ${checklistDays.length}번`,
    })
  }

  // 시작 지연 — 그 카드 · 그날 처음 시작한 시각 − 예정 시각
  const firstStartByKey = new Map<string, number>()
  for (const session of measured) {
    const cardId = getSessionCardId(session, {})
    if (!cardId) continue
    const key = `${cardId}|${toDayKey(session.startedAt)}`
    firstStartByKey.set(key, Math.min(firstStartByKey.get(key) ?? Infinity, session.startedAt))
  }
  const delays: number[] = []
  for (const [key, startedAt] of firstStartByKey) {
    const [cardId, dateKey] = key.split('|')
    const startTime = cardById.get(cardId)?.startTime
    if (!startTime) continue
    const [hours, minutes] = startTime.split(':').map(Number)
    const [year, month, date] = dateKey.split('-').map(Number)
    // 새벽(04시 전) 카드는 그다음 날 달력 날짜에 시작합니다. (하루는 새벽 4시에 바뀝니다)
    const planned = new Date(year, month - 1, date + (hours < 4 ? 1 : 0), hours, minutes).getTime()
    delays.push(Math.max(0, (startedAt - planned) / MS_PER_MINUTE))
  }
  if (delays.length >= MIN_SAMPLES) {
    add({
      key: 'startDelay',
      group: 'efficiency',
      label: '시작 지연',
      value: `평균 ${Math.round(average(delays) ?? 0)}분`,
      basis: `시작한 카드 ${delays.length}번`,
    })
  }

  // 일시정지 — 세션당 횟수와 가장 많은 이유
  const pauses = measured.flatMap((session) => session.pauses ?? [])
  if (measured.length >= MIN_SAMPLES && pauses.length > 0) {
    const [topTag, topCount] = countTop(pauses.map((pause) => pause.tag))[0]
    const tagLabel = PAUSE_TAGS.find((item) => item.key === topTag)?.label ?? '기타'
    add({
      key: 'pauses',
      group: 'efficiency',
      label: '일시정지',
      value: `세션당 ${(pauses.length / measured.length).toFixed(1)}번 · 이유 1위 ${tagLabel} ${percent(topCount / pauses.length)}`,
      basis: `세션 ${measured.length}번`,
    })
  }

  // 강의 대 자습 (공부한 시간 기준)
  let lectureMs = 0
  let selfMs = 0
  for (const session of sessions) {
    const cardId = getSessionCardId(session, {})
    const type = cardId ? cardById.get(cardId)?.type : undefined
    if (type === 'lecture') lectureMs += getStudyMs(session)
    else selfMs += getStudyMs(session)
  }
  if (lectureMs > 0 && lectureMs + selfMs > 0) {
    const lectureShare = lectureMs / (lectureMs + selfMs)
    add({
      key: 'lectureRatio',
      group: 'efficiency',
      label: '인강 대 자습 시간',
      value: `인강 ${percent(lectureShare)} · 자습 ${percent(1 - lectureShare)}`,
      basis: `세션 ${sessions.length}번`,
    })
  }

  // 체크리스트를 다 못 한 이유 (종료 팝업)
  const shortfalls = sessions.flatMap((session) =>
    session.endReport?.shortfallReason ? [session.endReport.shortfallReason] : [],
  )
  if (shortfalls.length >= MIN_SAMPLES) {
    add({
      key: 'shortfallReasons',
      group: 'efficiency',
      label: '체크리스트를 다 못 한 이유',
      value: countTop(shortfalls)
        .slice(0, 2)
        .map(
          ([reason, count]) =>
            `${SHORTFALL_REASONS.find((item) => item.key === reason)?.label ?? '기타'} ${count}번`,
        )
        .join(' · '),
      basis: `${shortfalls.length}번`,
    })
  }

  // 하루 평균 공부 시간 (카드가 있던 날 기준)
  const activeDays = new Set(days.map((day) => day.dateKey)).size
  if (activeDays >= MIN_SAMPLES) {
    const totalMinutes =
      sessions.reduce((sum, session) => sum + getStudyMs(session), 0) / MS_PER_MINUTE
    add({
      key: 'studyPerDay',
      group: 'efficiency',
      label: '하루 평균 공부 시간',
      value: formatMinutes(Math.round(totalMinutes / activeDays)),
      basis: `카드가 있던 날 ${activeDays}일`,
    })
  }

  // ■ 실패 원인

  // 못 한 이유 순위 (실패로 기록하며 고른 원인)
  const failTop = countTop(failCauses) as [CardFailCause, number][]
  if (failCauses.length >= 2) {
    add({
      key: 'failCauses',
      group: 'failure',
      label: '못 한 이유 순위',
      value: failTop
        .slice(0, 3)
        .map(([cause, count]) => `${causeLabel(cause)} ${count}번`)
        .join(' · '),
      basis: `원인을 고른 카드 ${failCauses.length}개`,
    })
  }

  // 카드별 실행률 — 가장 어려운 카드와 가장 잘 되는 카드 (4번 넘게 한 카드만)
  const rateByCard = new Map<string, number[]>()
  for (const day of days)
    rateByCard.set(day.cardId, [...(rateByCard.get(day.cardId) ?? []), day.runRate])
  const cardRates = [...rateByCard.entries()]
    .filter(([, rates]) => rates.length >= 4)
    .map(([cardId, rates]) => ({
      title: toSafeText(cardById.get(cardId)?.title ?? '', 16) || '이름 없는 카드',
      rate: average(rates) ?? 0,
    }))
    .sort((a, b) => a.rate - b.rate)
  if (cardRates.length >= 2) {
    const worst = cardRates[0]
    const best = cardRates[cardRates.length - 1]
    add({
      key: 'cardRates',
      group: 'failure',
      label: '카드별 실행률',
      value: `가장 어려운 ${worst.title} ${percent(worst.rate)} · 가장 잘 되는 ${best.title} ${percent(best.rate)}`,
      basis: `카드 ${cardRates.length}종류`,
    })
  }

  // 가장 최근 자기 실험
  const latest = [...input.experiments].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  if (latest) {
    const rule = toSafeText(findStrategy(latest.strategyId)?.rule ?? '내 실험', 30)
    const rates =
      latest.baselineRate !== undefined && latest.experimentRate !== undefined
        ? ` · 실행률 ${percent(latest.baselineRate)} → ${percent(latest.experimentRate)}`
        : ''
    add({
      key: 'latestExperiment',
      group: 'failure',
      label: '지난 실험',
      value: `${rule} · ${EXPERIMENT_STATUS_LABELS[latest.status]}${rates}`,
      basis: '14일 실험',
    })
  }

  const evidenceDates = [...new Set(days.map((day) => day.dateKey))].sort().reverse().slice(0, 7)
  return { facts: facts.slice(0, MAX_FACTS), topFailCause: failTop[0]?.[0], evidenceDates }
}

// ── AI 가 못 쓸 때의 기본 문장 ──

/**
 * 숫자만으로 만든 기본 분석입니다. AI 가 꺼져 있거나(테스트 로그인 · 내 컴퓨터) 못 쓰면 이것이 보입니다.
 * 묶음마다 첫 숫자를 한 줄로, 나머지 숫자 두 개까지를 본문으로 늘어놓습니다.
 * 생각과 실제는 "예상과 다름" 인 가설을 먼저 보여 줍니다. (차이가 곧 발견이라서)
 *
 *   buildCodeAnalysis({ facts: [slotRate, …], topFailCause: 'phone' })
 *     -> { summary: '…', sections: [{ group: 'tendency', headline: '시간대별 실행률: 아침 95% · 밤 63%', … }], nextExperiment: { … } }
 */
export function buildCodeAnalysis(material: AnalysisMaterial): SelfAnalysis {
  const sections: AnalysisSection[] = []
  for (const { group } of ANALYSIS_GROUPS) {
    const groupFacts = material.facts
      .filter((fact) => fact.group === group)
      .sort(
        (a, b) => Number(b.basis.includes('예상과 다름')) - Number(a.basis.includes('예상과 다름')),
      )
    if (groupFacts.length === 0) continue
    const [first, ...rest] = groupFacts
    sections.push({
      group,
      headline: `${first.label}: ${first.value}`,
      body:
        rest.length > 0
          ? rest
              .slice(0, 2)
              .map((fact) => `${fact.label} ${fact.value}`)
              .join(' / ')
          : `${first.basis} 기록으로 계산했어요.`,
      evidenceKeys: groupFacts.slice(0, 3).map((fact) => fact.key),
    })
  }

  const mismatch = material.facts.find((fact) => fact.basis.includes('예상과 다름'))
  const failFact = material.facts.find((fact) => fact.key === 'failCauses')
  const summary = mismatch
    ? `내 생각과 기록이 다른 곳이 있어요 — ${mismatch.label.replace(/ 가설$/, '')}`
    : failFact
      ? `못 한 이유 1위: ${failFact.value.split(' · ')[0]}`
      : `최근 ${ANALYSIS_DAYS}일 기록을 숫자로 정리했어요.`

  // 기본 실험 제안: 가장 많은 실패 원인에 맞는 '보통' 단계 방법 (자기 실험 화면과 같은 카탈로그)
  const strategy = material.topFailCause ? getStrategiesFor(material.topFailCause)[1] : undefined
  const nextExperiment =
    strategy && material.topFailCause
      ? {
          ifText: '만약 카드를 시작하면',
          thenText: strategy.rule,
          why: `못 한 이유 1위가 ${causeLabel(material.topFailCause)}라서, ${strategy.why}`,
        }
      : null

  return { summary, sections, nextExperiment }
}
