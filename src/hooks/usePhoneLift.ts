import { isInApp, onAppMessage, requestFromApp, sendToApp } from '@/lib/appBridge'
import {
  getLiftNudges,
  getLiftStage,
  readDndState,
  readPhoneSummary,
  shouldTurnOnDnd,
  type LiftStage,
  type LiftStrength,
  type PhoneLiftSummary,
} from '@/lib/liftAlerts'
import { useEffect, useRef, useState } from 'react'

interface UsePhoneLiftOptions {
  /** 공부 세션이 열려 있는지 (일시정지 중이어도 true) */
  isActive: boolean
  /** 일시정지 중인지. 멈춰 있는 동안은 경고하지 않습니다. */
  isPaused: boolean
  /** 지금 시각 (타이머가 1초마다 바꿔 줌) */
  now: number
  /** 경고 세기 (lib/liftAlerts.ts 의 getLiftStrength) */
  strength: LiftStrength
  /** 세션이 끝나 앱이 잰 숫자를 받았을 때 (앱 밖이거나 답이 없으면 부르지 않음) */
  onEnd: (summary: PhoneLiftSummary) => void
}

// 'focus.end' 답을 기다리는 시간. 앱이 숫자를 정리하는 데 길게 걸리지 않습니다.
const END_TIMEOUT_MS = 3000

/** 앱에 보낼 'focus.start' 내용 (경고 세기마다 알림 문구 · 방해 금지가 다름) */
function focusStartPayload(strength: LiftStrength) {
  // 폰을 든 채 앱을 나가면 띄울 알림 문구도 같이 보냅니다. 누르면 타이머로 돌아옵니다.
  // 관리 강도가 '강' 이면 휴대폰 방해 금지도 켭니다(안드로이드). 끝나면 앱이 원래대로 되돌립니다.
  return { nudges: getLiftNudges(strength), url: '/timer', dnd: shouldTurnOnDnd(strength) }
}

// "폰을 엎어 줘" 화면(CardTimerPage 의 PhoneFlipView)이 세션보다 먼저 보낸 'focus.start' 의 답.
// 이어서 열리는 세션(usePhoneLift)이 이것을 그대로 이어받아서 'focus.start' 를 두 번 보내지 않습니다.
// (두 번 보내면 앱이 세션을 새로 열어서 방해 금지가 잠깐 꺼졌다 켜집니다 — 브릿지 v1.4)
let earlyStartReply: Promise<unknown> | null = null

/**
 * 세션을 시작하기 전에 앱의 "폰 엎어 두기" 센서를 먼저 켭니다. (폰을 엎는 순간을 알아야 해서)
 * 엎으면 앱이 'focus.down' (liftedMs: 0) 을 한 번 보냅니다. 앱의 답(센서가 있는지 등)을 돌려줍니다. 앱 밖이면 null
 */
export function startPhoneFocusEarly(strength: LiftStrength): Promise<unknown> {
  if (!isInApp()) return Promise.resolve(null)
  earlyStartReply = requestFromApp('focus.start', focusStartPayload(strength))
  return earlyStartReply
}

/** 먼저 켠 센서를 세션 없이 끕니다. (엎기 화면에서 [취소] 하거나 다른 화면으로 갔을 때) */
export function cancelPhoneFocusEarly(): void {
  if (earlyStartReply === null) return
  earlyStartReply = null
  sendToApp('focus.end', {})
}

/**
 * 공부 세션 동안 앱(Project-App)의 "폰 엎어 두기" 센서를 켜고, 들고 있는 시간으로 경고 단계를 알려 줍니다. (브릿지 v1.3)
 * 앱 밖(컴퓨터 · 모바일 웹)에서는 아무것도 하지 않고 단계는 늘 0 입니다.
 *
 *   const phone = usePhoneLift({ isActive, isPaused, now, strength, onEnd: setPhoneSummary })
 *   phone.stage        // 0 조용 · 1 안내 · 2 화면 전체 경고 · 3 자동 일시정지 할 때
 *   phone.liftedSeconds
 *   phone.dismiss()    // "잠깐만" — 이번에 든 것은 더 경고하지 않음
 *
 * 세션이 끝나면(isActive 가 false 가 되거나 화면을 떠나면) 앱에 'focus.end' 를 보내고, 답이 오면 onEnd 를 부릅니다.
 * 진동은 단계가 올라갈 때 한 번씩 이 훅이 앱에 부탁합니다. 화면 표시 · 일시정지는 쓰는 쪽(SessionView)이 합니다.
 */
export function usePhoneLift({ isActive, isPaused, now, strength, onEnd }: UsePhoneLiftOptions) {
  const inApp = isInApp()
  // 폰을 집어 든 시각. 엎어 둔 상태거나 아직 한 번도 안 엎었으면 null
  const [liftedAt, setLiftedAt] = useState<number | null>(null)
  // "잠깐만" 을 누른 들림의 시각. 같은 들림에는 다시 경고하지 않습니다.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  // 방해 금지 상태 (앱의 'focus.start' 답). 권한이 없으면 'noPermission' 이라 화면에서 권한 열기를 안내합니다.
  const [dndState, setDndState] = useState<ReturnType<typeof readDndState>>(null)
  // onEnd 는 화면을 다시 그릴 때마다 새로 만들어질 수 있어서, 가장 최근 것을 담아 둡니다.
  // (그래야 세션을 시작 · 끝내는 아래 useEffect 가 onEnd 때문에 다시 돌지 않습니다)
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  })

  // 세션이 열리면 앱에 "재기 시작" 을 보내고, 들고 놓는 쪽지를 듣습니다. 세션이 끝나면 숫자를 받아 옵니다.
  useEffect(() => {
    if (!isActive || !inApp) return
    // 엎기 화면이 먼저 보냈으면 그 답을 이어받고, 아니면(엎기 없이 시작 · 새로고침) 지금 보냅니다.
    const startReply = earlyStartReply ?? requestFromApp('focus.start', focusStartPayload(strength))
    earlyStartReply = null
    void startReply.then((reply) => setDndState(readDndState(reply)))
    const stopListening = onAppMessage((message) => {
      if (message.type === 'focus.lifted') setLiftedAt(message.payload.at)
      if (message.type === 'focus.down') setLiftedAt(null)
    })
    return () => {
      stopListening()
      setLiftedAt(null)
      setDndState(null)
      // 세션이 끝났거나 화면을 떠났습니다. 앱의 세션을 닫고, 답으로 온 숫자를 넘깁니다.
      void requestFromApp('focus.end', {}, END_TIMEOUT_MS).then((reply) => {
        const summary = readPhoneSummary(reply)
        if (summary !== null) onEndRef.current(summary)
      })
    }
  }, [isActive, inApp, strength])

  const isDismissed = liftedAt !== null && dismissedAt === liftedAt
  const liftedMs = liftedAt === null || isPaused ? 0 : Math.max(0, now - liftedAt)
  const stage: LiftStage = isDismissed ? 0 : getLiftStage(liftedMs, strength)

  // 단계가 올라갈 때마다 한 번 진동합니다. (1단계는 가볍게, 2단계 이상은 세게)
  const previousStage = useRef<LiftStage>(0)
  useEffect(() => {
    if (stage > previousStage.current && stage >= 1) {
      sendToApp('haptics', { kind: stage === 1 ? 'warning' : 'error' })
    }
    previousStage.current = stage
  }, [stage])

  function dismiss() {
    setDismissedAt(liftedAt)
  }

  return {
    /** 앱 안이라 폰 센서를 쓸 수 있는지 */
    isAvailable: inApp,
    stage,
    /** 방해 금지 상태. 'noPermission' 이면 권한 열기를 안내합니다. 앱 밖이면 null */
    dndState,
    /** 안드로이드 "방해 금지 접근" 설정 화면을 엽니다. 허락하고 돌아오면 다음 세션부터 켜집니다. */
    openDndSettings: () => sendToApp('focus.openSettings', {}),
    /** 들고 있은 시간 (초). 엎어 둔 상태면 0 */
    liftedSeconds: Math.floor(liftedMs / 1000),
    dismiss,
  }
}
