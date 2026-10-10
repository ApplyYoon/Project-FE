import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToggle } from '@/hooks/useToggle'
import { careThemes, pickGreeting } from '@/lib/careTheme'
import { cn } from '@/lib/cn'
import { getTodayCareLevel, getTodayMaxHarshness } from '@/lib/todayCare'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// 마이크를 못 쓰는 이유. denied: 사용자가 거부함 / unavailable: 마이크가 없거나 쓸 수 없는 주소
type MicError = 'denied' | 'unavailable'

/**
 * AI 전화 수신 화면입니다. (탭·헤더 없이 화면 전체를 씁니다)
 * 받기 → 마이크 권한 요청 → 통화 중 화면, 거절 → 확인 팝업을 거쳐 홈으로 갑니다.
 * 마이크를 못 쓰면 켜는 방법 안내 화면으로 바뀝니다.
 */
export function CallPage() {
  const navigate = useNavigate()
  const [isRejectOpen, toggleReject] = useToggle(false)
  const [micError, setMicError] = useState<MicError | null>(null)
  // 권한 창이 떠 있는 동안 받기를 또 누르지 못하게 합니다.
  const [isRequesting, setIsRequesting] = useState(false)
  // 오늘의 관리 강도에 맞는 색과 인사말입니다. (아직 진짜 값이 없어서 고정값이에요. 자세한 건 todayCare.ts)
  const careLevel = getTodayCareLevel()
  const theme = careThemes[careLevel]
  // useState 안에서 한 번만 고릅니다. (다시 그려질 때마다 인사말이 바뀌지 않게)
  const [greeting] = useState(() => pickGreeting(careLevel, getTodayMaxHarshness()))

  async function handleAccept() {
    if (isRequesting) return
    setIsRequesting(true)

    try {
      // https 주소나 localhost 가 아니면 mediaDevices 자체가 없습니다.
      if (!navigator.mediaDevices) {
        setMicError('unavailable')
        return
      }

      // 마이크 사용 허락을 묻는 창이 뜹니다.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // 지금은 허락만 확인하면 되므로 바로 마이크를 꺼 둡니다. (실제 대화는 통화 중 화면에서)
      stream.getTracks().forEach((track) => track.stop())
      // 인사말을 같이 넘겨서, 통화 중 화면에서도 같은 말이 보이게 합니다.
      navigate('/call/active', { state: { greeting } })
    } catch (error) {
      // NotAllowedError = 사용자가 거부했거나 브라우저에서 막아 둔 경우
      const isDenied = error instanceof DOMException && error.name === 'NotAllowedError'
      setMicError(isDenied ? 'denied' : 'unavailable')
    } finally {
      setIsRequesting(false)
    }
  }

  function handleConfirmReject() {
    navigate('/')
  }

  // 마이크를 못 쓰는 경우: 켜는 방법을 안내하는 화면
  if (micError) {
    return (
      <div className="flex min-h-screen flex-col items-center bg-white px-4 py-10 text-slate-900 sm:px-6">
        <div className="flex w-full max-w-md flex-1 flex-col items-center text-center">
          <div
            aria-hidden
            className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl"
          >
            🔇
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            마이크가 꺼져 있어
          </h1>
          <p className="mt-3 break-keep text-slate-600">
            {micError === 'denied'
              ? '마이크를 허용해야 AI 와 대화할 수 있어요. 녹음은 저장하지 않고, 대화 요약만 남겨요.'
              : '마이크를 찾을 수 없어요. 마이크가 연결돼 있는지, 주소가 https 또는 localhost 인지 확인해 주세요.'}
          </p>

          <section className="mt-8 w-full rounded-xl border border-slate-200 p-5 text-left">
            <h2 className="font-semibold">마이크 켜는 방법</h2>
            <ol className="mt-4 flex flex-col gap-3 text-slate-700">
              <li className="flex items-center gap-3">
                <span className="text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold">
                  1
                </span>
                <span className="break-keep">주소창 왼쪽 자물쇠 아이콘을 눌러</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold">
                  2
                </span>
                <span className="break-keep">마이크 항목을 찾아</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold">
                  3
                </span>
                <span className="break-keep">허용으로 바꾸고 다시 시도를 눌러</span>
              </li>
            </ol>
          </section>

          {/* mt-auto: 버튼을 화면 아래로 밀어냅니다. */}
          <div className="mt-auto flex w-full flex-col gap-3 pt-10">
            <Button size="lg" className="w-full" disabled={isRequesting} onClick={handleAccept}>
              다시 시도
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              onClick={() => navigate('/check')}
            >
              말 대신 체크인 화면으로
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    // min-h-screen: 모바일 주소창 때문에 h-screen 대신 사용합니다.
    <div
      className={cn(
        'flex min-h-screen flex-col items-center px-4 py-10 text-white sm:px-6',
        theme.pageBackground,
      )}
    >
      <div className="flex w-full max-w-md flex-1 flex-col items-center text-center">
        <p className="text-sm text-indigo-100 sm:text-base">아침 체크인 전화 · 07:30</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">AI 선생님</h1>

        {/* 프로필 사진 자리: 사진이 없어서 전화 아이콘으로 대신합니다. animate-pulse 로 숨 쉬듯 깜빡입니다. */}
        <div className={cn('mt-10 animate-pulse rounded-full p-3', theme.avatarGlow)}>
          <div
            className={cn(
              'flex h-28 w-28 items-center justify-center rounded-full text-5xl sm:h-32 sm:w-32',
              theme.avatarBackground,
            )}
          >
            <span aria-hidden>📞</span>
          </div>
        </div>

        <p className="mt-10 text-lg break-keep sm:text-xl">&quot;{greeting}&quot;</p>
        <p className="mt-3 text-sm break-keep text-indigo-100">
          1~3분 · 녹음하지 않고 요약만 저장해요
        </p>

        {/* mt-auto: 버튼을 화면 아래로 밀어냅니다. */}
        <div className="mt-auto flex w-full items-start justify-around pt-12">
          <div className="flex flex-col items-center gap-2">
            {/* h-16 w-16 = 64px (완료 조건: 지름 56px 이상) */}
            <button
              type="button"
              onClick={toggleReject}
              aria-label="거절"
              className="flex h-16 w-16 animate-bounce cursor-pointer items-center justify-center rounded-full bg-red-600 text-2xl text-white hover:bg-red-700"
            >
              <span aria-hidden>✕</span>
            </button>
            <span className="text-sm font-medium">거절</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleAccept}
              disabled={isRequesting}
              aria-label="받기"
              className="flex h-16 w-16 animate-bounce cursor-pointer items-center justify-center rounded-full bg-green-500 text-2xl text-white hover:bg-green-600"
            >
              <span aria-hidden>📞</span>
            </button>
            <span className="text-sm font-medium">받기</span>
          </div>
        </div>
      </div>

      <Modal isOpen={isRejectOpen} onClose={toggleReject} title="정말 거절할까요?">
        <p className="text-slate-700">오늘 평가를 못 받아요.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={toggleReject}>
            다시 생각할래요
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleConfirmReject}>
            거절할래요
          </Button>
        </div>
      </Modal>
    </div>
  )
}
