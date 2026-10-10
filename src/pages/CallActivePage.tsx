import { careThemes, pickGreeting, type CareLevel } from '@/lib/careTheme'
import { cn } from '@/lib/cn'
import { RealtimeCallError, startRealtimeCall, type RealtimeCall } from '@/lib/realtimeCall'
import { getTodayCareLevel, getTodayMaxHarshness } from '@/lib/todayCare'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** 수신 화면이 넘겨준 인사말을 꺼냅니다. 없거나 모양이 다르면 null 입니다. */
function readGreeting(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const greeting = (state as { greeting?: unknown }).greeting
  return typeof greeting === 'string' ? greeting : null
}

/** 연결 실패를 학생(사용자)이 이해할 수 있는 문구로 바꿉니다. */
function getFailMessage(error: unknown) {
  if (error instanceof RealtimeCallError) {
    if (error.reason === 'mic') return '마이크를 사용할 수 없어요. 마이크 권한을 확인해 주세요.'
    if (error.reason === 'token') return 'AI 연결 준비에 실패했어요. 잠시 뒤에 다시 시도해 주세요.'
  }
  return 'AI 와 연결하지 못했어요. 끊고 다시 시도해 주세요.'
}

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

interface AiAvatarProps {
  careLevel: CareLevel
}

/** AI 선생님 얼굴입니다. 관리 강도(careLevel)에 따라 표정과 색이 바뀝니다. */
function AiAvatar({ careLevel }: AiAvatarProps) {
  const theme = careThemes[careLevel]

  return (
    // 바깥 동그라미는 숨 쉬듯 깜빡여서 "말하는 중" 느낌을 줍니다.
    <div className={cn('animate-pulse rounded-full p-3', theme.avatarGlow)}>
      <div
        role="img"
        aria-label={theme.avatarLabel}
        className={cn(
          'flex h-28 w-28 items-center justify-center rounded-full text-5xl sm:h-32 sm:w-32',
          theme.avatarBackground,
        )}
      >
        {theme.avatarEmoji}
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
  const location = useLocation()
  const [seconds, setSeconds] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  // 오늘의 관리 강도입니다. 아직 진짜 값이 없어서 고정값이에요. (자세한 건 todayCare.ts)
  // 0~3 으로 바꿔 보면 색·표정·인사말이 달라집니다.
  const careLevel = getTodayCareLevel()
  const theme = careThemes[careLevel]
  // 수신 화면에서 보여준 인사말을 그대로 이어서 씁니다. (없으면 새로 고릅니다)
  // useState 안에서 한 번만 정합니다. (그냥 호출하면 1초마다 화면이 다시 그려질 때 인사말이 바뀝니다)
  const [greeting] = useState(
    () => readGreeting(location.state) ?? pickGreeting(careLevel, getTodayMaxHarshness()),
  )
  // AI 와의 연결 상태. 연결 중 → 연결됨, 실패하면 error 와 안내 문구
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [errorMessage, setErrorMessage] = useState('')
  // 연결된 통화를 들고 있습니다. 음소거 버튼이 이 통화의 마이크를 끄고 켜야 해서 useEffect 밖에서도 접근합니다.
  const callRef = useRef<RealtimeCall | null>(null)

  // 화면이 열리면 AI 와 음성 연결을 시작하고, 화면을 떠나면(끊기·뒤로가기) 연결과 마이크를 정리합니다.
  useEffect(() => {
    let isCancelled = false
    let call: RealtimeCall | null = null

    startRealtimeCall()
      .then((startedCall) => {
        // 연결되는 사이에 이미 화면을 떠났다면 바로 정리합니다.
        if (isCancelled) {
          startedCall.close()
          return
        }
        call = startedCall
        callRef.current = startedCall
        setConnection('connected')
      })
      .catch((error: unknown) => {
        if (isCancelled) return
        setConnection('error')
        setErrorMessage(getFailMessage(error))
      })

    return () => {
      isCancelled = true
      callRef.current = null
      call?.close()
    }
  }, [])

  // 음소거 상태를 실제 마이크에 반영합니다.
  // 연결되기 전에 음소거를 눌렀어도, 연결이 끝나는 순간(connection 이 바뀔 때) 다시 적용됩니다.
  useEffect(() => {
    callRef.current?.setMuted(isMuted)
  }, [isMuted, connection])

  const [messages, setMessages] = useState<SubtitleMessage[]>([])

  // 연습용: 3초마다 미리 적어 둔 말을 하나씩 추가합니다. (AI 연결 후 실제 글자로 바꿀 때까지만 사용)
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
    // 화면을 떠나면 위 useEffect 의 정리 코드가 연결과 마이크를 끕니다.
    navigate('/call/result')
  }

  return (
    <div
      className={cn(
        'flex min-h-screen flex-col items-center px-4 py-10 text-white sm:px-6',
        theme.pageBackground,
      )}
    >
      <div className="flex w-full max-w-md flex-1 flex-col items-center text-center">
        <p className="text-sm text-indigo-100 sm:text-base">
          AI 선생님 · {connection === 'connecting' ? '연결 중…' : '통화 중'}
        </p>
        {/* tabular-nums: 숫자 폭을 똑같이 해서 시간이 올라갈 때 글자가 흔들리지 않습니다. */}
        <h1 className="mt-3 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
          {formatCallTime(seconds)}
        </h1>

        <div className="mt-8">
          <AiAvatar careLevel={careLevel} />
        </div>

        <p className="mt-8 text-lg break-keep sm:text-xl">&quot;{greeting}&quot;</p>

        {connection === 'error' && (
          // role="alert": 실패하면 화면을 읽어 주는 프로그램이 바로 알려 줍니다.
          <p role="alert" className="mt-6 rounded-lg bg-red-600/20 px-4 py-3 text-sm break-keep">
            {errorMessage}
          </p>
        )}

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
