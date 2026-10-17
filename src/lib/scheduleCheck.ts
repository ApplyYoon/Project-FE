import { isCardOnDate } from '@/lib/cards'
import { moveDateKey } from '@/lib/date'
import { getFixedBlocksOnDate } from '@/lib/fixedBlocks'
import { toDayMinutes } from '@/lib/planConflict'
import { getWeekday, getWeekdayName } from '@/lib/routines'
import { formatMinutes, toMinutes } from '@/lib/timeline'
import type { Card, FixedBlock } from '@/types'

/**
 * 카드를 저장하기 전에 "수면 보호 시간" 과 "10분 버퍼" 를 검사하는 순수 함수들입니다. (「4.3 카드」 규칙, #393)
 * React · 저장소 · 인터넷을 쓰지 않아서 같은 입력이면 항상 같은 결과가 나옵니다.
 * BE(Project-BE#223)도 같은 규칙 · 같은 예시로 검사합니다. 규칙을 바꾸면 BE 에도 알려 주세요.
 *
 * ■ 수면 보호: 겹치면 저장할 수 없습니다. (막음)
 * ■ 10분 버퍼: 앞뒤 카드 · 고정 일정과 10분 넘게 떨어져 있지 않으면 경고만 합니다. (막지 않음)
 */

/** 수면 보호 시간은 최소 6시간입니다. 취침~기상이 이보다 짧으면 6시간으로 늘려서 지킵니다 */
export const SLEEP_PROTECT_MIN_MINUTES = 6 * 60
/** 카드 사이에 권하는 여유 시간(분) */
export const BUFFER_MINUTES = 10
/** 취침·기상 시각을 아직 안 알려 줬을 때 쓰는 값. 00:00 · 06:00 (자정부터 몇 분째, 최소 6시간만 지킵니다) */
export const DEFAULT_SLEEP_MINUTES = 0
export const DEFAULT_WAKE_MINUTES = 6 * 60

const DAY_MINUTES = 24 * 60

/** 수면 보호 시간 (자정 기준 분) */
export interface SleepWindow {
  /** 잠드는 시각 (자정부터 몇 분째) */
  start: number
  /** 지키는 길이(분). 최소 360 */
  minutes: number
  /** 화면에 보여 줄 글자 (예: '00:30~06:30') */
  label: string
}

/**
 * 취침 · 기상 시각으로 수면 보호 시간을 만듭니다. 6시간보다 짧으면 기상 시각을 뒤로 밀어 6시간을 채웁니다.
 * 시각이 비었거나 모양이 틀리면 기본값(00:00 · 06:00)을 씁니다.
 *
 *   getSleepWindow('23:00', '07:00') -> { start: 1380, minutes: 480, label: '23:00~07:00' }
 *   getSleepWindow('01:00', '05:00') -> { start: 60,   minutes: 360, label: '01:00~07:00' }  (4시간 → 6시간)
 *   getSleepWindow(undefined, undefined) -> { start: 0, minutes: 360, label: '00:00~06:00' }
 */
export function getSleepWindow(
  sleepTime: string | undefined,
  wakeUpTime: string | undefined,
): SleepWindow {
  const start = toMinutes(sleepTime) ?? DEFAULT_SLEEP_MINUTES
  const wake = toMinutes(wakeUpTime) ?? DEFAULT_WAKE_MINUTES
  // 자정을 넘어가도 되도록 하루(1440분)를 더하고 나머지를 구합니다. 23:00 → 07:00 = 480분
  const length = (wake - start + DAY_MINUTES) % DAY_MINUTES
  const minutes = Math.max(length, SLEEP_PROTECT_MIN_MINUTES)
  const label = `${formatMinutes(start)}~${formatMinutes((start + minutes) % DAY_MINUTES)}`
  return { start, minutes, label }
}

/**
 * 카드 시간(시작 + 길이)이 수면 보호 시간과 겹치는지 봅니다. 시작 시각이 없으면 false 입니다.
 * 끝 = 잠드는 시각, 시작 = 일어나는 시각처럼 딱 붙은 것은 겹치지 않습니다.
 *
 *   수면 보호 23:00~07:00 일 때
 *   isOverlappingSleep('22:00', 60, window)  -> false  (22:00~23:00, 딱 붙음)
 *   isOverlappingSleep('22:30', 60, window)  -> true   (23:00~23:30 이 겹침)
 *   isOverlappingSleep('06:30', 60, window)  -> true   (06:30~07:00 이 겹침)
 *   isOverlappingSleep('07:00', 60, window)  -> false
 *   isOverlappingSleep('02:00', 30, window)  -> true   (한밤중)
 */
export function isOverlappingSleep(
  startTime: string | undefined,
  durationMinutes: number,
  window: SleepWindow,
): boolean {
  const start = toMinutes(startTime)
  if (start === null || !(durationMinutes > 0)) return false
  const end = start + durationMinutes

  // 수면 시간은 매일 반복되므로 어제 · 오늘 · 내일 밤 세 번을 모두 비교합니다.
  // (예: 23:00 잠 → 어제 밤은 -60~420분, 오늘 밤은 1380~1860분)
  for (const dayShift of [-DAY_MINUTES, 0, DAY_MINUTES]) {
    const sleepStart = window.start + dayShift
    const sleepEnd = sleepStart + window.minutes
    if (start < sleepEnd && sleepStart < end) return true
  }
  return false
}

/** 그날 이미 시간을 차지한 것 하나 (카드 또는 고정 일정, 하루 시작 새벽 4시 기준 분) */
export interface ScheduleSlot {
  title: string
  start: number
  end: number
  isFixed: boolean
}

/**
 * 그 날짜의 다른 카드 · 고정 일정을 "차지한 시간" 목록으로 바꿉니다.
 * 시작 시각이 없는 카드와 고치는 중인 카드 자신(ignoreCardId)은 뺍니다.
 */
export function getScheduleSlots(
  cards: Card[],
  blocks: FixedBlock[],
  dateKey: string,
  ignoreCardId?: string,
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = []
  for (const card of cards) {
    if (card.id === ignoreCardId || !isCardOnDate(card, dateKey)) continue
    const start = toDayMinutes(card.startTime)
    if (start === null) continue
    slots.push({ title: card.title, start, end: start + card.durationMinutes, isFixed: false })
  }
  for (const block of getFixedBlocksOnDate(blocks, dateKey)) {
    const start = toDayMinutes(block.startTime)
    const end = toDayMinutes(block.endTime)
    if (start === null || end === null) continue
    slots.push({ title: block.title, start, end, isFixed: true })
  }
  return slots
}

/** 여유가 모자란 상대와 그 사이 시간 */
export interface BufferShortage {
  slot: ScheduleSlot
  /** 떨어진 시간(분). 0 이면 딱 붙음, 음수면 겹침 */
  gapMinutes: number
}

/**
 * 카드 시간의 앞뒤로 10분(BUFFER_MINUTES) 여유가 없는 일정 중 가장 가까운 것을 찾습니다. 다 넉넉하면 null 입니다.
 * 떨어진 시간 = (상대 시작 − 카드 끝) 과 (카드 시작 − 상대 끝) 중 큰 값. 두 일정이 겹치면 음수가 됩니다.
 *
 *   다른 일정: 학원 18:00~21:00
 *   findBufferShortage('21:05', 60, slots) -> { slot: 학원, gapMinutes: 5 }    (뒤에 5분뿐)
 *   findBufferShortage('16:50', 60, slots) -> null                             (17:50 끝, 딱 10분 여유)
 *   findBufferShortage('17:30', 30, slots) -> { slot: 학원, gapMinutes: 0 }    (딱 붙음)
 *   findBufferShortage('20:00', 60, slots) -> { slot: 학원, gapMinutes: -60 }  (겹침)
 *   findBufferShortage('',      60, slots) -> null                             (시간 미정)
 */
export function findBufferShortage(
  startTime: string,
  durationMinutes: number,
  slots: ScheduleSlot[],
): BufferShortage | null {
  const start = toDayMinutes(startTime)
  if (start === null || !(durationMinutes > 0)) return null
  const end = start + durationMinutes

  let closest: BufferShortage | null = null
  for (const slot of slots) {
    const gapMinutes = Math.max(slot.start - end, start - slot.end)
    if (gapMinutes >= BUFFER_MINUTES) continue
    if (closest === null || gapMinutes < closest.gapMinutes) closest = { slot, gapMinutes }
  }
  return closest
}

interface BufferWarningInput {
  /** 1회성이면 그 날짜, 반복이면 반복을 시작할 날짜 */
  date: string
  /** 반복 요일. 비어 있으면 1회성 */
  repeatDays: number[]
  startTime: string
  durationMinutes: number
  cards: Card[]
  blocks: FixedBlock[]
  /** 고치는 중인 카드 id (자기 자신과는 비교하지 않음) */
  ignoreCardId?: string
}

/**
 * 카드 폼에 보여 줄 버퍼 경고 문구를 만듭니다. 여유가 넉넉하면 null 입니다. (경고만, 저장은 막지 않음)
 * 반복 카드는 시작 날짜부터 일주일 안에서 그 요일들을 하나씩 봅니다.
 *
 *   1회성, 학원(18:00~21:00) 뒤 21:05 시작  -> "학원 18:00~21:00 과 사이가 5분뿐이에요. 10분 여유를 두면 좋아요."
 *   반복(화), 화요일 학원과 겹침             -> "(화) 학원 18:00~21:00 과 시간이 겹쳐요. 10분 여유를 두면 좋아요."
 */
export function getBufferWarning(input: BufferWarningInput): string | null {
  const isRepeat = input.repeatDays.length > 0
  const dateKeys = isRepeat
    ? Array.from({ length: 7 }, (_, index) => moveDateKey(input.date, index)).filter((dateKey) =>
        input.repeatDays.includes(getWeekday(dateKey)),
      )
    : [input.date]

  for (const dateKey of dateKeys) {
    const slots = getScheduleSlots(input.cards, input.blocks, dateKey, input.ignoreCardId)
    const shortage = findBufferShortage(input.startTime, input.durationMinutes, slots)
    if (!shortage) continue

    const prefix = isRepeat ? `(${getWeekdayName(getWeekday(dateKey))}) ` : ''
    const { slot, gapMinutes } = shortage
    // 새벽 4시 기준 분이라 1440 을 넘을 수 있어서, 하루로 나눈 나머지로 시각을 씁니다.
    const range = `${formatMinutes(slot.start % DAY_MINUTES)}~${formatMinutes(slot.end % DAY_MINUTES)}`
    const situation =
      gapMinutes < 0
        ? `${slot.title} ${range} 과 시간이 겹쳐요.`
        : gapMinutes === 0
          ? `${slot.title} ${range} 과 딱 붙어 있어요.`
          : `${slot.title} ${range} 과 사이가 ${gapMinutes}분뿐이에요.`
    return `${prefix}${situation} ${BUFFER_MINUTES}분 여유를 두면 좋아요.`
  }
  return null
}
