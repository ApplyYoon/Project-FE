/**
 * 공부 중에 나간 기록(딴짓)과 집중 모드 해제 기록을 기간으로 묶어 세는 함수입니다. (주간 리포트의 "집중 기록" 카드)
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 웹 앱은 다른 앱을 잠글 수 없습니다. 대신 "언제, 얼마나 나갔는지" 를 보여 주는 것이 할 수 있는 일입니다.
 * 벌을 주려는 숫자가 아니라, 어느 시간대에 약한지 스스로 알아보는 재료입니다.
 */
import { toDayKey } from '@/lib/date'
import type { FocusUnlockRecord } from '@/lib/focusMode'
import type { AwayRecord } from '@/types'

/** 한 시간대에 나간 횟수. 예) { hour: 21, count: 3 } = 밤 9시대에 3번 */
export interface AwayHour {
  /** 0 ~ 23 */
  hour: number
  count: number
}

/** 기간 하나의 집중 기록 요약입니다. */
export interface AwaySummary {
  /** 공부 중에 나갔다 온 횟수 */
  awayCount: number
  /** 나가 있던 시간을 모두 더한 것 (분, 반올림) */
  awayMinutes: number
  /** 가장 자주 나간 시간대. 나간 적이 없으면 null */
  peakHour: AwayHour | null
  /** 집중 모드를 내가 직접 푼 횟수 (설정·안전 브레이크 때문에 저절로 풀린 것은 세지 않습니다) */
  unlockCount: number
  /** 내가 직접 푼 기록 중 최근 것부터 최대 3개. 화면에 이유를 보여줄 때 씁니다. */
  recentUnlocks: FocusUnlockRecord[]
}

// "최근 해제" 로 보여주는 개수
const RECENT_UNLOCK_COUNT = 3

/** 'YYYY-MM-DD' 가 startKey ~ endKey 안인지 확인합니다. 이 모양의 날짜는 글자로 비교해도 날짜 순서와 같습니다. */
function isInRange(dateKey: string, startKey: string, endKey: string): boolean {
  return dateKey >= startKey && dateKey <= endKey
}

/**
 * startKey ~ endKey (둘 다 포함) 기간의 집중 기록을 요약합니다.
 *
 * ■ 규칙
 *  1. 딴짓은 "나간 날짜"(AwayRecord.date, 하루의 기준은 새벽 4시)로 기간에 넣습니다.
 *  2. 해제는 "푼 시각" 의 날짜로 기간에 넣고, 내가 직접 푼 것만 셉니다. (isAuto 가 true 면 뺍니다)
 *  3. 가장 자주 나간 시간대는 나간 시각의 "시" 로 셉니다. 횟수가 같으면 더 이른 시간대를 고릅니다.
 *
 * ■ 예시 — 10/05(월) ~ 10/11(일)
 *   딴짓: 10/06 21:10 에 3분, 10/06 21:40 에 2분, 10/08 19:05 에 10분, (10/12 것은 기간 밖)
 *   해제: 10/06 21:45 직접 풂("급한 연락"), 10/09 자동으로 풀림
 *   -> { awayCount: 3, awayMinutes: 15, peakHour: { hour: 21, count: 2 }, unlockCount: 1, recentUnlocks: [10/06 것] }
 *
 *   기록이 하나도 없음 -> { awayCount: 0, awayMinutes: 0, peakHour: null, unlockCount: 0, recentUnlocks: [] }
 */
export function getAwaySummary(
  awayRecords: AwayRecord[],
  unlockRecords: FocusUnlockRecord[],
  startKey: string,
  endKey: string,
): AwaySummary {
  const aways = awayRecords.filter((record) => isInRange(record.date, startKey, endKey))

  let awayMs = 0
  // 시간대(0~23)마다 나간 횟수를 셉니다.
  const countByHour = new Map<number, number>()
  for (const record of aways) {
    awayMs += record.awayMs
    const hour = new Date(record.leftAt).getHours()
    countByHour.set(hour, (countByHour.get(hour) ?? 0) + 1)
  }

  // 횟수가 가장 많은 시간대를 찾습니다. 같으면 더 이른 시간대를 남깁니다.
  let peakHour: AwayHour | null = null
  for (const [hour, count] of countByHour) {
    const isMore = peakHour === null || count > peakHour.count
    const isSameButEarlier = peakHour !== null && count === peakHour.count && hour < peakHour.hour
    if (isMore || isSameButEarlier) peakHour = { hour, count }
  }

  const unlocks = unlockRecords
    .filter((record) => !record.isAuto && isInRange(toDayKey(record.unlockedAt), startKey, endKey))
    // 최근에 푼 것이 앞에 오게 합니다. (sort 는 원래 배열을 바꾸지만, filter 가 새 배열을 만들어 줘서 괜찮습니다)
    .sort((a, b) => b.unlockedAt - a.unlockedAt)

  return {
    awayCount: aways.length,
    awayMinutes: Math.round(awayMs / 60_000),
    peakHour,
    unlockCount: unlocks.length,
    recentUnlocks: unlocks.slice(0, RECENT_UNLOCK_COUNT),
  }
}
