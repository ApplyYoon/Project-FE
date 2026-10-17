import { getPlannedStartAt } from '@/lib/facts'
import type { Card, SessionEndReport, StudySession } from '@/types'

/**
 * 사후 입력 (최종 기획서 「4.4 타이머」 사후 입력, #402)
 *
 * 오프라인 세션(폰을 낸 세션)을 켜지 못했을 때를 위한 기능입니다.
 * - **미리 만들어 둔 카드에만**, 그날 **다음 통화 전까지**, **카드 예정 시간 이하**로만 입력할 수 있습니다.
 * - 없던 세션을 새로 만들 수는 없습니다 (그 카드 · 그날 기록이 없을 때만).
 * - 증빙이 있으면 일반 실행과 똑같이, 없으면 '자기 보고' 로 표시하고 의지력에서 실행률 0.5 로 셉니다 (cardResult.ts).
 * 같은 규칙이 BE(Project-BE#225)에도 있습니다.
 */

const MS_PER_MINUTE = 60 * 1000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE

/**
 * 사후 입력을 받을 수 있는 마지막 시각 = 카드가 끝난 뒤 처음 오는 통화 시각.
 * 통화 시각을 안 정했으면 그 카드 날짜가 끝나는 때(다음 날 새벽 4시)입니다.
 *
 *   카드 19:00 ~ 20:00, 통화 22:00   -> 그날 22:00
 *   카드 19:00 ~ 20:00, 통화 07:30   -> 다음 날 07:30
 *   통화 시각 없음                    -> 다음 날 04:00
 */
export function getLateEntryDeadline(
  cardEndAt: number,
  dateKey: string,
  callTimeMinutes: number | null,
): number {
  if (callTimeMinutes === null) {
    const dayStart = getPlannedStartAt({ date: dateKey, startTime: '04:00' }) ?? cardEndAt
    return dayStart + MS_PER_DAY
  }
  const end = new Date(cardEndAt)
  const sameDayCall =
    new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() +
    callTimeMinutes * MS_PER_MINUTE
  return sameDayCall > cardEndAt ? sameDayCall : sameDayCall + MS_PER_DAY
}

export interface LateEntryInput {
  card: Pick<Card, 'startTime' | 'durationMinutes' | 'createdAt'>
  dateKey: string
  now: number
  /** 통화 시각 (자정부터 몇 분째, callReminder.ts 의 parseCallTime). 안 정했으면 null */
  callTimeMinutes: number | null
  /** 그 카드 · 그날 이미 세션 기록이 있는지 */
  hasSession: boolean
  /** 그 카드 · 그날 미루기 · 실패로 처리했는지 */
  isHandled: boolean
}

/**
 * 지금 사후 입력을 받을 수 있는지와, 안 되면 그 이유를 돌려줍니다.
 *
 *   카드 19:00 · 60분, 지금 20:30, 통화 22:00, 기록 없음     -> { ok: true, maxMinutes: 60 }
 *   지금 19:20 (아직 카드 시간 중)                          -> { ok: true, maxMinutes: 20 }  (지난 시간만큼만)
 *   지금 22:10 (통화가 지남)                                -> { ok: false, reason: '다음 통화가 지나서 …' }
 *   카드를 19:30 에 만듦 (카드 시간이 지난 뒤)              -> { ok: false, reason: '미리 만든 카드에만 …' }
 */
export function checkLateEntry(
  input: LateEntryInput,
): { ok: true; maxMinutes: number } | { ok: false; reason: string } {
  const startAt = getPlannedStartAt({ date: input.dateKey, startTime: input.card.startTime })
  if (startAt === null)
    return { ok: false, reason: '시작 시각이 없는 카드는 나중에 적을 수 없어요.' }
  if (input.hasSession) return { ok: false, reason: '이 카드는 오늘 이미 기록이 있어요.' }
  if (input.isHandled) return { ok: false, reason: '이미 미루거나 못 했다고 남긴 카드예요.' }
  if (input.card.createdAt > startAt)
    return { ok: false, reason: '미리 만든 카드에만 나중에 적을 수 있어요.' }
  if (input.now < startAt) return { ok: false, reason: '카드 시간이 아직 안 됐어요.' }
  const endAt = startAt + input.card.durationMinutes * MS_PER_MINUTE
  if (input.now >= getLateEntryDeadline(endAt, input.dateKey, input.callTimeMinutes)) {
    return { ok: false, reason: '다음 통화가 지나서 이제는 적을 수 없어요.' }
  }
  // 아직 카드 시간 중이면 지난 시간만큼만 적을 수 있습니다. (앞으로 할 시간을 미리 적을 수는 없음)
  const passedMinutes = Math.floor((Math.min(input.now, endAt) - startAt) / MS_PER_MINUTE)
  return { ok: true, maxMinutes: Math.min(input.card.durationMinutes, passedMinutes) }
}

/**
 * 사후 입력으로 저장할 세션 기록을 만듭니다. 카드 예정 시각부터 적은 분만큼입니다.
 * 증빙이 있으면 그대로 붙이고, 없으면 자기 보고(cardResult.ts 가 실행률 0.5 로 셈)입니다.
 */
export function buildLateEntrySession(
  card: Pick<Card, 'id' | 'startTime' | 'durationMinutes'>,
  dateKey: string,
  minutes: number,
  endReport: SessionEndReport,
  id: string,
): StudySession | null {
  const startAt = getPlannedStartAt({ date: dateKey, startTime: card.startTime })
  if (startAt === null || minutes <= 0) return null
  const safeMinutes = Math.min(minutes, card.durationMinutes)
  return {
    id,
    subjectId: '',
    startedAt: startAt,
    endedAt: startAt + safeMinutes * MS_PER_MINUTE,
    pauseCount: 0,
    pausedMs: 0,
    targetMinutes: card.durationMinutes,
    kind: 'study',
    cardId: card.id,
    mode: 'selfReport',
    endReport,
  }
}

/**
 * 사후 입력 창에서 받은 것으로 종료 결과(endReport)를 만듭니다.
 * 체크한 시각은 알 수 없어서 적는 지금 시각으로 남기고, 증빙은 http 로 시작하면 링크, 아니면 요약입니다.
 */
export function makeLateEntryReport(checkedIds: string[], proofText: string): SessionEndReport {
  const now = Date.now()
  const text = proofText.trim()
  const isLink = /^https?:\/\//.test(text)
  return {
    checked: Object.fromEntries(checkedIds.map((id) => [id, now])),
    ...(text === '' ? {} : { proof: isLink ? { link: text } : { summary: text } }),
  }
}
