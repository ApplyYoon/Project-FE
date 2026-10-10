/**
 * AI 와 통화하면서 오는 "대화 글자(자막)" 이벤트를 말풍선 목록으로 바꿉니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * 이벤트 이름과 필드는 OpenAI Realtime API 공식 문서(Server events)를 보고 정했습니다.
 *  - AI 말: response.output_audio_transcript.delta (조금씩 도착) / .done (다 끝남)
 *  - 내 말: conversation.item.input_audio_transcription.completed
 */

/** 말풍선 한 개. speaker 가 'ai' 면 왼쪽, 'me' 면 오른쪽에 보입니다. */
export interface SubtitleMessage {
  /** 말풍선을 구분하는 값. 서버가 주는 item_id 를 그대로 씁니다. */
  id: string
  speaker: 'ai' | 'me'
  text: string
}

/** 화면이 알아야 하는 이벤트만 골라 단순하게 바꾼 모양입니다. */
export type TranscriptEvent =
  | { type: 'ai-delta'; itemId: string; text: string } // AI 말의 일부가 도착
  | { type: 'ai-done'; itemId: string; text: string } // AI 말 완성본
  | { type: 'me-started'; itemId: string } // 내가 말을 마침. 글자로 바뀌길 기다리는 중
  | { type: 'me-done'; itemId: string; text: string } // 내 말 완성본

// 내 말이 글자로 바뀌기를 기다리는 동안 보여주는 표시
const WAITING_TEXT = '…'

/**
 * 데이터 채널로 받은 글자(JSON 문자열)를 읽어서 TranscriptEvent 로 바꿉니다.
 * 우리가 쓰지 않는 이벤트나 모양이 다른 데이터는 null 을 돌려줍니다. (에러를 내지 않습니다)
 */
export function parseTranscriptEvent(raw: unknown): TranscriptEvent | null {
  if (typeof raw !== 'string') return null

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null

  const event = data as Record<string, unknown>
  const itemId = event.item_id
  if (typeof itemId !== 'string') return null

  switch (event.type) {
    case 'response.output_audio_transcript.delta':
      return typeof event.delta === 'string'
        ? { type: 'ai-delta', itemId, text: event.delta }
        : null
    case 'response.output_audio_transcript.done':
      return typeof event.transcript === 'string'
        ? { type: 'ai-done', itemId, text: event.transcript }
        : null
    // 내가 말을 마치고 서버가 소리를 받아 간 순간입니다. 글자는 조금 뒤에 오므로 먼저 자리를 잡아 둡니다.
    // (자리를 안 잡으면 AI 대답이 먼저 나오고 내 말이 나중에 끼어들어 순서가 뒤집힙니다)
    // ⚠️ 이 이벤트의 item_id 필드는 문서로 확인하지 못했습니다. 없으면 이 이벤트는 무시됩니다.
    case 'input_audio_buffer.committed':
      return { type: 'me-started', itemId }
    case 'conversation.item.input_audio_transcription.completed':
      return typeof event.transcript === 'string'
        ? { type: 'me-done', itemId, text: event.transcript }
        : null
    default:
      return null
  }
}

/**
 * 이벤트 하나를 받아서 새 말풍선 목록을 만들어 돌려줍니다. (원래 목록은 바꾸지 않습니다)
 * 같은 id 의 말풍선이 이미 있으면 그 말풍선을 고치고, 없으면 맨 아래에 새로 추가합니다.
 */
export function applyTranscript(
  messages: SubtitleMessage[],
  event: TranscriptEvent,
): SubtitleMessage[] {
  const index = messages.findIndex((message) => message.id === event.itemId)
  const existing = index === -1 ? null : messages[index]

  // 말풍선 하나의 글자를 바꾼 새 목록을 만듭니다. 없으면 맨 아래에 추가합니다.
  function setMessage(speaker: SubtitleMessage['speaker'], text: string) {
    const next: SubtitleMessage = { id: event.itemId, speaker, text }
    if (existing === null) return [...messages, next]
    return messages.map((message) => (message.id === event.itemId ? next : message))
  }

  switch (event.type) {
    case 'ai-delta':
      // 조금씩 도착하는 글자를 뒤에 이어 붙입니다.
      return setMessage('ai', (existing?.text ?? '') + event.text)
    case 'ai-done':
      // 완성본으로 한 번에 바꿉니다. (조각이 빠졌더라도 이걸로 바로잡힙니다)
      return setMessage('ai', event.text)
    case 'me-started':
      // 이미 있으면(글자가 먼저 도착한 경우) 건드리지 않습니다.
      return existing === null ? setMessage('me', WAITING_TEXT) : messages
    case 'me-done': {
      const text = event.text.trim()
      // 아무 말도 안 잡혔으면(빈 글자) 기다리던 자리를 없앱니다.
      if (text === '') return messages.filter((message) => message.id !== event.itemId)
      return setMessage('me', text)
    }
  }
}
