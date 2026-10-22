import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useIsServerData } from '@/hooks/useIsServerData'
import { useToggle } from '@/hooks/useToggle'
import { careThemes, pickGreeting } from '@/lib/careTheme'
import { checkCallQuery, type StudiedInfo } from '@/lib/checkCall'
import { cn } from '@/lib/cn'
import { unlockCallAudio } from '@/lib/realtimeCall'
import { COACH_PATH } from '@/lib/chatRooms'
import { getTodayCareLevel, getTodayMaxHarshness } from '@/lib/todayCare'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// 마이크를 못 쓰는 이유. denied: 사용자가 거부함 / unavailable: 마이크가 없거나 쓸 수 없는 주소
type MicError = 'denied' | 'unavailable'

/**
 * AI 전화 수신 화면입니다. (탭·헤더 없이 화면 전체를 씁니다)
 * 먼저 오늘 끝낸 공부가 있는지 봅니다. (lib/checkCall.ts)
 *   받기 → 마이크 권한 요청 → 통화 중 화면, 거절 → 확인 팝업을 거쳐 코치 화면으로 갑니다.
 *   방금 끝낸 공부가 있으면 "그걸 말로 설명해 봐" 를 보여 줍니다. (확인 통화)
 *   공부를 안 했어도 걸 수 있습니다. 잠금 화면은 2026-10-22 에 공부 조건과 함께 뺐습니다.
 * 마이크를 못 쓰면 켜는 방법 안내 화면으로 바뀝니다.
 */
export function CallPage() {
  return (
    <AsyncBoundary pendingFallback={<CallGateSkeleton />}>
      <CallGate />
    </AsyncBoundary>
  )
}

/** 오늘 끝낸 공부를 확인하는 동안 (방금 공부한 기록을 서버로 보내고 묻는 중) */
function CallGateSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-64" />
        <p role="status" className="text-sm text-slate-500">
          오늘 공부 기록을 확인하고 있어요…
        </p>
      </div>
    </div>
  )
}

/** 오늘 끝낸 공부를 확인하고 수신 화면을 보여 줍니다. */
function CallGate() {
  const isServerData = useIsServerData()
  const { data: gate } = useSuspenseQuery(checkCallQuery(isServerData))
  return <CallRingView studied={gate.studied} />
}

interface CallRingViewProps {
  /** 방금 끝낸 공부. 있으면 "그걸 말로 설명해 봐" 를 보여 줍니다. 없으면 보통 통화입니다. */
  studied: StudiedInfo | null
}

/**
 * 확인 통화의 인사말. 카드 제목이 있으면 넣습니다.
 *   { title: '곱의 미분법' } -> "'곱의 미분법' 끝냈구나! 나한테 설명해 줄래?"
 *   { title: null }          -> '공부 끝냈구나! 방금 한 거 나한테 설명해 줄래?'
 */
function reviewGreeting(studied: StudiedInfo): string {
  return studied.title
    ? `'${studied.title}' 끝냈구나! 나한테 설명해 줄래?`
    : '공부 끝냈구나! 방금 한 거 나한테 설명해 줄래?'
}

/** 전화 받기 화면 */
function CallRingView({ studied }: CallRingViewProps) {
  const navigate = useNavigate()
  const [isRejectOpen, toggleReject] = useToggle(false)
  const [micError, setMicError] = useState<MicError | null>(null)
  // 권한 창이 떠 있는 동안 받기를 또 누르지 못하게 합니다.
  const [isRequesting, setIsRequesting] = useState(false)
  // 마이크 안내 화면에서 "다시 시도" 를 눌렀는데 또 막혔는지. (#460)
  // 한 번 "차단" 하면 브라우저가 기억해서, 권한을 바꾸지 않고 누르면 묻지도 않고 바로 같은 화면이 나옵니다.
  // 화면이 하나도 안 바뀌면 버튼이 고장 난 것처럼 보여서, 이때는 "아직 막혀 있어요" 를 알려 줍니다.
  const [isStillBlocked, setIsStillBlocked] = useState(false)
  // 오늘의 관리 강도에 맞는 색과 인사말입니다. (아직 진짜 값이 없어서 고정값이에요. 자세한 건 todayCare.ts)
  const careLevel = getTodayCareLevel()
  const theme = careThemes[careLevel]
  // useState 안에서 한 번만 고릅니다. (다시 그려질 때마다 인사말이 바뀌지 않게)
  // 방금 끝낸 공부가 있으면 복습용 인사말, 없을 때만 관리 단계별 공용 인사말을 씁니다. (통화 수정 6)
  // 점검에서 공부를 막 끝낸 학생의 확인 통화 화면에 "타이머 켤 시간이야" 가 크게 나왔습니다.
  const [greeting] = useState(() =>
    studied ? reviewGreeting(studied) : pickGreeting(careLevel, getTodayMaxHarshness()),
  )

  async function handleAccept() {
    if (isRequesting) return
    setIsRequesting(true)

    // 아이폰 사파리는 버튼을 누른 바로 그 순간에만 소리 재생을 허락합니다. 아래 await 보다 먼저 불러야 합니다.
    unlockCallAudio()

    try {
      // https 주소나 localhost 가 아니면 mediaDevices 자체가 없습니다.
      if (!navigator.mediaDevices) {
        // micError 가 이미 있으면 안내 화면에서 "다시 시도" 를 누른 것입니다.
        if (micError !== null) setIsStillBlocked(true)
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
      if (micError !== null) setIsStillBlocked(true)
      setMicError(isDenied ? 'denied' : 'unavailable')
    } finally {
      setIsRequesting(false)
    }
  }

  // 통화는 코치 화면의 [통화] 버튼에서 걸어서, 그만두면 코치 화면으로 돌아갑니다.
  function handleConfirmReject() {
    navigate(COACH_PATH)
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

          <section className="mt-8 w-full rounded-2xl border border-slate-200 p-5 text-left">
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
                <span className="break-keep">허용으로 바꾸고 아래 다시 시도를 눌러</span>
              </li>
            </ol>
          </section>

          {/* mt-auto: 버튼을 화면 아래로 밀어냅니다. */}
          {/* 권한을 바꾸기 전에는 "다시 시도" 가 소용없어서, 바로 할 수 있는 채팅을 첫 번째(진한) 버튼으로 둡니다. (#460) */}
          {/* 채팅은 통화와 같은 대본을 글로 합니다. (최종 기획서 「4.5」 "통화를 못 받았을 때 같은 대본을 채팅으로") */}
          <div className="mt-auto flex w-full flex-col gap-3 pt-10">
            <Button size="lg" className="w-full" onClick={() => navigate(COACH_PATH)}>
              말 대신 채팅으로 하기
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              disabled={isRequesting}
              onClick={handleAccept}
            >
              마이크를 허용했어요 · 다시 시도
            </Button>
            {/* role="alert": 화면을 읽어 주는 프로그램도 바로 알려 줍니다. */}
            {isStillBlocked && (
              <p role="alert" className="text-sm break-keep text-red-600">
                아직 마이크가 막혀 있어요. 위 1~3단계로 허용으로 바꾼 뒤 다시 눌러 줘.
              </p>
            )}
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
        <p className="text-sm text-indigo-100 sm:text-base">
          {studied ? '확인 통화 · 방금 한 공부' : 'AI 선생님 전화'}
        </p>
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

        {/* max-w-[22em] · leading-relaxed: 한 줄이 너무 길지 않고 줄 사이가 넉넉해야 한 번에 읽힙니다. */}
        <p className="mt-10 max-w-[22em] text-lg leading-relaxed break-keep sm:text-xl">
          &quot;{greeting}&quot;
        </p>
        {/* 방금 끝낸 공부가 있으면 확인 통화로 무엇을 할지 알려 줍니다. (코치가 서버 기록으로 같은 공부를 물어봄) */}
        {studied && (
          <p className="mt-4 w-full rounded-2xl bg-white/15 px-4 py-3 text-left text-[15px] leading-relaxed break-keep">
            방금 한 {studied.title ? `'${studied.title}'` : '공부'}({studied.minutes}분)을 코치한테
            말로 설명해 봐. 코치가 2~3개 물어보고 이해도를 알려 줄 거야.
          </p>
        )}
        <p className="mt-3 text-sm break-keep text-indigo-100">
          1~3분 · 녹음하지 않고 요약만 저장해요
        </p>

        {/* mt-auto: 버튼을 화면 아래(엄지가 닿는 곳)로 밀어냅니다. */}
        {/* 채운 버튼은 [받기] 하나만 둡니다. 거절은 선만 있는 버튼으로 낮춥니다. (폰 레스토프)
            움직이는 버튼은 누르기 어려워서 튀는 효과(animate-bounce)는 뺐습니다. 울리는 느낌은 위 아이콘의 깜빡임으로 충분합니다. */}
        <div className="mt-auto flex w-full items-end justify-around pt-12 pb-2">
          <div className="flex flex-col items-center gap-2">
            {/* h-16 w-16 = 64px (완료 조건: 지름 56px 이상) */}
            <button
              type="button"
              onClick={toggleReject}
              aria-label="거절"
              className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border-2 border-white/60 text-2xl text-white transition-transform hover:bg-white/10 active:scale-95"
            >
              <span aria-hidden>✕</span>
            </button>
            <span className="text-sm font-medium">거절</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            {/* 받기는 1순위라서 조금 더 크게(80px) 둡니다. (피츠의 법칙) */}
            <button
              type="button"
              onClick={handleAccept}
              disabled={isRequesting}
              aria-label="받기"
              className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-green-500 text-3xl text-white transition-transform hover:bg-green-600 active:scale-95 disabled:opacity-60"
            >
              <span aria-hidden>📞</span>
            </button>
            <span className="text-sm font-semibold">받기</span>
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
