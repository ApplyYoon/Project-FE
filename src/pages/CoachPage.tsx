import { SettingsLink } from '@/components/ui/SettingsLink'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, getApiErrorMessage } from '@/lib/api'
import type { CallResultState } from '@/lib/callReview'
import {
  MAX_CHAT_LINES,
  MAX_CHAT_TEXT_LENGTH,
  sendChatMessage,
  startChat,
  type ChatReply,
} from '@/lib/chatApi'
import { cn } from '@/lib/cn'
import { runDailyCareStage } from '@/lib/dailyCareRun'
import { getTodayKey } from '@/lib/date'
import { YOUTH_HELP_LINE } from '@/lib/helpLines'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/** 채팅 말풍선 하나 */
interface ChatBubble {
  id: number
  speaker: 'ai' | 'me'
  text: string
}

/** 탭을 옮겼다 돌아와도 이어지게 들고 있는 대화 */
interface KeptChat {
  /** 이 대화를 시작한 로그인 열쇠. 다른 사람이 로그인하면 대화를 비웁니다. */
  token: string | null
  chatId: string | null
  bubbles: ChatBubble[]
  isHelpShown: boolean
}

const EMPTY_CHAT: KeptChat = { token: null, chatId: null, bubbles: [], isHelpShown: false }

// 탭을 옮겼다 돌아와도 대화가 남게, 이 파일(모듈) 안의 변수에 잠깐 들고 있습니다.
// ⚠️ 브라우저 저장소에는 넣지 않습니다. 그래서 새로고침하거나 앱을 다시 열면 사라집니다. (대화는 학생의 마음 이야기라서)
let keptChat: KeptChat = EMPTY_CHAT

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
    return 'AI 코치와의 대화는 구글로 로그인한 계정에서만 쓸 수 있어요.'
  }
  return getApiErrorMessage(error)
}

/**
 * 코치 탭(첫 화면 "/") — AI 코치와 채팅하는 곳입니다. (2026-10-18 "AI 코치 채팅 중심", BE #238)
 * 예전 상담 탭(/counsel) · 상담 채팅(/counsel/chat)을 합쳤습니다. 음성 통화는 머리의 [통화] 버튼으로 갑니다.
 *
 *   1. [대화 시작] → 서버가 통화와 같은 대본으로 AI 코치의 첫 인사를 줍니다.
 *      (화면을 열자마자 자동으로 시작하지 않습니다. 실수로 열어도 AI 사용량을 쓰지 않게)
 *   2. 말을 보내면 지금까지의 대화를 모두 보내고 AI 의 다음 말을 받습니다. (서버는 대화를 저장하지 않습니다)
 *   3. 위기 표현이 감지되면 서버가 정해 둔 안내를 주고, 화면은 상담 전화 한 줄을 더 보여 줍니다.
 *      입력창은 닫지 않습니다. 서버가 그 대화를 끝냈으면(409) [새로 시작] 이 나옵니다.
 *   4. [끝내기] → 통화 결과 화면(/call/result)이 통화와 똑같이 정리합니다. (요약 · 생각 습관 · 약속)
 *
 * 모바일에서는 화면 높이를 꽉 채웁니다. 말풍선 목록만 스크롤되고, 입력창은 아래(하단 탭 위)에 붙어 있습니다.
 * (높이는 Layout 이 코치 화면일 때 h-dvh 로 잡아 줍니다)
 *
 * ⚠️ 대화는 메모리(위의 keptChat)에만 있습니다. 브라우저 저장소에 넣지 않고, console.log 로 찍지 않습니다.
 */
export function CoachPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  // 들고 있던 대화로 시작합니다. 다른 사람이 로그인했으면 앞사람의 대화는 쓰지 않습니다.
  const [initial] = useState(() => (keptChat.token === token ? keptChat : EMPTY_CHAT))

  // 하루 1번 관리 단계를 판정해 저장합니다. ("통화가 없으면 다음 날 첫 진입 때", 기획서 5.4)
  // 첫 화면이 홈에서 코치로 바뀌어서 여기서도 부릅니다. 오늘 이미 판정했으면 아무것도 바꾸지 않습니다.
  useState(() => runDailyCareStage(getTodayKey(), Date.now()))

  const [chatId, setChatId] = useState<string | null>(initial.chatId)
  const [bubbles, setBubbles] = useState<ChatBubble[]>(initial.bubbles)
  const [draft, setDraft] = useState('')
  // 위기 표현이 감지돼서 상담 전화 한 줄을 보여 주는 중인지
  const [isHelpShown, setIsHelpShown] = useState(initial.isHelpShown)
  // 다음 말풍선 번호. 들고 있던 대화가 있으면 그 뒤 번호부터 씁니다.
  const nextId = useRef(initial.bubbles.reduce((max, bubble) => Math.max(max, bubble.id), 0) + 1)
  const listRef = useRef<HTMLDivElement>(null)

  // 대화가 바뀔 때마다 메모리에 적어 둡니다. (탭을 옮겼다 돌아오면 이어서 보여 주려고)
  useEffect(() => {
    keptChat = { token, chatId, bubbles, isHelpShown }
  }, [token, chatId, bubbles, isHelpShown])

  function addBubble(speaker: 'ai' | 'me', text: string, base: ChatBubble[]): ChatBubble[] {
    const bubble = { id: nextId.current, speaker, text }
    nextId.current += 1
    return [...base, bubble]
  }

  /** AI 의 말을 말풍선으로 더합니다. 위기 표현이면 상담 전화 한 줄도 보여 줍니다. */
  function receive(reply: ChatReply, base: ChatBubble[]) {
    setBubbles(addBubble('ai', reply.reply, base))
    if (reply.showHelp) setIsHelpShown(true)
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
      if (reply.showHelp) setIsHelpShown(true)
    },
  })

  // 새 말풍선이 생기면 맨 아래로 내립니다.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [bubbles, send.isPending])

  // 서버가 받는 줄 수(60)를 넘지 않게, 새 말과 AI 의 답이 들어갈 자리를 남겨 둡니다.
  const isTooLong = bubbles.length >= MAX_CHAT_LINES - 1
  // 409: 이미 끝났거나 서버가 다시 켜져 대본을 잊었습니다. 새로 시작해야 합니다.
  const needsRestart = send.error instanceof ApiError && send.error.status === 409
  const hasStudentLine = bubbles.some((bubble) => bubble.speaker === 'me')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (chatId === null || text === '' || send.isPending || isTooLong) return
    const next = addBubble('me', text.slice(0, MAX_CHAT_TEXT_LENGTH), bubbles)
    setBubbles(next)
    setDraft('')
    send.mutate({ id: chatId, lines: toLines(next) })
  }

  /** 대화를 비웁니다. 메모리에 들고 있던 것도 같이 비웁니다. */
  function clearChat() {
    keptChat = { ...EMPTY_CHAT, token }
    setChatId(null)
    setBubbles([])
    setIsHelpShown(false)
    send.reset()
  }

  function handleFinish() {
    if (chatId === null || !hasStudentLine) {
      clearChat()
      return
    }
    // 통화와 같은 기록이라, 통화 결과 화면이 POST /calls/{chatId}/finish 로 정리합니다.
    const state: CallResultState = { callId: chatId, lines: toLines(bubbles) }
    clearChat()
    navigate('/call/result', { state })
  }

  function handleRestart() {
    clearChat()
    start.mutate()
  }

  return (
    // flex-1 · min-h-0: Layout 이 잡아 준 높이를 꽉 채우고, 안의 목록만 스크롤되게 합니다.
    // 모바일은 바탕을 연회색으로 칠하고(-mx-4 -my-3 으로 Layout 의 여백까지 덮음), 내용은 흰 묶음으로 올립니다.
    <div className="-mx-4 -my-3 flex min-h-0 flex-1 flex-col gap-3 bg-slate-100 px-4 py-3 sm:mx-0 sm:my-0 sm:rounded-3xl sm:p-4">
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-snug font-bold tracking-tight text-slate-900">
            AI 코치
          </h1>
          <p className="truncate text-[15px] text-slate-500">오늘 공부, 같이 잡아 볼까?</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 음성 통화는 따로 탭 없이 여기서 엽니다. (전화 수신 화면 /call) */}
          <Link to="/call" className={chipClass}>
            <span aria-hidden>📞</span> 통화
          </Link>
          <SettingsLink />
        </div>
      </div>

      {/* role="log": 새 말이 생기면 화면을 읽어 주는 프로그램이 알려 줍니다. */}
      <div
        ref={listRef}
        role="log"
        aria-label="AI 코치와의 대화"
        className="min-h-0 flex-1 overflow-y-auto rounded-3xl bg-white p-4"
      >
        {chatId === null ? (
          <div className="flex h-full flex-col justify-end gap-4">
            <CoachBubble text="오늘 할 공부, 미루고 싶은 마음, 뭐든 말해 줘. 숫자는 내 기록으로 계산한 것만 말할게." />
            <button
              type="button"
              onClick={() => start.mutate()}
              disabled={start.isPending}
              className={primaryButtonClass}
            >
              {start.isPending ? 'AI 코치가 오는 중…' : '대화 시작'}
            </button>
            {start.isError && (
              <p role="alert" className="text-[15px] break-keep text-red-600">
                {getChatErrorMessage(start.error)}
              </p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {bubbles.map((bubble) =>
              bubble.speaker === 'ai' ? (
                <li key={bubble.id}>
                  <CoachBubble text={bubble.text} />
                </li>
              ) : (
                <li key={bubble.id} className="flex justify-end">
                  {/* max-w-[80%] + break-words: 긴 말풍선도 화면 폭을 넘지 않고 안에서 줄바꿈됩니다. */}
                  <p className="bg-brand max-w-[80%] rounded-[20px] px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap text-white">
                    {bubble.text}
                  </p>
                </li>
              ),
            )}
            {send.isPending && (
              <li>
                <CoachBubble text="쓰는 중…" isStatus />
              </li>
            )}
          </ul>
        )}
      </div>

      {/* 위기 표현이 감지됐을 때 상담 전화 한 줄. 대화는 막지 않습니다. (누르면 바로 전화가 걸립니다) */}
      {isHelpShown && (
        <a
          href={`tel:${YOUTH_HELP_LINE.number}`}
          className="flex min-h-14 shrink-0 items-center gap-3 rounded-3xl bg-white px-4 py-2"
        >
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50"
          >
            ☎️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-slate-900">
              {YOUTH_HELP_LINE.name} {YOUTH_HELP_LINE.number}
            </span>
            <span className="block text-sm break-keep text-slate-500">
              지금 이야기할 곳 · {YOUTH_HELP_LINE.detail}
            </span>
          </span>
          <span aria-hidden className="text-slate-400">
            ›
          </span>
        </a>
      )}

      {chatId !== null && (
        // 입력창은 목록 아래에 붙습니다. 하단 탭은 Layout 이 아래 여백(pb-14)으로 비켜 줍니다.
        <form
          onSubmit={handleSubmit}
          className="flex shrink-0 flex-col gap-1 rounded-3xl bg-white p-2"
        >
          {send.isError && (
            <div role="alert" className="flex flex-wrap items-center gap-2 px-2 pt-1">
              <p className="text-sm break-keep text-red-600">{getChatErrorMessage(send.error)}</p>
              {needsRestart ? (
                <button type="button" onClick={handleRestart} className={chipClass}>
                  새로 시작
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => send.variables && send.mutate(send.variables)}
                  className={chipClass}
                >
                  다시 보내기
                </button>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor="chat-input" className="sr-only">
              AI 코치에게 보낼 말
            </label>
            <textarea
              id="chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              // 키보드가 올라왔을 때 입력창이 가려지지 않게 화면 안으로 끌어옵니다.
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
              maxLength={MAX_CHAT_TEXT_LENGTH}
              rows={1}
              disabled={send.isPending || isTooLong}
              placeholder={
                isTooLong ? '대화가 길어졌어요. 끝내기를 눌러 정리해요.' : '코치에게 말하기'
              }
              // text-base: 아이폰은 16px 보다 작은 입력칸을 누르면 화면을 확대해서 16px 로 둡니다.
              className="focus:ring-brand/30 max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
            />
            <button
              type="submit"
              disabled={draft.trim() === '' || send.isPending || isTooLong}
              className="bg-brand h-11 shrink-0 cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              보내기
            </button>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            disabled={send.isPending}
            className="h-10 cursor-pointer self-end rounded-full px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            대화 끝내고 정리하기
          </button>
        </form>
      )}
    </div>
  )
}

// 주 행동 버튼: 전체 폭 · 높이 56px · 둥근 모서리. 누르면 살짝 작아집니다.
const primaryButtonClass =
  'bg-brand hover:bg-brand-dark h-14 w-full cursor-pointer rounded-2xl text-[17px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

// 작은 칩 버튼: 흰 바탕 + 옅은 테두리, 높이 40px
const chipClass =
  'flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-transform active:scale-[0.98]'

interface CoachBubbleProps {
  text: string
  /** true 면 "쓰는 중…" 처럼 상태를 알리는 말풍선입니다. (화면 읽기 프로그램이 읽어 줌) */
  isStatus?: boolean
}

/** AI 코치의 말풍선. 위에 작은 코치 이름과 동그란 아이콘을 둡니다. */
function CoachBubble({ text, isStatus = false }: CoachBubbleProps) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span
          aria-hidden
          className="bg-brand-light flex size-6 items-center justify-center rounded-full text-[13px]"
        >
          🧑‍🏫
        </span>
        코치
      </p>
      <p
        role={isStatus ? 'status' : undefined}
        className={cn(
          'max-w-[85%] rounded-[20px] bg-slate-100 px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap',
          isStatus ? 'text-slate-500' : 'text-slate-900',
        )}
      >
        {text}
      </p>
    </div>
  )
}
