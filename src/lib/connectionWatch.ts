/**
 * 통화 연결 상태(RTCPeerConnection.connectionState)를 지켜보다가, 연결이 끊어지면 한 번만 알려줍니다.
 * React 와 WebRTC 에 의존하지 않는 순수 코드라서, 가짜 상태값으로 동작을 확인할 수 있습니다.
 *
 * 연결 상태 값: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
 *  - failed: 연결이 완전히 실패했어요 → 바로 알립니다.
 *  - disconnected: 잠깐 끊겼어요. 와이파이가 바뀔 때처럼 금방 돌아오기도 해서, 잠시 기다려 보고 알립니다.
 */

// "잠깐 끊김"이 이 시간(밀리초)을 넘게 이어지면 끊긴 것으로 봅니다.
export const DISCONNECT_GRACE_MS = 5000

export interface ConnectionWatcher {
  /** 연결 상태가 바뀔 때마다 새 상태를 넘겨 주세요. */
  handleStateChange: (state: string) => void
  /** 지켜보기를 멈춥니다. (통화를 직접 끝낼 때 불러서, 끝낸 뒤에는 아무것도 알리지 않게 합니다) */
  stop: () => void
}

/**
 * onDisconnect 는 연결이 끊어졌을 때 딱 한 번 불립니다.
 * wasConnected 가 true 면 "통화 중에 끊김", false 면 "처음부터 연결에 실패"입니다.
 */
export function createConnectionWatcher(
  onDisconnect: (wasConnected: boolean) => void,
  graceMs: number = DISCONNECT_GRACE_MS,
): ConnectionWatcher {
  let hasConnected = false
  let isDone = false // 이미 알렸거나 지켜보기를 멈췄으면 true
  let graceTimerId: ReturnType<typeof setTimeout> | undefined

  function notify() {
    if (isDone) return
    isDone = true
    clearTimeout(graceTimerId)
    onDisconnect(hasConnected)
  }

  return {
    handleStateChange(state) {
      if (isDone) return

      if (state === 'connected') {
        hasConnected = true
        // 잠깐 끊겼다가 돌아왔으니 기다리던 것을 취소합니다.
        clearTimeout(graceTimerId)
        graceTimerId = undefined
        return
      }

      if (state === 'failed') {
        notify()
        return
      }

      if (state === 'disconnected' && graceTimerId === undefined) {
        graceTimerId = setTimeout(notify, graceMs)
      }
    },

    stop() {
      isDone = true
      clearTimeout(graceTimerId)
    },
  }
}
