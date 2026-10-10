import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadAiMessages, markAllAiMessagesRead } from '@/lib/aiMessages'
import type { CareLevel } from '@/lib/careLevel'
import { cn } from '@/lib/cn'
import type { AiMessage } from '@/types'

interface CareLevelStyle {
  /** 범례·시각 옆에 보이는 짧은 이름 */
  name: string
  /** 말풍선(과 범례 네모)의 배경·테두리. Tailwind 는 완성된 클래스 이름만 읽어서 통째로 적습니다. */
  bubble: string
  /** 이벤트 이름(예: '계획 시간 지남') 글자 색 */
  eventText: string
}

// 관리 강도마다 말풍선 색을 다르게 합니다. 색은 시안(당근 초록 · 넛지 파랑 · 채찍 주황)을 따랐습니다.
const careLevelStyles: Record<CareLevel, CareLevelStyle> = {
  0: {
    name: '회복',
    bubble: 'bg-teal-50 border-teal-200',
    eventText: 'text-teal-700',
  },
  1: {
    name: '당근',
    bubble: 'bg-green-50 border-green-200',
    eventText: 'text-green-700',
  },
  2: {
    name: '넛지',
    bubble: 'bg-blue-50 border-blue-200',
    eventText: 'text-blue-700',
  },
  3: {
    name: '채찍',
    bubble: 'bg-orange-50 border-orange-200',
    eventText: 'text-orange-700',
  },
  4: {
    name: '강제 채찍',
    bubble: 'bg-rose-50 border-rose-200',
    eventText: 'text-rose-700',
  },
}

/** 시각(밀리초)을 '07:30' 처럼 바꿉니다. */
function formatTime(time: number): string {
  const date = new Date(time)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

/** 두 시각이 같은 날인지 확인합니다. */
function isSameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** 날짜 구분선에 쓸 글자를 만듭니다. 예) '오늘 · 10월 5일', '어제 · 10월 4일', '10월 3일' */
function formatDayLabel(time: number): string {
  const date = new Date(time)
  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameDay(time, Date.now())) return `오늘 · ${monthDay}`
  if (isSameDay(time, yesterday.getTime())) return `어제 · ${monthDay}`
  return monthDay
}

export function MessagesPage() {
  const [messages] = useState<AiMessage[]>(() => loadAiMessages())

  // "여기부터 안 읽음" 선을 그을 첫 번째 안 읽은 메시지.
  // 화면을 연 순간의 값을 기억해 두어야, 아래에서 읽음 처리를 해도 선이 사라지지 않습니다.
  const [firstUnreadId] = useState(() => messages.find((message) => !message.read)?.id)

  // 메시지함을 열었으면 전부 읽은 것으로 저장합니다. (헤더의 빨간 점이 사라집니다)
  useEffect(() => {
    markAllAiMessagesRead(messages)
  }, [messages])

  // 메시지에 나오는 관리 강도만 범례에 보여줍니다. (작은 단계부터)
  const usedLevels = [...new Set(messages.map((message) => message.careLevel))].sort(
    (a, b) => a - b,
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">메시지함</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI 선생님이 보낸 메시지야. 하루 3번 + 이벤트 알림
        </p>
      </div>

      {usedLevels.length > 0 && (
        <ul aria-label="말풍선 색 안내" className="flex flex-wrap gap-x-4 gap-y-2">
          {usedLevels.map((level) => (
            <li key={level} className="flex items-center gap-1.5 text-sm text-slate-600">
              <span
                aria-hidden
                className={cn('h-3.5 w-3.5 rounded border', careLevelStyles[level].bubble)}
              />
              {careLevelStyles[level].name}
            </li>
          ))}
        </ul>
      )}

      {messages.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">아직 받은 메시지가 없어요.</p>
      ) : (
        <ol className="flex flex-col gap-5">
          {messages.map((message, index) => {
            const previous = messages[index - 1]
            // 첫 메시지이거나, 바로 앞 메시지와 날짜가 다르면 날짜 구분선을 그립니다.
            const isNewDay = !previous || !isSameDay(previous.sentAt, message.sentAt)

            return (
              <li key={message.id} className="flex flex-col gap-5">
                {isNewDay && <Divider>{formatDayLabel(message.sentAt)}</Divider>}
                {message.id === firstUnreadId && (
                  <Divider className="font-semibold text-red-600">여기부터 안 읽음</Divider>
                )}
                <MessageBubble message={message} />
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-slate-600">
          밤 11시 ~ 아침 7시에는 보내지 않아. 횟수와 시간은 설정에서 바꿀 수 있어.
        </p>
        <Link
          to="/settings"
          className="text-brand flex h-10 shrink-0 items-center self-start text-sm font-semibold underline sm:self-auto"
        >
          알림 설정
        </Link>
      </div>
    </div>
  )
}

interface DividerProps {
  children: string
  className?: string
}

/** 가운데에 글자가 있는 가로선 (날짜 구분, "여기부터 안 읽음") */
function Divider({ children, className }: DividerProps) {
  return (
    <div className={cn('flex items-center gap-3 text-xs text-slate-500', className)}>
      <span aria-hidden className="h-px flex-1 bg-slate-200" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

interface MessageBubbleProps {
  message: AiMessage
}

/** AI 아바타 + 말풍선 + 보낸 시각 */
function MessageBubble({ message }: MessageBubbleProps) {
  const style = careLevelStyles[message.careLevel]

  return (
    <div className="flex items-start gap-2.5 sm:gap-3">
      <div
        aria-hidden
        className="bg-brand-light text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      >
        AI
      </div>

      {/* min-w-0: 긴 글자가 있어도 화면 밖으로 밀려나지 않게 합니다. */}
      <div className="flex max-w-[85%] min-w-0 flex-col gap-1.5 sm:max-w-xl">
        <p
          className={cn(
            'rounded-2xl border px-4 py-2.5 text-sm break-words text-slate-900 sm:text-base',
            style.bubble,
          )}
        >
          {message.text}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          <span>
            <time dateTime={new Date(message.sentAt).toISOString()}>
              {formatTime(message.sentAt)}
            </time>
            {` · ${style.name}`}
          </span>
          {message.kind === 'event' && message.eventLabel && (
            <span className={cn('font-semibold', style.eventText)}>{message.eventLabel}</span>
          )}
        </p>
      </div>
    </div>
  )
}
