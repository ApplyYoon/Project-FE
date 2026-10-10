import { loadList, saveData } from '@/lib/storage'
import type { AiMessage } from '@/types'

/**
 * AI 메시지를 불러오고 저장하는 함수입니다.
 * 메시지함 화면과 헤더(빨간 점) 두 곳에서 같이 쓰려고 여기에 모았습니다.
 * 서버가 생기면 이 파일만 api() 로 바꾸면 됩니다.
 */

const STORAGE_KEY = 'ai-messages'

/**
 * 저장된 메시지를 보낸 시각 순서(오래된 것 → 최신)로 돌려줍니다.
 * 받은 메시지가 없으면(또는 저장된 값이 깨져 있으면) 빈 목록입니다.
 * 예전에는 없을 때 가짜 메시지 7개를 보여줬는데, 처음 쓰는 사람에게 안 읽은 메시지(빨간 점)가 있는 것처럼 보여서 뺐습니다.
 */
export function loadAiMessages(): AiMessage[] {
  const messages = loadList<AiMessage>(STORAGE_KEY)
  // sort 는 원래 배열을 바꿔 버려서, 복사본([...])을 만들어 정렬합니다.
  return [...messages].sort((a, b) => a.sentAt - b.sentAt)
}

/** 메시지를 전부 "읽음" 으로 바꿔서 저장합니다. */
export function markAllAiMessagesRead(messages: AiMessage[]): void {
  const readMessages = messages.map((message) => ({ ...message, read: true }))
  saveData(STORAGE_KEY, readMessages)
}

/** 안 읽은 메시지가 몇 개인지 셉니다. */
export function countUnreadAiMessages(messages: AiMessage[]): number {
  return messages.filter((message) => !message.read).length
}
