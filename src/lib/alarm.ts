/**
 * 구간이 끝났을 때 짧은 알림음과 진동으로 알려줍니다.
 *
 * 브라우저나 기기가 지원하지 않거나 막아 둔 경우(예: 아이폰은 진동 없음)에는
 * 에러 없이 조용히 넘어갑니다. 화면 안내가 따로 있으니 소리는 "있으면 좋은 것"입니다.
 */
export function playAlarm(): void {
  // 진동: 지원하는 기기에서만 있습니다. (200ms 진동 - 100ms 쉬기 - 200ms 진동)
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200])
  }

  try {
    // 소리 파일 없이 브라우저가 직접 "삐-" 소리를 만들게 합니다.
    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const volume = audioContext.createGain()

    oscillator.frequency.value = 880 // 높낮이(Hz). 880 은 '라' 음입니다.
    volume.gain.value = 0.2 // 소리 크기 (0 ~ 1)

    oscillator.connect(volume)
    volume.connect(audioContext.destination)

    // 사용자가 화면을 아직 안 눌렀다면 브라우저가 소리를 막아 두고 있어서 먼저 깨워 줍니다.
    void audioContext.resume()
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.4)
    // 소리가 끝나면 오디오 장치를 놓아 줍니다.
    oscillator.onended = () => void audioContext.close()
  } catch {
    // 소리를 못 내도 앱은 계속 돌아가야 합니다.
    console.warn('[alarm] 알림음을 재생하지 못했습니다.')
  }
}
