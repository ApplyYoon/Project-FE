/**
 * "처음의 다짐" 을 내 목소리(와 글)로 남겨 두는 기능의 규칙과 저장입니다. (#241)
 * 그만두고 싶어지는 순간에 "그때의 내 목소리" 를 다시 들려주려는 것입니다.
 *
 * ⚠️ 녹음은 이 기기에만 저장합니다. 서버로 보내지 않고, AI 에게도 보내지 않습니다.
 *    목소리는 민감한 정보라서입니다. 그래서 이 파일은 api() 를 쓰지 않습니다. 앞으로도 쓰면 안 됩니다.
 */
import { getTodayKey } from '@/lib/date'
import { loadData, removeData, saveData } from '@/lib/storage'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-voice-pledge' 가 됩니다)
const STORAGE_KEY = 'voice-pledge'

/** 녹음할 수 있는 가장 긴 시간 (초). 이 시간이 되면 저절로 멈춥니다. */
export const MAX_RECORD_SECONDS = 30
/**
 * 녹음 음질 (1초에 쓰는 비트 수). 일부러 낮게 잡아서 크기를 줄입니다.
 * 16,000 이면 30초에 약 60KB 입니다. 저장소(localStorage)는 5MB 뿐이라 크게 저장하면 안 됩니다. (목소리를 알아듣기에는 충분합니다)
 */
export const RECORD_BITS_PER_SECOND = 16000
/** 글로 남기는 한마디의 최대 글자 수 */
export const PLEDGE_TEXT_MAX_LENGTH = 50

/** 저장해 두는 처음의 다짐 */
export interface VoicePledge {
  /** 녹음한 소리. 'data:audio/webm;base64,…' 처럼 소리를 글자로 바꾼 것입니다. 녹음하지 않았으면 null */
  audioDataUrl: string | null
  /** 녹음 길이 (초). 녹음이 없으면 0 */
  seconds: number
  /** 글로 남긴 한마디. 없으면 빈 글자 */
  text: string
  /** 남긴 날짜 (예: '2026-10-10') */
  recordedDate: string
}

/**
 * 이 브라우저에서 녹음할 수 있는지 알려줍니다.
 * 마이크를 쓰는 기능(getUserMedia)과 녹음하는 기능(MediaRecorder)이 둘 다 있어야 합니다.
 * (https 주소나 localhost 가 아니면 mediaDevices 자체가 없습니다)
 */
export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

// 브라우저마다 녹음할 수 있는 형식이 다릅니다. 크롬·안드로이드는 webm, 아이폰 사파리는 mp4 입니다.
const MIME_TYPE_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

/**
 * 이 브라우저가 녹음할 수 있는 소리 형식을 고릅니다. 맞는 것이 없으면 undefined 이고,
 * 그때는 형식을 정하지 않고 브라우저의 기본 형식으로 녹음합니다.
 */
export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

/**
 * 초를 '0:24' 모양으로 바꿉니다.
 *
 *   formatSeconds(0)  -> '0:00'
 *   formatSeconds(7)  -> '0:07'
 *   formatSeconds(30) -> '0:30'
 *   formatSeconds(75) -> '1:15'
 */
export function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
}

/**
 * 녹음 결과(Blob = 소리 덩어리)를 저장할 수 있는 글자(data URL)로 바꿉니다.
 * localStorage 에는 글자만 넣을 수 있어서 이렇게 바꿔야 saveData 로 저장할 수 있습니다.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('녹음을 글자로 바꾸지 못했습니다'))
    }
    reader.onerror = () => reject(new Error('녹음을 읽지 못했습니다'))
    reader.readAsDataURL(blob)
  })
}

/** 저장소에서 꺼낸 값이 우리가 저장한 모양이 맞는지 확인합니다. (깨진 값을 그대로 쓰면 재생하다 멈춥니다) */
function isVoicePledge(value: unknown): value is VoicePledge {
  if (typeof value !== 'object' || value === null) return false
  const pledge = value as Record<string, unknown>
  const hasValidAudio =
    pledge.audioDataUrl === null ||
    (typeof pledge.audioDataUrl === 'string' && pledge.audioDataUrl.startsWith('data:audio/'))

  return (
    hasValidAudio &&
    typeof pledge.seconds === 'number' &&
    Number.isFinite(pledge.seconds) &&
    typeof pledge.text === 'string' &&
    typeof pledge.recordedDate === 'string'
  )
}

/** 저장해 둔 처음의 다짐을 불러옵니다. 없거나 값이 깨져 있으면 null 입니다. */
export function loadVoicePledge(): VoicePledge | null {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  return isVoicePledge(saved) ? saved : null
}

/**
 * 처음의 다짐을 저장합니다. 정말 저장됐으면 true, 못 했으면 false 입니다.
 *
 * saveData 는 저장 공간이 가득 차도 에러를 던지지 않고 넘어갑니다. 그래서 저장한 뒤에 다시 읽어서 확인합니다.
 * false 가 오면 화면에서 "저장하지 못했어요" 를 알려 주세요.
 */
export function saveVoicePledge(input: {
  audioDataUrl: string | null
  seconds: number
  text: string
}): boolean {
  const pledge: VoicePledge = {
    audioDataUrl: input.audioDataUrl,
    seconds: input.audioDataUrl === null ? 0 : input.seconds,
    text: input.text.trim().slice(0, PLEDGE_TEXT_MAX_LENGTH),
    recordedDate: getTodayKey(),
  }
  saveData(STORAGE_KEY, pledge)

  const saved = loadVoicePledge()
  return saved !== null && saved.audioDataUrl === pledge.audioDataUrl && saved.text === pledge.text
}

/** 처음의 다짐을 지웁니다. 정말 사라졌으면 true 입니다. */
export function removeVoicePledge(): boolean {
  return removeData(STORAGE_KEY)
}
