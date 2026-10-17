import { getCardsOnDate } from '@/lib/cards'
import { getCareLimits } from '@/lib/careLimits'
import { loadLatestCareStage, saveCareStage } from '@/lib/careStage'
import { moveDateKey } from '@/lib/date'
import { getPlannedStartAt } from '@/lib/facts'
import { isSafetyBrakeOnNow } from '@/lib/focusMode'
import { loadData, removeData, saveData } from '@/lib/storage'
import type { Card } from '@/types'

/**
 * 관리 4단계 — 강제적 채찍을 앱 안에서 (최종 기획서 「5.4 관리 단계」 4단계, #408)
 *
 * OS 앱 잠금이 아직 없어서, 앱 안에서 할 수 있는 장치로 1차 구현합니다.
 *  ① 미루기 잠금 (CardTimerPage — #400)
 *  ② 다음 반복 카드 1장을 절대 카드로 자동 전환 (그 한 번만, 반복 자체는 그대로)
 *  ③ 산출물 증빙 강제 — 증빙이 없으면 실행으로 인정하지 않음 (cardResult.ts)
 *  ④ 카드 시작 전 다짐 녹음 자동 재생 (10초, 건너뛰기 불가)
 * 해제: 증빙이 있는 실행 1회 → 3단계로.
 * 제재 최대 한도가 4 미만이거나 안전 브레이크가 켜져 있으면 4단계 장치는 하나도 켜지지 않습니다.
 */

/** 시작 전 다짐 녹음을 듣는 시간 (초) */
export const PLEDGE_GATE_SECONDS = 10
/** 다음 반복 카드를 찾아볼 날 수 */
const LOOKAHEAD_DAYS = 7

/** 4단계에서 절대 카드로 바꾼 카드 한 번 (반복 카드의 그날 것) */
export interface Stage4Absolute {
  cardId: string
  dateKey: string
}

/**
 * 지금 4단계 장치를 켤지 — 가장 최근 판정이 4단계이고, 제재 한도가 4 이상이고, 안전 브레이크가 꺼져 있을 때
 * (한도를 낮추면 즉시 적용이라, 판정 뒤에 낮췄어도 여기서 다시 확인합니다)
 */
export function isStage4Now(dateKey: string): boolean {
  try {
    return (
      loadLatestCareStage(dateKey)?.stage === 4 &&
      getCareLimits().maxCareLevel >= 4 &&
      !isSafetyBrakeOnNow()
    )
  } catch {
    return false
  }
}

/**
 * 절대 카드로 바꿀 '다음 반복 카드 1장' 을 고릅니다. 지금 이후에 시작하는 가장 가까운 반복 카드의 그날 것입니다.
 * 이미 오늘 한 카드(doneTodayIds)와 이미 절대인 카드는 고르지 않습니다. 7일 안에 없으면 undefined.
 *
 *   (지금 10/17 18:00) 반복 A 19:00(매일), 반복 B 20:00(매일) -> { A, '2026-10-17' }
 *   (지금 10/17 21:00) 반복 A 19:00(매일)                    -> { A, '2026-10-18' }
 */
export function pickStage4Absolute(
  cards: Card[],
  todayKey: string,
  now: number,
  doneTodayIds: Set<string>,
): Stage4Absolute | undefined {
  for (let offset = 0; offset < LOOKAHEAD_DAYS; offset++) {
    const dateKey = moveDateKey(todayKey, offset)
    const candidate = getCardsOnDate(cards, dateKey).find((card) => {
      if (!card.repeatDays || card.repeatDays.length === 0 || card.priority === 'absolute')
        return false
      if (offset === 0 && doneTodayIds.has(card.id)) return false
      const startAt = getPlannedStartAt({ date: dateKey, startTime: card.startTime })
      return startAt !== null && startAt > now
    })
    if (candidate) return { cardId: candidate.id, dateKey }
  }
  return undefined
}

/** 그 카드 · 그 날짜가 4단계로 절대가 된 것인지 */
export function isStage4AbsoluteOn(
  target: Stage4Absolute | undefined,
  cardId: string,
  dateKey: string,
): boolean {
  return target !== undefined && target.cardId === cardId && target.dateKey === dateKey
}

// 4단계에서 고른 절대 카드를 넣어 두는 곳 (실제 키는 'study-stage4-absolute'). 고른 뒤에 바뀌지 않게 저장합니다.
const ABSOLUTE_KEY = 'stage4-absolute'

export function loadStage4Absolute(): Stage4Absolute | undefined {
  const saved = loadData<Partial<Stage4Absolute> | null>(ABSOLUTE_KEY, null)
  return typeof saved?.cardId === 'string' && typeof saved.dateKey === 'string'
    ? { cardId: saved.cardId, dateKey: saved.dateKey }
    : undefined
}

export function saveStage4Absolute(target: Stage4Absolute): void {
  saveData(ABSOLUTE_KEY, target)
}

/**
 * 증빙이 있는 실행을 한 번 하면 4단계를 풀고 3단계로 내립니다. 고른 절대 카드도 원래대로 돌아갑니다.
 */
export function releaseStage4(dateKey: string): void {
  saveCareStage(dateKey, {
    stage: 3,
    rule: 'release',
    reason: '증빙이 있는 실행을 한 번 해서 4단계를 풀고 3단계로 내려왔어.',
  })
  removeData(ABSOLUTE_KEY)
}
