/**
 * AI 가 바꾼 설정 기록을 홈에 보여 주고 지우는 함수입니다. (「4.2 홈」: "AI 가 설정을 바꿨으면 알림 줄 + [되돌리기]", #405)
 * 기록은 lib/settingsMapping.ts 의 saveAutoSettings 가 SETTING_CHANGES_KEY 에 쌓습니다.
 */
import { AUTO_SETTING_ROWS } from '@/lib/autoSettingOptions'
import {
  SETTING_CHANGES_KEY,
  loadAutoSettings,
  revertSetting,
  saveAutoSettings,
  type AutoSettingKey,
  type SettingChange,
} from '@/lib/settingsMapping'
import { loadData, removeData, saveData } from '@/lib/storage'

/** 아직 확인하지 않은 설정 바뀜 기록 (오래된 것부터). 같은 설정이 여러 번 바뀌었으면 마지막 것만 */
export function loadSettingChanges(): SettingChange[] {
  const saved = loadData<unknown>(SETTING_CHANGES_KEY, [])
  if (!Array.isArray(saved)) return []
  const lastByKey = new Map<AutoSettingKey, SettingChange>()
  for (const item of saved as SettingChange[]) {
    if (item && typeof item.key === 'string' && typeof item.reason === 'string') {
      lastByKey.delete(item.key)
      lastByKey.set(item.key, item)
    }
  }
  return [...lastByKey.values()]
}

/** 바뀜 기록을 모두 지웁니다. 홈에서 [확인] 을 눌렀을 때 */
export function clearSettingChanges(): void {
  removeData(SETTING_CHANGES_KEY)
}

/**
 * 그 설정을 AI 가 바꾸기 전 값으로 되돌리고(잠김), 그 설정의 바뀜 기록을 지웁니다. 남은 기록을 돌려줍니다.
 * (설정 화면의 [되돌리기] 와 같은 revertSetting 을 씁니다 — 되돌린 설정은 AI 가 다시 바꾸지 않습니다)
 */
export function revertSettingChange(key: AutoSettingKey): SettingChange[] {
  saveAutoSettings(revertSetting(loadAutoSettings(), key))
  const rest = loadSettingChanges().filter((change) => change.key !== key)
  if (rest.length === 0) removeData(SETTING_CHANGES_KEY)
  else saveData(SETTING_CHANGES_KEY, rest)
  return rest
}

/** 설정 바뀜 한 줄의 글자. 예: { title: '5초 카운트다운', to: '켬' } */
export function describeSettingChange(change: SettingChange): { title: string; to: string } {
  const row = AUTO_SETTING_ROWS.find((item) => item.key === change.key)
  const option = row?.options.find((item) => item.value === change.to)
  return { title: row?.title ?? change.key, to: option?.label ?? String(change.to) }
}
