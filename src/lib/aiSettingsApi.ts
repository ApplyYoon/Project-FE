import { AI_SHOW_HELP_EVENT } from '@/lib/aiCardApi'
import { ApiError, api } from '@/lib/api'
import { isServerDataMode } from '@/lib/dataMode'
import { DAILY_COUNT_OPTIONS, type MessageSettings } from '@/lib/messageSettings'

/**
 * 말로 한 부탁("아침엔 알림 꺼 줘")을 설정 변경안으로 바꿔 달라고 서버에 부탁합니다. (#419 ⑩, BE `POST /ai/settings-from-text`)
 * AI 키는 서버에만 있습니다. 서버는 **변경안만** 돌려주고 설정을 바꾸지 않습니다.
 * 학생이 변경안을 보고 [이렇게 바꿀게요] 를 눌러야 이 기기의 설정에 저장합니다.
 *
 * 말로 바꿀 수 있는 칸은 넷뿐입니다: 전화 받을 시간 · 하루 메시지 수 · 연락 금지 시작 · 끝.
 * (독설 수위 · 관리 강도 한도 · 잠금은 말로 바꾸지 않습니다. 서버도 그런 부탁이면 변경안을 주지 않습니다)
 */

/** 서버가 GPT 를 최대 10초 기다리므로 그보다 조금 더 기다립니다. (lib/aiCardApi.ts 와 같은 값) */
const REQUEST_TIMEOUT_MS = 12000

/** 부탁 한 줄의 최대 글자 수 (서버와 같음) */
export const SETTINGS_TEXT_MAX_LENGTH = 100

/** AI 가 만든 변경안. 값이 null 인 칸은 바꾸지 않습니다. */
export interface SettingsProposal {
  /** 전화 받을 시간 'HH:MM' */
  callTime: string | null
  /** 하루 메시지 수 0 ~ 5 */
  dailyCount: number | null
  /** 연락 금지 시작 'HH:MM' */
  quietStart: string | null
  /** 연락 금지 끝 'HH:MM' */
  quietEnd: string | null
  /** 무엇을 왜 바꾸는지 한 줄 (AI 가 쓴 문장) */
  summary: string
}

/**
 * 서버에 물어본 결과
 *   proposal: 변경안을 받음
 *   none:     바꿀 칸이 없음 · 말로는 못 바꾸는 부탁 · AI 가 꺼졌거나 하루 한도
 *   help:     부탁에 위기 표현이 있어서 AI 를 쓰지 않음 → 다른 AI 도우미와 같은 도움 연결 안내를 띄웁니다
 *   failed:   연결이 안 되거나 서버가 실패함
 */
export type SettingsFromTextResult =
  | { kind: 'proposal'; proposal: SettingsProposal }
  | { kind: 'none' }
  | { kind: 'help' }
  | { kind: 'failed' }

/** 'HH:MM' 모양인지 (서버가 이상한 값을 주면 그 변경안은 쓰지 않습니다) */
function isTimeOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
}

/** 서버가 준 변경안이 쓸 수 있는 모양인지 확인합니다. 아니면 null */
function readProposal(value: unknown): SettingsProposal | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const { callTime, dailyCount, quietStart, quietEnd, summary } = record
  if (!isTimeOrNull(callTime) || !isTimeOrNull(quietStart) || !isTimeOrNull(quietEnd)) return null
  if (
    dailyCount !== null &&
    !(typeof dailyCount === 'number' && DAILY_COUNT_OPTIONS.includes(dailyCount))
  ) {
    return null
  }
  if (typeof summary !== 'string' || summary.trim() === '') return null
  return { callTime, dailyCount, quietStart, quietEnd, summary: summary.trim() }
}

/**
 * 부탁 한 줄로 설정 변경안을 받아 옵니다. 테스트 로그인(가짜 토큰)이면 서버에 묻지 않고 'none' 입니다.
 *
 *   await requestSettingsFromText('아침엔 알림 꺼 줘')
 *     -> { kind: 'proposal', proposal: { quietEnd: '09:00', summary: '아침 9시까지 연락하지 않도록 …', 나머지 null } }
 *   await requestSettingsFromText('독설 더 세게 해 줘') -> { kind: 'none' }   (말로 못 바꾸는 칸)
 */
export async function requestSettingsFromText(text: string): Promise<SettingsFromTextResult> {
  const trimmed = text.trim().slice(0, SETTINGS_TEXT_MAX_LENGTH)
  if (trimmed === '' || !isServerDataMode()) return { kind: 'none' }
  try {
    const result = await api<unknown>('/ai/settings-from-text', {
      method: 'POST',
      body: JSON.stringify({ text: trimmed }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const record = (typeof result === 'object' && result !== null ? result : {}) as Record<
      string,
      unknown
    >
    if (record.showHelp === true) {
      // 어느 화면에서든 같은 도움 연결 안내(components/layout/AiHelpListener)가 뜨게 알립니다.
      window.dispatchEvent(new Event(AI_SHOW_HELP_EVENT))
      return { kind: 'help' }
    }
    const proposal = readProposal(record.proposal)
    return proposal ? { kind: 'proposal', proposal } : { kind: 'none' }
  } catch (error) {
    // 401 은 api() 가 이미 로그인 화면으로 보냅니다. 그 밖의 실패는 "직접 바꿔 주세요" 로 안내합니다.
    if (error instanceof ApiError && error.status === 401) throw error
    return { kind: 'failed' }
  }
}

/** 이 기기에 저장된, 말로 바꿀 수 있는 설정 넷 */
export interface TalkableSettings {
  /** 전화 받을 시간. 안 정했으면 빈 글자 */
  callTime: string
  messageSettings: MessageSettings
}

/** 변경안에서 실제로 바뀌는 칸 하나 (화면에 "지금 → 바꿀 값" 으로 보여 줍니다) */
export interface SettingsChangeRow {
  label: string
  from: string
  to: string
}

/** 하루 메시지 수를 글자로. 0 은 '끔' */
function dailyCountText(count: number): string {
  return count === 0 ? '끔' : `하루 ${count}번`
}

/**
 * 변경안 중 지금 값과 **다른** 칸만 고릅니다. (서버는 서버에 저장된 값과 비교하는데, 이 앱은 설정을 이 기기에 두기 때문에 한 번 더 봅니다)
 *
 *   getSettingsChangeRows({ quietEnd: '09:00', 나머지 null }, { callTime: '', messageSettings: { quietEnd: '07:00', … } })
 *     -> [{ label: '연락 금지 끝', from: '07:00', to: '09:00' }]
 *   지금 값과 모두 같으면 -> []
 */
export function getSettingsChangeRows(
  proposal: SettingsProposal,
  current: TalkableSettings,
): SettingsChangeRow[] {
  const rows: SettingsChangeRow[] = []
  const { messageSettings } = current
  if (proposal.callTime !== null && proposal.callTime !== current.callTime) {
    rows.push({
      label: '전화 받을 시간',
      from: current.callTime || '안 정함',
      to: proposal.callTime,
    })
  }
  if (proposal.dailyCount !== null && proposal.dailyCount !== messageSettings.dailyCount) {
    rows.push({
      label: '하루 메시지 수',
      from: dailyCountText(messageSettings.dailyCount),
      to: dailyCountText(proposal.dailyCount),
    })
  }
  if (proposal.quietStart !== null && proposal.quietStart !== messageSettings.quietStart) {
    rows.push({
      label: '연락 금지 시작',
      from: messageSettings.quietStart,
      to: proposal.quietStart,
    })
  }
  if (proposal.quietEnd !== null && proposal.quietEnd !== messageSettings.quietEnd) {
    rows.push({ label: '연락 금지 끝', from: messageSettings.quietEnd, to: proposal.quietEnd })
  }
  return rows
}

/**
 * 변경안을 지금 설정에 덮어쓴 새 설정. 값이 null 인 칸은 그대로 둡니다. (저장은 부르는 쪽에서 합니다)
 *
 *   applySettingsProposal({ dailyCount: 0, 나머지 null }, { callTime: '21:00', messageSettings: { dailyCount: 3, … } })
 *     -> { callTime: '21:00', messageSettings: { dailyCount: 0, … } }
 */
export function applySettingsProposal(
  proposal: SettingsProposal,
  current: TalkableSettings,
): TalkableSettings {
  return {
    callTime: proposal.callTime ?? current.callTime,
    messageSettings: {
      dailyCount: proposal.dailyCount ?? current.messageSettings.dailyCount,
      quietStart: proposal.quietStart ?? current.messageSettings.quietStart,
      quietEnd: proposal.quietEnd ?? current.messageSettings.quietEnd,
    },
  }
}
