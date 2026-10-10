import { cn } from '@/lib/cn'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** 자막 말풍선 한 개. speaker 가 'ai' 면 왼쪽, 'me' 면 오른쪽에 보입니다. */
interface SubtitleMessage {
  id: number
  speaker: 'ai' | 'me'
  text: string
}

// 지금은 AI 와 연결되기 전이라(#34) 미리 적어 둔 대화를 3초마다 하나씩 보여줍니다.
// 연결되면 이 목록과 아래 useEffect 대신, 실제로 받은 글자를 messages 에 추가하면 됩니다.
const sampleConversation: Omit<SubtitleMessage, 'id'>[] = [
  { speaker: 'ai', text: '어제 순공 3시간 10분, 계획의 80%야.' },
  { speaker: 'me', text: '응… 폰 때문에 좀 늦게 시작했어.' },
  { speaker: 'ai', text: '괜찮아. 오늘은 몇 시간 할 것 같아?' },
  { speaker: 'me', text: '4시간은 하고 싶은데 학원 끝나고 나면 피곤해서 잘 모르겠어.' },
  { speaker: 'ai', text: '그럼 오늘 약속 하나 정해볼까? 만약 ~하면 → ~한다 로.' },
  { speaker: 'me', text: '학원에서 오면 폰을 거실에 두고 들어갈게.' },
]

interface SubtitleListProps {
  messages: SubtitleMessage[]
}

/** 대화 내용을 말풍선으로 쌓아 보여줍니다. 새 말풍선이 생기면 맨 아래로 자동 스크롤됩니다. */
function SubtitleList({ messages }: SubtitleListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    // 목록 안쪽만 맨 아래로 내립니다. (scrollIntoView 는 화면 전체가 같이 움직일 수 있어서 쓰지 않습니다)
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  return (
    // role="log": 새 글자가 생기면 화면을 읽어 주는 프로그램이 알려 줍니다.
    <div
      ref={listRef}
      role="log"
      aria-label="대화 자막"
      className="mt-6 h-56 w-full overflow-y-auto rounded-2xl bg-white/10 p-3 text-left sm:h-64"
    >
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-indigo-100">
          AI 선생님이 말하면 여기에 글자로 나와요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn('flex', message.speaker === 'me' ? 'justify-end' : 'justify-start')}
            >
              {/* max-w-[80%] + break-words: 긴 말풍선도 화면 폭을 넘지 않고 안에서 줄바꿈됩니다. */}
              <p
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2 text-sm break-words sm:text-base',
                  message.speaker === 'me' ? 'bg-brand text-white' : 'bg-white/20 text-white',
                )}
              >
                {message.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** AI 선생님의 태도. 나중에 AI 가 정해 주면 아바타 모양이 바뀝니다. */
type AiMood = 'calm' | 'happy' | 'strict'

// 태도별 아바타 모양입니다. 새 태도를 추가할 때는 한 줄만 쓰면 됩니다.
const moodStyles: Record<AiMood, { emoji: string; ring: string; label: string }> = {
  calm: { emoji: '🙂', ring: 'bg-brand', label: '차분한 표정' },
  happy: { emoji: '😄', ring: 'bg-green-500', label: '기분 좋은 표정' },
  strict: { emoji: '😠', ring: 'bg-red-600', label: '엄한 표정' },
}

interface AiAvatarProps {
  mood?: AiMood
  className?: string
}

/** AI 선생님 얼굴입니다. mood(태도)에 따라 표정과 색이 바뀝니다. */
function AiAvatar({ mood = 'calm', className }: AiAvatarProps) {
  const style = moodStyles[mood]

  return (
    // 바깥 동그라미는 숨 쉬듯 깜빡여서 "말하는 중" 느낌을 줍니다.
    <div className="animate-pulse rounded-full bg-indigo-500/30 p-3">
      <div
        role="img"
        aria-label={style.label}
        className={cn(
          'flex h-28 w-28 items-center justify-center rounded-full text-5xl sm:h-32 sm:w-32',
          style.ring,
          className,
        )}
      >
        {style.emoji}
      </div>
    </div>
  )
}

/** 지난 초를 "02:14" 모양으로 바꿉니다. */
function formatCallTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * 통화 중 화면입니다. (탭·헤더 없이 화면 전체를 씁니다)
 * 통화 시간이 1초마다 올라가고, 끊기를 누르면 평가 결과 화면으로 갑니다.
 */
export function CallActivePage() {
  const navigate = useNavigate()
  const [seconds, setSeconds] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  // 지금은 AI 연결 전이라 고정값입니다. 나중에 AI 가 정한 태도를 여기에 넣으면 됩니다.
  const mood: AiMood = 'calm'
  const [messages, setMessages] = useState<SubtitleMessage[]>([])

  // 연습용: 3초마다 미리 적어 둔 말을 하나씩 추가합니다. (#34 연결 전까지만 사용)
  useEffect(() => {
    const timerId = setInterval(() => {
      setMessages((prev) => {
        if (prev.length >= sampleConversation.length) return prev
        return [...prev, { id: prev.length, ...sampleConversation[prev.length] }]
      })
    }, 3000)

    return () => clearInterval(timerId)
  }, [])

  useEffect(() => {
    const startedAt = Date.now()

    // 1초마다 +1 하면 탭이 백그라운드일 때 느려질 수 있어서, 시작 시각과의 차이로 계산합니다.
    const timerId = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    // 화면을 떠나면 타이머를 꼭 멈춥니다.
    return () => clearInterval(timerId)
  }, [])

  function handleToggleMute() {
    setIsMuted((prev) => !prev)
  }

  function handleHangUp() {
    navigate('/call/result')
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-900 px-4 py-10 text-white sm:px-6">
      <div className="flex w-full max-w-md flex-1 flex-col items-center text-center">
        <p className="text-sm text-indigo-100 sm:text-base">AI 선생님 · 통화 중</p>
        {/* tabular-nums: 숫자 폭을 똑같이 해서 시간이 올라갈 때 글자가 흔들리지 않습니다. */}
        <h1 className="mt-3 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
          {formatCallTime(seconds)}
        </h1>

        <div className="mt-8">
          <AiAvatar mood={mood} />
        </div>

        <SubtitleList messages={messages} />

        {/* mt-auto: 버튼을 화면 아래로 밀어냅니다. */}
        <div className="mt-auto flex w-full items-start justify-around pt-12">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-pressed={isMuted}
              aria-label={isMuted ? '음소거 해제' : '음소거'}
              className={cn(
                'flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border border-slate-400 text-2xl',
                isMuted ? 'bg-white text-slate-900' : 'bg-transparent text-white hover:bg-white/10',
              )}
            >
              <span aria-hidden>{isMuted ? '🔇' : '🎤'}</span>
            </button>
            <span className="text-sm font-medium">{isMuted ? '음소거 중' : '음소거'}</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleHangUp}
              aria-label="끊기"
              className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-red-600 text-2xl text-white hover:bg-red-700"
            >
              <span aria-hidden>✕</span>
            </button>
            <span className="text-sm font-medium">끊기</span>
          </div>
        </div>
      </div>
    </div>
  )
}
