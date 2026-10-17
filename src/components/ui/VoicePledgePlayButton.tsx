import { cn } from '@/lib/cn'
import { formatSeconds } from '@/lib/voicePledge'
import { useEffect, useRef, useState } from 'react'

interface VoicePledgePlayButtonProps {
  /** 들려줄 소리 (lib/voicePledge.ts 의 audioDataUrl) */
  audioDataUrl: string
  /** 녹음 길이 (초). 버튼에 '0:24' 로 보여줍니다. */
  seconds: number
  /** 버튼 글자. 기본은 '처음의 나 듣기' */
  label?: string
  className?: string
}

/**
 * 처음에 녹음해 둔 내 목소리를 들려주는 버튼입니다. (#241) 한 번 누르면 재생, 다시 누르면 멈춥니다.
 * 그만하기 확인 창 · 홈의 "처음의 나" 카드 · 설정에서 같이 씁니다.
 *
 * <VoicePledgePlayButton audioDataUrl={pledge.audioDataUrl} seconds={pledge.seconds} />
 */
export function VoicePledgePlayButton({
  audioDataUrl,
  seconds,
  label = '처음의 나 듣기',
  className,
}: VoicePledgePlayButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  // 재생 중인 소리. 화면에 보이지 않는 오디오 객체라 보관함(useRef)에 넣어 둡니다.
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /** 재생을 멈추고 처음으로 되돌립니다. */
  function stopPlaying() {
    audioRef.current?.pause()
    audioRef.current = null
    setIsPlaying(false)
  }

  function handleClick() {
    if (isPlaying) {
      stopPlaying()
      return
    }

    const audio = new Audio(audioDataUrl)
    // 끝까지 다 들으면 버튼을 "듣기" 로 되돌립니다.
    audio.onended = stopPlaying
    audioRef.current = audio
    setIsPlaying(true)
    // 재생이 막히면(소리 파일이 깨졌거나 브라우저가 막은 경우) 조용히 멈춘 상태로 돌아갑니다.
    audio.play().catch(stopPlaying)
  }

  // 화면을 떠나면 소리도 멈춥니다. (안 멈추면 다른 화면에서도 계속 들립니다)
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isPlaying}
      className={cn(
        // h-10 = 40px. 손가락으로 누르기 쉬운 높이입니다.
        'text-brand inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors hover:bg-slate-50',
        className,
      )}
    >
      {/* 세모(재생)와 네모(멈춤)는 꾸밈이라 스크린리더는 읽지 않고, 뒤의 글자를 읽습니다. */}
      <span aria-hidden>{isPlaying ? '■' : '▶'}</span>
      {isPlaying ? '멈추기' : `${label} · ${formatSeconds(seconds)}`}
    </button>
  )
}
