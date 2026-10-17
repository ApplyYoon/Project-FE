import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ApiError, getApiErrorMessage } from '@/lib/api'
import type { CallResultState } from '@/lib/callReview'
import {
  MAX_CHAT_LINES,
  MAX_CHAT_TEXT_LENGTH,
  sendChatMessage,
  startChat,
  type ChatHelpLine,
  type ChatReply,
} from '@/lib/chatApi'
import { cn } from '@/lib/cn'
import { SUPPORT_PATH } from '@/lib/helpLines'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/** 채팅 말풍선 하나 */
interface ChatBubble {
  id: number
  speaker: 'ai' | 'me'
  text: string
}

/** 말풍선 목록을 서버에 보내는 대화 줄로 바꿉니다. (말풍선 번호는 화면에서만 씁니다) */
function toLines(bubbles: ChatBubble[]) {
  return bubbles.map(({ speaker, text }) => ({ speaker, text }))
}

/**
 * 서버가 거절한 이유를 학생이 이해할 수 있는 문장으로 바꿉니다.
 * 테스트 로그인은 서버가 모르는 사람이라 401 이 오는데, 그때는 로그인 화면으로 보내지 않고 안내만 합니다.
 */
function getChatErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return '상담 채팅은 구글로 로그인한 계정에서만 쓸 수 있어요.'
  }
  return getApiErrorMessage(error)
}

/**
 * 상담 채팅 화면입니다. (#416, BE 이슈 #238) 통화를 못 받은 날에도 같은 이야기를 글로 나눕니다.
 *
 *   1. [채팅 시작] → 서버가 통화와 같은 대본으로 AI 선생님의 첫 인사를 줍니다.
 *      (화면을 열자마자 자동으로 시작하지 않습니다. 실수로 열어도 AI 사용량을 쓰지 않게, 그리고 채팅이 두 번 열리지 않게)
 *   2. 말을 보내면 지금까지의 대화를 모두 보내고 AI 의 다음 말을 받습니다. (서버는 대화를 저장하지 않습니다)
 *   3. 위기 표현이 감지되면 서버가 정해 둔 안내와 도움받을 곳을 주고, 채팅은 거기서 끝납니다.
 *   4. [끝내기] → 통화 결과 화면(/call/result)이 통화와 똑같이 정리합니다. (요약 · 생각 습관 · 약속)
 *
 * ⚠️ 대화는 이 화면의 메모리에만 있습니다. 브라우저 저장소에 넣지 않고, console.log 로 찍지 않습니다.
 *    그래서 화면을 나가면 끝내지 않은 대화는 사라집니다.
 */
export function ChatPage() {
  const navigate = useNavigate()
  const [chatId, setChatId] = useState<string | null>(null)
  const [bubbles, setBubbles] = useState<ChatBubble[]>([])
  const [draft, setDraft] = useState('')
  // 위기 표현이 감지됐을 때 받은 도움받을 곳. null 이면 평소처럼 이야기하는 중입니다.
  const [helpLines, setHelpLines] = useState<ChatHelpLine[] | null>(null)
  const nextId = useRef(1)
  const listRef = useRef<HTMLDivElement>(null)

  function addBubble(speaker: 'ai' | 'me', text: string, base: ChatBubble[]): ChatBubble[] {
    const bubble = { id: nextId.current, speaker, text }
    nextId.current += 1
    return [...base, bubble]
  }

  /** AI 의 말을 말풍선으로 더합니다. 위기 표현이면 도움 안내로 바꿉니다. */
  function receive(reply: ChatReply, base: ChatBubble[]) {
    setBubbles(addBubble('ai', reply.reply, base))
    if (reply.showHelp) setHelpLines(reply.helpLines)
  }

  const start = useMutation({
    mutationFn: startChat,
    onSuccess: (reply) => {
      setChatId(reply.chatId)
      receive(reply, [])
    },
  })

  const send = useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: ReturnType<typeof toLines> }) =>
      sendChatMessage(id, lines),
    onSuccess: (reply, variables) => {
      // 보낸 대화 뒤에 AI 의 말을 붙입니다. (보내는 사이 화면의 목록이 바뀌지 않으므로 보낸 줄 수로 자릅니다)
      setBubbles((current) => {
        const sent = current.slice(0, variables.lines.length)
        return addBubble('ai', reply.reply, sent)
      })
      if (reply.showHelp) setHelpLines(reply.helpLines)
    },
  })

  // 새 말풍선이 생기면 맨 아래로 내립니다.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [bubbles, send.isPending])

  const isEnded = helpLines !== null
  // 서버가 받는 줄 수(60)를 넘지 않게, 새 말과 AI 의 답이 들어갈 자리를 남겨 둡니다.
  const isTooLong = bubbles.length >= MAX_CHAT_LINES - 1
  // 409: 이미 끝났거나 서버가 다시 켜져 대본을 잊었습니다. 새로 시작해야 합니다.
  const needsRestart = send.error instanceof ApiError && send.error.status === 409
  const hasStudentLine = bubbles.some((bubble) => bubble.speaker === 'me')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (chatId === null || text === '' || send.isPending || isEnded || isTooLong) return
    const next = addBubble('me', text.slice(0, MAX_CHAT_TEXT_LENGTH), bubbles)
    setBubbles(next)
    setDraft('')
    send.mutate({ id: chatId, lines: toLines(next) })
  }

  function handleFinish() {
    if (chatId === null || !hasStudentLine) {
      navigate('/counsel')
      return
    }
    // 통화와 같은 기록이라, 통화 결과 화면이 POST /calls/{chatId}/finish 로 정리합니다.
    const state: CallResultState = { callId: chatId, lines: toLines(bubbles) }
    navigate('/call/result', { replace: true, state })
  }

  function handleRestart() {
    setChatId(null)
    setBubbles([])
    setHelpLines(null)
    send.reset()
    start.mutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          to="/counsel"
          className="text-brand inline-flex h-11 items-center gap-1 text-sm font-medium hover:underline"
        >
          <span aria-hidden>‹</span> 상담
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">채팅으로 상담하기</h1>
        <p className="mt-2 text-sm break-keep text-slate-600">
          통화와 같은 순서로, 오늘 이야기를 글로 나눠요. 대화 내용은 저장하지 않고, 끝내면 요약만
          남아요.
        </p>
      </div>

      {chatId === null && !start.isPending && (
        <Card>
          <p className="text-sm break-keep text-slate-600">
            AI 선생님과 열 번 안팎으로 주고받아요. 숫자는 내 기록으로 계산한 것만 말해요.
          </p>
          <Button className="mt-4 w-full sm:w-auto" onClick={() => start.mutate()}>
            채팅 시작
          </Button>
          {start.isError && (
            <p role="alert" className="mt-3 text-sm break-keep text-red-600">
              {getChatErrorMessage(start.error)}
            </p>
          )}
        </Card>
      )}

      {start.isPending && (
        <p role="status" className="text-sm text-slate-500">
          AI 선생님이 오는 중…
        </p>
      )}

      {chatId !== null && (
        // role="log": 새 말이 생기면 화면을 읽어 주는 프로그램이 알려 줍니다.
        <div
          ref={listRef}
          role="log"
          aria-label="상담 대화"
          className="max-h-[55vh] min-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3"
        >
          <ul className="flex flex-col gap-2">
            {bubbles.map((bubble) => (
              <li
                key={bubble.id}
                className={cn('flex', bubble.speaker === 'me' ? 'justify-end' : 'justify-start')}
              >
                {/* max-w-[80%] + break-words: 긴 말풍선도 화면 폭을 넘지 않고 안에서 줄바꿈됩니다. */}
                <p
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2 text-sm break-words whitespace-pre-wrap sm:text-base',
                    bubble.speaker === 'me' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-900',
                  )}
                >
                  {bubble.text}
                </p>
              </li>
            ))}
            {send.isPending && (
              <li className="flex justify-start">
                <p
                  role="status"
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500"
                >
                  쓰는 중…
                </p>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 위기 표현이 감지됐을 때. 공부 이야기는 멈추고 도움받을 곳을 먼저 보여 줍니다. */}
      {helpLines !== null && (
        <Card title="지금 바로 이야기할 수 있는 곳" className="border-amber-200 bg-amber-50">
          <ul className="flex flex-col gap-2">
            {helpLines.map((line) => (
              <li key={line.number}>
                <a
                  href={`tel:${line.number}`}
                  className="flex min-h-11 items-center justify-between rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900"
                >
                  <span>
                    {line.name} <span className="text-slate-500">· {line.detail}</span>
                  </span>
                  <span className="text-brand">{line.number}</span>
                </a>
              </li>
            ))}
          </ul>
          <Link
            to={SUPPORT_PATH}
            className="text-brand mt-3 inline-flex h-11 items-center text-sm font-medium underline"
          >
            힘들 때 도움받기 화면 열기
          </Link>
        </Card>
      )}

      {chatId !== null && !isEnded && (
        // 입력창은 아래에 붙여 둡니다. 모바일에서는 하단 탭(h-14) 위에 오고, 키보드가 올라오면 화면과 같이 올라갑니다.
        <form
          onSubmit={handleSubmit}
          className="sticky bottom-14 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:bottom-4"
        >
          <label htmlFor="chat-input" className="sr-only">
            AI 선생님에게 보낼 말
          </label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // 키보드가 올라왔을 때 입력창이 가려지지 않게 화면 안으로 끌어옵니다.
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
            maxLength={MAX_CHAT_TEXT_LENGTH}
            rows={2}
            disabled={send.isPending || isTooLong}
            placeholder={
              isTooLong ? '대화가 길어졌어요. 끝내기를 눌러 정리해요.' : '여기에 써 주세요'
            }
            className="focus:border-brand focus:ring-brand/30 w-full resize-none rounded-lg border border-slate-300 p-3 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none sm:text-sm"
          />
          {send.isError && !needsRestart && (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              <p className="text-sm break-keep text-red-600">{getChatErrorMessage(send.error)}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => send.variables && send.mutate(send.variables)}
              >
                다시 보내기
              </Button>
            </div>
          )}
          {needsRestart && (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              <p className="text-sm break-keep text-red-600">{getChatErrorMessage(send.error)}</p>
              <Button type="button" variant="secondary" size="sm" onClick={handleRestart}>
                새로 시작
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={draft.trim() === '' || send.isPending || isTooLong}
            >
              보내기
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleFinish}
              disabled={send.isPending}
            >
              끝내기
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
