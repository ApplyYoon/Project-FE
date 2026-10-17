/**
 * '내 가설' — 온보딩 자기 인식 4문항의 답입니다. (기획서 4.1 4번, #388)
 *
 * 스스로 생각하는 나(아침형인지, 얼마나 집중하는지 …)를 적어 두고,
 * 2주 동안 쌓인 기록으로 맞는지 확인하거나 반박합니다. (#411 "내 가설 확인")
 * '잘 모르겠음' 을 고른 칸은 null 입니다. 그 칸은 기록으로 처음부터 알려 줍니다.
 *
 *   온보딩 답 { chronotype: 'night', maxFocusMinutes: '50', biggestDistraction: '폰·SNS', dailyAvailableMinutes: 'unknown' }
 *   -> { chronotype: 'night', maxFocusMinutes: 50, biggestDistraction: '폰·SNS', dailyAvailableMinutes: null, savedAt: … }
 */
import { UNKNOWN_ANSWER } from '@/lib/onboardingSteps'
import { loadData, saveData } from '@/lib/storage'
import type { Chronotype } from '@/types'

// 저장 이름. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여 'study-my-hypotheses' 가 됩니다)
const STORAGE_KEY = 'my-hypotheses'

/** 내 가설 4개. null = '잘 모르겠음' */
export interface MyHypotheses {
  /** 아침형 / 밤형 */
  chronotype: Chronotype | null
  /** 한 번에 집중할 수 있다고 생각하는 시간(분) */
  maxFocusMinutes: number | null
  /** 가장 큰 방해 요소 (보기의 글자 그대로. 예: '폰·SNS') */
  biggestDistraction: string | null
  /** 평일 하루에 공부할 수 있다고 생각하는 시간(분) */
  dailyAvailableMinutes: number | null
  /** 저장한 때 (Date.now() 숫자). 3일째·7일째 첫 확인을 셀 때 씁니다. */
  savedAt: number
}

/** 답 글자 하나를 분(숫자)으로. '잘 모르겠음'·빈 글자·숫자가 아닌 글자는 null */
function toMinutes(answer: string | undefined): number | null {
  if (answer === undefined || answer === UNKNOWN_ANSWER) return null
  const minutes = Number(answer)
  return Number.isInteger(minutes) && minutes > 0 ? minutes : null
}

/** 온보딩 답(질문 이름 → 글자)을 내 가설 모양으로 바꿉니다. 모르는 값은 null 로 둡니다. */
export function toMyHypotheses(answers: Record<string, string>, now: number): MyHypotheses {
  const chronotype = answers.chronotype
  const distraction = answers.biggestDistraction
  return {
    chronotype: chronotype === 'morning' || chronotype === 'night' ? chronotype : null,
    maxFocusMinutes: toMinutes(answers.maxFocusMinutes),
    biggestDistraction:
      distraction === undefined || distraction === '' || distraction === UNKNOWN_ANSWER
        ? null
        : distraction,
    dailyAvailableMinutes: toMinutes(answers.dailyAvailableMinutes),
    savedAt: now,
  }
}

/** 내 가설을 저장합니다. 온보딩 자기 인식 4문항을 끝낼 때 부릅니다. */
export function saveMyHypotheses(hypotheses: MyHypotheses): void {
  saveData(STORAGE_KEY, hypotheses)
}

/** 저장해 둔 내 가설. 아직 안 했거나 저장된 값이 깨졌으면 undefined */
export function loadMyHypotheses(): MyHypotheses | undefined {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return undefined
  const record = saved as Record<string, unknown>
  if (typeof record.savedAt !== 'number') return undefined
  const isNumberOrNull = (value: unknown) => value === null || typeof value === 'number'
  if (!isNumberOrNull(record.maxFocusMinutes) || !isNumberOrNull(record.dailyAvailableMinutes)) {
    return undefined
  }
  return {
    chronotype:
      record.chronotype === 'morning' || record.chronotype === 'night' ? record.chronotype : null,
    maxFocusMinutes: record.maxFocusMinutes as number | null,
    biggestDistraction:
      typeof record.biggestDistraction === 'string' ? record.biggestDistraction : null,
    dailyAvailableMinutes: record.dailyAvailableMinutes as number | null,
    savedAt: record.savedAt,
  }
}
