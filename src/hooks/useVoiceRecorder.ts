import {
  MAX_RECORD_SECONDS,
  RECORD_BITS_PER_SECOND,
  blobToDataUrl,
  isRecordingSupported,
  pickRecordingMimeType,
} from '@/lib/voicePledge'
import { useEffect, useRef, useState } from 'react'

/**
 * 녹음기의 상태
 *   idle       쉬는 중 (녹음 전이거나 녹음을 마침)
 *   recording  녹음 중
 *   denied     마이크를 쓸 수 없음 (권한을 거부했거나 마이크가 없음)
 */
export type RecorderStatus = 'idle' | 'recording' | 'denied'

/** 녹음을 마쳤을 때 넘겨주는 결과 */
export interface RecordedAudio {
  /** 녹음한 소리를 글자로 바꾼 것 (저장할 수 있는 모양) */
  dataUrl: string
  /** 녹음 길이 (초) */
  seconds: number
}

/**
 * 마이크로 짧게 녹음하는 훅입니다. 브라우저 기본 기능인 MediaRecorder 를 씁니다. (라이브러리 없음)
 * 정해 둔 시간(30초)이 되면 저절로 멈추고, 녹음이 끝나면 onRecorded 로 결과를 넘겨줍니다.
 *
 *   const { status, seconds, isSupported, start, stop } = useVoiceRecorder((audio) => setAudio(audio))
 *
 * 녹음한 소리는 이 훅이 어디에도 보내지 않습니다. 넘겨받은 쪽이 기기에 저장만 합니다. (lib/voicePledge.ts)
 */
export function useVoiceRecorder(onRecorded: (audio: RecordedAudio) => void) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  // 지금까지 녹음한 시간 (초). 화면의 "0:07 / 0:30" 에 씁니다.
  const [seconds, setSeconds] = useState(0)

  // useRef: 화면을 다시 그려도 값이 유지되는 "보관함" 입니다. 바뀌어도 화면을 다시 그리지 않습니다.
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  // 녹음이 끝났을 때 부를 함수는 항상 "가장 최근 것" 을 써야 해서 보관함에 넣어 둡니다.
  const onRecordedRef = useRef(onRecorded)
  useEffect(() => {
    onRecordedRef.current = onRecorded
  }, [onRecorded])

  /** 시간을 세던 것을 멈추고 마이크를 끕니다. (마이크를 안 끄면 브라우저의 "녹음 중" 표시가 계속 남습니다) */
  function releaseMicrophone() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  /** 녹음을 멈춥니다. 멈추면 MediaRecorder 가 onstop 을 불러서 결과를 넘겨줍니다. */
  function stop() {
    const recorder = recorderRef.current
    if (recorder !== null && recorder.state !== 'inactive') recorder.stop()
  }

  /** 녹음을 시작합니다. 처음이면 브라우저가 마이크를 써도 되는지 묻습니다. */
  async function start() {
    if (status === 'recording' || !isRecordingSupported()) return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // 권한을 거부했거나 마이크가 없는 경우입니다. 화면은 글로 남기는 칸만 보여줍니다.
      setStatus('denied')
      return
    }

    const mimeType = pickRecordingMimeType()
    const recorder = new MediaRecorder(stream, {
      audioBitsPerSecond: RECORD_BITS_PER_SECOND,
      // 맞는 형식을 못 찾았으면 적지 않고 브라우저의 기본 형식을 씁니다.
      ...(mimeType !== undefined && { mimeType }),
    })
    // 녹음된 소리는 조각으로 나뉘어 옵니다. 모아 두었다가 끝날 때 하나로 합칩니다.
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const elapsedSeconds = Math.round((Date.now() - startedAtRef.current) / 1000)
      releaseMicrophone()
      recorderRef.current = null
      setStatus('idle')

      const blob = new Blob(chunks, { type: recorder.mimeType })
      // 소리가 하나도 안 담겼으면(아주 짧게 눌렀다 뗀 경우) 결과를 넘기지 않습니다.
      if (blob.size === 0) return
      blobToDataUrl(blob)
        .then((dataUrl) => {
          onRecordedRef.current({
            dataUrl,
            // 1초보다 짧아도 1초로, 30초를 조금 넘겨도 30초로 맞춥니다.
            seconds: Math.min(Math.max(elapsedSeconds, 1), MAX_RECORD_SECONDS),
          })
        })
        .catch(() => {
          // 글자로 바꾸지 못하면 녹음하지 않은 것과 같게 둡니다. (다시 녹음하면 됩니다)
        })
    }

    recorderRef.current = recorder
    streamRef.current = stream
    startedAtRef.current = Date.now()
    setSeconds(0)
    setStatus('recording')
    recorder.start()

    // 0.25초마다 흐른 시간을 다시 계산합니다. (1초마다 1씩 더하면 화면이 멈칫할 때 시간이 밀립니다)
    timerRef.current = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setSeconds(Math.min(elapsedSeconds, MAX_RECORD_SECONDS))
      if (elapsedSeconds >= MAX_RECORD_SECONDS) stop()
    }, 250)
  }

  // 녹음하는 도중에 화면을 떠나면 마이크를 끄고, 결과는 넘기지 않습니다.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder !== null) {
        recorder.onstop = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      releaseMicrophone()
    }
  }, [])

  return { status, seconds, isSupported: isRecordingSupported(), start, stop }
}
