import { loadData, saveData } from '@/lib/storage'

/**
 * AI 메시지를 하루에 몇 번 받을지, 언제는 연락하지 말지 정한 값입니다.
 * 메시지·전화를 보내는 기능(#62 알림, #83 이벤트 메시지, #95 안전 브레이크)은
 * getMessageSettings() 로 읽으면 됩니다.
 */
export interface MessageSettings {
  /** 하루에 받을 AI 메시지 수 (0 ~ 5). 0 이면 이벤트 메시지까지 모두 꺼집니다. */
  dailyCount: number
  /** 연락 금지 시작 시각 ('HH:MM') */
  quietStart: string
  /** 연락 금지 끝 시각 ('HH:MM'). 시작보다 이르면 다음 날 그 시각까지입니다. (예: 23:00 ~ 07:00) */
  quietEnd: string
}

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-message-settings' 가 됩니다)
const STORAGE_KEY = 'message-settings'

/** 하루 메시지 수로 고를 수 있는 값. 0 은 "끔" 입니다. */
export const DAILY_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5]

/** 아직 한 번도 정하지 않았을 때의 값. 연락 금지 시간은 기획서대로 밤 11시 ~ 아침 7시입니다. */
export const defaultMessageSettings: MessageSettings = {
  dailyCount: 3,
  quietStart: '23:00',
  quietEnd: '07:00',
}

/** 'HH:MM' 모양의 글자인지 확인합니다. ('07:30' 은 통과, '' 나 '7:3' 은 실패) */
function isTimeText(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

/** 하루 메시지 수로 쓸 수 있는 숫자인지 확인합니다. */
function isDailyCount(value: unknown): value is number {
  return typeof value === 'number' && DAILY_COUNT_OPTIONS.includes(value)
}

/**
 * 저장된 메시지 설정을 돌려줍니다.
 * 저장된 게 없거나 일부가 깨져 있으면, 그 부분만 처음 값으로 채웁니다.
 */
export function getMessageSettings(): MessageSettings {
  // 저장된 값의 모양을 믿을 수 없어서 unknown 으로 꺼낸 뒤 하나씩 확인합니다.
  const saved = loadData<unknown>(STORAGE_KEY, null)
  const item = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {}

  return {
    dailyCount: isDailyCount(item.dailyCount) ? item.dailyCount : defaultMessageSettings.dailyCount,
    quietStart: isTimeText(item.quietStart) ? item.quietStart : defaultMessageSettings.quietStart,
    quietEnd: isTimeText(item.quietEnd) ? item.quietEnd : defaultMessageSettings.quietEnd,
  }
}

/** 메시지 설정을 저장합니다. */
export function saveMessageSettings(settings: MessageSettings): void {
  saveData(STORAGE_KEY, settings)
}
