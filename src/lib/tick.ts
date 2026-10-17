/**
 * 카운트다운의 "째깍" 소리입니다. 짧게 한 번 울립니다. (#399)
 * 소리 파일 없이 브라우저가 만들고, 지원하지 않거나 막혀 있으면 조용히 넘어갑니다.
 */
export function playTick(): void {
  try {
    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const volume = audioContext.createGain()
    oscillator.frequency.value = 1200 // 높고 짧은 소리
    volume.gain.value = 0.08
    oscillator.connect(volume)
    volume.connect(audioContext.destination)
    void audioContext.resume()
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.05)
    oscillator.onended = () => void audioContext.close()
  } catch {
    // 소리를 못 내도 카운트다운은 그대로 갑니다.
  }
}
