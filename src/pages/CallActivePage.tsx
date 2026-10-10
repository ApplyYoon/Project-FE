import { cn } from '@/lib/cn'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

        <div className="mt-12">
          <AiAvatar mood={mood} />
        </div>

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
