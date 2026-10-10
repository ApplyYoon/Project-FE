/**
 * OpenAI Realtime API(GPT 음성)에 WebRTC(브라우저 기본 실시간 음성 연결)로 연결합니다.
 * React 를 쓰지 않는 순수 함수입니다. (연결 방법은 OpenAI 공식 문서 "Realtime API with WebRTC" 기준)
 *
 * 순서
 *  1. 우리 서버에서 "임시 키"를 받는다
 *  2. 마이크를 켜서 연결에 붙인다
 *  3. OpenAI 와 연결 정보(SDP)를 주고받는다
 *  4. AI 목소리를 받아 재생한다
 *
 * ⚠️ OpenAI API 키(sk-...)는 절대 이 코드나 .env 에 넣지 않습니다.
 *    브라우저는 서버가 만들어 준 짧게 쓰고 버리는 임시 키만 씁니다.
 */
import { parseTranscriptEvent, type TranscriptEvent } from '@/lib/transcript'

// 우리 서버에서 임시 키를 받는 주소입니다. ⚠️ 임시 값입니다. BE 와 정한 실제 주소로 바꾸세요.
// 서버는 { "value": "임시 키" } 모양으로 응답해야 합니다. (OpenAI 문서의 예시와 같은 모양)
const TOKEN_URL = '/realtime/token'

// OpenAI 와 SDP 를 주고받는 주소입니다. (문서의 현재 주소. 버전이 바뀌면 문서를 다시 확인하세요)
const OPENAI_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

/** 연결이 실패한 이유. 화면에서 이유별로 다른 안내를 보여주려고 나눕니다. */
export type RealtimeFailReason = 'token' | 'mic' | 'connect'

export class RealtimeCallError extends Error {
  reason: RealtimeFailReason

  constructor(reason: RealtimeFailReason, message: string) {
    super(message)
    this.name = 'RealtimeCallError'
    this.reason = reason
  }
}

/** 연결된 통화입니다. close() 를 부르면 연결과 마이크를 모두 정리합니다. */
export interface RealtimeCall {
  close: () => void
  /** true 면 내 마이크 소리를 AI 에게 보내지 않습니다. (마이크는 켜 둔 채 소리만 끊깁니다) */
  setMuted: (muted: boolean) => void
}

// 소리가 나지 않는 아주 짧은 파일입니다. (8000Hz 모노, 100샘플 = 0.0125초, 전부 무음)
const SILENT_WAV =
  'data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YcgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='

// AI 목소리를 재생하는 오디오 태그입니다. 통화가 시작되기 전에 미리 만들어 두고 같은 것을 계속 씁니다.
let callAudio: HTMLAudioElement | null = null

function getCallAudio(): HTMLAudioElement {
  if (callAudio === null) {
    callAudio = document.createElement('audio')
    // autoplay: 소리가 오면 바로 재생
    callAudio.autoplay = true
  }
  return callAudio
}

/**
 * 소리를 낼 수 있게 미리 허락받아 둡니다. "받기" 버튼을 누르는 그 순간(await 보다 앞)에 불러야 합니다.
 *
 * 아이폰 사파리는 사용자가 버튼을 직접 누른 순간이 아니면 소리 재생을 막습니다.
 * 그런데 AI 목소리는 받기를 누르고 한참 뒤(서버 연결 뒤)에 시작해서 막힐 수 있습니다.
 * 그래서 버튼을 누르는 순간에 무음 파일을 한 번 재생해 두면, 이 오디오 태그는 나중에도 소리를 낼 수 있습니다.
 */
export function unlockCallAudio(): void {
  const audio = getCallAudio()
  audio.src = SILENT_WAV
  audio.play().catch(() => {
    // 막혀도 통화는 계속되어야 하므로 에러를 던지지 않고 기록만 남깁니다.
    console.warn('[realtimeCall] 소리 재생 허락을 미리 받지 못했습니다.')
  })
}

/** 서버에서 임시 키를 받습니다. */
async function fetchEphemeralKey(): Promise<string> {
  try {
    const response = await fetch(TOKEN_URL)
    if (!response.ok) throw new Error(`status ${response.status}`)

    const data: unknown = await response.json()
    const value =
      typeof data === 'object' && data !== null ? (data as { value?: unknown }).value : null
    if (typeof value !== 'string' || value === '') throw new Error('임시 키가 없습니다')

    // sk- 로 시작하면 서버가 진짜 API 키를 그대로 내려준 것입니다. 노출 사고이므로 절대 쓰지 않고 멈춥니다.
    if (value.startsWith('sk-')) throw new Error('서버가 API 키를 그대로 보냈습니다')

    return value
  } catch (error) {
    // 에러 안에 키가 들어 있을 수 있어서 원문 대신 이유만 남깁니다.
    const detail = error instanceof Error ? error.message : '알 수 없는 오류'
    throw new RealtimeCallError('token', `임시 키를 받지 못했어요: ${detail}`)
  }
}

/** 마이크를 켭니다. 거부되면 'mic' 이유로 실패합니다. */
async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    throw new RealtimeCallError('mic', '마이크를 사용할 수 없어요')
  }
}

/** 통화를 시작할 때 넘길 수 있는 설정입니다. */
export interface StartCallOptions {
  /** 대화 글자(자막) 이벤트가 올 때마다 불립니다. (AI 말 · 내 말) */
  onTranscript?: (event: TranscriptEvent) => void
}

/**
 * AI 와 음성 통화를 시작합니다. 연결되면 AI 가 먼저 인사합니다.
 * 중간에 실패하면 이미 켠 마이크·연결을 모두 정리하고 RealtimeCallError 를 던집니다.
 */
export async function startRealtimeCall(options: StartCallOptions = {}): Promise<RealtimeCall> {
  const ephemeralKey = await fetchEphemeralKey()
  const microphone = await openMicrophone()

  const peerConnection = new RTCPeerConnection()
  // 화면에는 안 보이고 소리만 나는 오디오 태그입니다. (unlockCallAudio 가 미리 만들어 둔 것과 같은 태그입니다)
  const audioElement = getCallAudio()

  // 연결을 끝낼 때 한 곳에서 전부 정리합니다. (여러 번 불러도 안전합니다)
  let dataChannel: RTCDataChannel | null = null
  function close() {
    dataChannel?.close()
    microphone.getTracks().forEach((track) => track.stop())
    peerConnection.close()
    audioElement.srcObject = null
  }

  try {
    // AI 목소리가 들어오면 오디오 태그에 연결합니다.
    peerConnection.ontrack = (event) => {
      audioElement.srcObject = event.streams[0]
      // autoplay 만 믿지 않고 한 번 더 재생을 시킵니다. (사파리 대비. 막혀도 통화는 계속됩니다)
      audioElement.play().catch(() => {
        console.warn('[realtimeCall] AI 목소리를 재생하지 못했습니다.')
      })
    }

    // 내 마이크 소리를 연결에 붙입니다.
    microphone.getTracks().forEach((track) => peerConnection.addTrack(track, microphone))

    // 이벤트(글자·명령)를 주고받는 통로입니다. 이름 'oai-events' 는 OpenAI 가 정해 둔 값입니다.
    dataChannel = peerConnection.createDataChannel('oai-events')
    const channel = dataChannel
    // 통로가 열리면 AI 에게 "말을 시작해"라고 알려서 첫 인사가 나오게 합니다.
    // (공식 문서에 인사 방법이 따로 없어서 response.create 이벤트를 쓴 것입니다. 실제 서버로 확인이 필요합니다)
    channel.addEventListener('open', () => {
      // 내 말을 글자로 바꾸는 기능은 기본이 꺼져 있어서 켭니다. (공식 문서의 session.update 예시를 따랐습니다)
      // BE 가 임시 키를 만들 때 같은 설정(audio.input.transcription)을 넣어 준다면 이 부분은 지워도 됩니다.
      // ⚠️ 실제 서버로는 아직 확인하지 못했습니다.
      channel.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            audio: { input: { transcription: { model: 'gpt-4o-transcribe', language: 'ko' } } },
          },
        }),
      )
      channel.send(JSON.stringify({ type: 'response.create' }))
    })

    // 서버가 보내는 이벤트 중 대화 글자만 골라서 화면에 알려줍니다.
    channel.addEventListener('message', (event: MessageEvent) => {
      const transcriptEvent = parseTranscriptEvent(event.data)
      if (transcriptEvent) options.onTranscript?.(transcriptEvent)
    })

    // 연결 정보(SDP)를 만들어 OpenAI 에 보내고, 받은 답을 적용합니다.
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    const answerResponse = await fetch(OPENAI_CALLS_URL, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
    })
    if (!answerResponse.ok) throw new Error(`status ${answerResponse.status}`)

    await peerConnection.setRemoteDescription({ type: 'answer', sdp: await answerResponse.text() })
  } catch {
    close()
    throw new RealtimeCallError('connect', 'AI 와 연결하지 못했어요')
  }

  // 마이크 트랙의 enabled 를 false 로 하면 연결은 그대로 두고 소리만 무음으로 바뀝니다.
  function setMuted(muted: boolean) {
    microphone.getAudioTracks().forEach((track) => {
      track.enabled = !muted
    })
  }

  return { close, setMuted }
}
