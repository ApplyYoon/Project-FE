/**
 * 상담 채팅을 서버(BE)와 주고받는 함수들입니다. (#416, BE 이슈 #238)
 * 채팅은 "글로 하는 통화" 입니다. 통화와 같은 대본으로 AI 선생님과 이야기합니다.
 *
 * 서버와 정한 약속입니다. (BE 저장소의 docs/API.md "상담 채팅") 전부 로그인이 필요합니다.
 *   열기      POST /chats                 { careLevel, maxHarshness, card }
 *                                         -> 200 { chatId, reply, showHelp, helpLines }   (reply = AI 의 첫 인사)
 *   말 보내기  POST /chats/{chatId}/messages { lines: [{ speaker: 'ai' | 'me', text }] }  (지금까지의 대화 전체)
 *                                         -> 200 { chatId, reply, showHelp, helpLines }
 *   끝내기    통화와 같은 기록이라 통화 결과 화면(/call/result)이 POST /calls/{chatId}/finish 로 정리합니다. (lib/callReview.ts)
 *   실패      400 대화 모양이 틀림 · 409 이미 끝났거나 서버가 대본을 잊음(새로 시작) · 429 오늘 AI 사용량을 다 씀 · 503 AI 가 꺼져 있음
 *
 * - 열기 요청은 통화를 걸 때와 똑같습니다. (말투 · 학생 카드. pages/CallActivePage.tsx)
 *   서버는 숫자를 서버의 기록으로 다시 계산하고, 서버에 기록이 없을 때만 이 카드를 씁니다.
 * - showHelp 가 true 면 학생의 말에서 위기 표현이 감지된 것입니다. reply 는 서버가 정해 둔 안내이고, 그 채팅은 끝납니다.
 *
 * ⚠️ 대화는 학생의 마음 이야기입니다. 서버는 답을 받는 데만 쓰고 저장하지 않습니다.
 *    이 파일도 대화를 브라우저 저장소에 넣지 않고, console.log 로 찍지 않습니다.
 */
import { api, ApiError } from '@/lib/api'
import { loadCallCard } from '@/lib/callCard'
import type { CallLine } from '@/lib/callReview'
import { getCallTone } from '@/lib/todayCare'

// 서버가 GPT 의 답을 기다리는 시간(15초)보다 조금 넉넉하게 기다립니다.
const REQUEST_TIMEOUT_MS = 25_000

/** 서버가 받는 대화의 한도입니다. (BE ChatMessageRequest: 60줄, 한 줄 500자) */
export const MAX_CHAT_LINES = 60
export const MAX_CHAT_TEXT_LENGTH = 500

/** 도움받을 곳 하나 (서버의 HelpLine 과 같은 모양) */
export interface ChatHelpLine {
  name: string
  number: string
  detail: string
}

/** AI 선생님의 말 하나 */
export interface ChatReply {
  chatId: string
  reply: string
  /** true 면 위기 표현이 감지됐습니다. 도움 안내를 보여 주고 채팅을 끝냅니다. */
  showHelp: boolean
  helpLines: ChatHelpLine[]
}

/** 서버가 준 값이 약속한 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) */
function isChatReply(value: unknown): value is ChatReply {
  if (typeof value !== 'object' || value === null) return false
  const reply = value as Record<string, unknown>
  return (
    typeof reply.chatId === 'string' &&
    typeof reply.reply === 'string' &&
    typeof reply.showHelp === 'boolean' &&
    Array.isArray(reply.helpLines) &&
    reply.helpLines.every(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        typeof (line as Record<string, unknown>).name === 'string' &&
        typeof (line as Record<string, unknown>).number === 'string',
    )
  )
}

async function postChat(path: string, body: unknown): Promise<ChatReply> {
  const result = await api<unknown>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // 502: 서버가 이상한 응답을 줬다는 뜻으로 씁니다.
  if (!isChatReply(result)) throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  return result
}

/** 채팅을 엽니다. AI 선생님의 첫 인사가 돌아옵니다. 요청은 통화를 걸 때와 같습니다. */
export function startChat(): Promise<ChatReply> {
  const tone = getCallTone()
  return postChat('/chats', {
    careLevel: tone.careLevel,
    maxHarshness: tone.maxHarshness,
    card: loadCallCard(),
    // 생각 습관 테스트(selfReportedBiases · selfReportedWeaknesses)는 #417 에서 지워서 보내지 않습니다. (서버에서 선택 칸)
  })
}

/** 학생의 말을 보냅니다. lines 는 지금까지의 대화 전체이고, 맨 끝이 방금 학생이 쓴 말입니다. */
export function sendChatMessage(chatId: string, lines: CallLine[]): Promise<ChatReply> {
  return postChat(`/chats/${encodeURIComponent(chatId)}/messages`, { lines })
}
