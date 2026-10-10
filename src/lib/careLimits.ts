import { loadData, saveData } from './storage'
import type { CareLevel } from '@/lib/careLevel'

/**
 * 사용자가 정한, AI 가 절대 넘으면 안 되는 한도입니다.
 * #28(관리 강도 정하기) · #32(말투·색) · #69(집중 모드) 같은 기능은
 * getCareLimits() 로 "지금 적용되는 한도"만 읽으면 됩니다.
 */
export interface CareLimits {
  /** 허용하는 관리 강도의 최댓값 (0~4) */
  maxCareLevel: CareLevel
  /** 허용하는 독설 수위 (1~5) */
  maxHarshness: number
  /** 정해진 시간 외 독촉 전화를 허용하는지 (허용해도 하루 1회까지) */
  allowOffHoursCall: boolean
  /** 집중 모드(#69) 잠금을 허용하는지 */
  allowFocusMode: boolean
  /** 한도를 올렸는데 아직 적용 전이면 바뀔 값. 없으면 null */
  pendingMaxCareLevel: CareLevel | null
  /** pendingMaxCareLevel 이 적용되는 날짜 ('YYYY-MM-DD'). 없으면 null */
  pendingEffectiveDate: string | null
}

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-care-limits' 가 됩니다)
const STORAGE_KEY = 'care-limits'

// 아직 한 번도 설정하지 않았으면, AI 가 가장 조심스럽게 대하도록 낮은 한도로 시작합니다.
// (더 세게 하고 싶으면 사용자가 직접 올리는 쪽이 안전합니다)
const defaultLimits: CareLimits = {
  maxCareLevel: 2,
  maxHarshness: 3,
  allowOffHoursCall: false,
  allowFocusMode: false,
  pendingMaxCareLevel: null,
  pendingEffectiveDate: null,
}

/** 오늘 날짜를 'YYYY-MM-DD' 문자열로 돌려줍니다. */
function todayKey(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 지금 적용되는 한도를 돌려줍니다.
 * 예약해 둔 한도 상향의 적용 날짜가 지났으면, 지금 적용하고 저장한 뒤 돌려줍니다.
 * (지금은 한도를 올려도 바로 적용돼서 새로 예약되는 일은 없습니다. 예전에 저장된 예약을 위한 코드입니다)
 */
export function getCareLimits(): CareLimits {
  const saved = loadData(STORAGE_KEY, defaultLimits)

  const canApplyPending =
    saved.pendingMaxCareLevel !== null &&
    saved.pendingEffectiveDate !== null &&
    saved.pendingEffectiveDate <= todayKey()

  if (!canApplyPending) return saved

  const applied: CareLimits = {
    ...saved,
    maxCareLevel: saved.pendingMaxCareLevel as CareLevel,
    pendingMaxCareLevel: null,
    pendingEffectiveDate: null,
  }
  saveData(STORAGE_KEY, applied)
  return applied
}

/**
 * 관리 강도 최대 한도를 바꿉니다. 높이든 낮추든 바로 적용됩니다.
 * 예전에 예약해 둔 한도 상향이 남아 있으면 같이 지웁니다. (새로 고른 값이 우선)
 * 4단계로 올릴 때 "정말 올릴까요?" 하고 한 번 더 묻는 건 설정 화면(SettingsPage)이 합니다.
 */
export function setMaxCareLevel(nextLevel: CareLevel): CareLimits {
  const next: CareLimits = {
    ...getCareLimits(),
    maxCareLevel: nextLevel,
    pendingMaxCareLevel: null,
    pendingEffectiveDate: null,
  }
  saveData(STORAGE_KEY, next)
  return next
}

/** 온보딩에서 한도를 처음 정할 때 씁니다. 관리 강도와 독설 수위를 한 번에 바로 적용합니다. */
export function setInitialCareLimits(maxCareLevel: CareLevel, maxHarshness: number): CareLimits {
  const next: CareLimits = {
    ...getCareLimits(),
    maxCareLevel,
    maxHarshness,
    pendingMaxCareLevel: null,
    pendingEffectiveDate: null,
  }
  saveData(STORAGE_KEY, next)
  return next
}

/** 독설 허용 수위(1~5)를 바꿉니다. 바로 적용됩니다. */
export function setMaxHarshness(value: number): CareLimits {
  const next: CareLimits = { ...getCareLimits(), maxHarshness: value }
  saveData(STORAGE_KEY, next)
  return next
}

/** 정해진 시간 외 독촉 전화 허용 여부를 바꿉니다. 바로 적용됩니다. */
export function setAllowOffHoursCall(allow: boolean): CareLimits {
  const next: CareLimits = { ...getCareLimits(), allowOffHoursCall: allow }
  saveData(STORAGE_KEY, next)
  return next
}

/** 집중 모드 잠금 허용 여부를 바꿉니다. 바로 적용됩니다. */
export function setAllowFocusMode(allow: boolean): CareLimits {
  const next: CareLimits = { ...getCareLimits(), allowFocusMode: allow }
  saveData(STORAGE_KEY, next)
  return next
}
