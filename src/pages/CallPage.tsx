import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToggle } from '@/hooks/useToggle'
import { useNavigate } from 'react-router-dom'

/**
 * AI 전화 수신 화면입니다. (탭·헤더 없이 화면 전체를 씁니다)
 * 받기 → 통화 중 화면, 거절 → 확인 팝업을 거쳐 홈으로 갑니다.
 */
export function CallPage() {
  const navigate = useNavigate()
  const [isRejectOpen, toggleReject] = useToggle(false)

  function handleAccept() {
    navigate('/call/active')
  }

  function handleConfirmReject() {
    navigate('/')
  }

  return (
    // min-h-screen: 모바일 주소창 때문에 h-screen 대신 사용합니다.
    <div className="flex min-h-screen flex-col items-center bg-slate-900 px-4 py-10 text-white sm:px-6">
      <div className="flex w-full max-w-md flex-1 flex-col items-center text-center">
        <p className="text-sm text-indigo-100 sm:text-base">아침 체크인 전화 · 07:30</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">AI 선생님</h1>

        {/* 프로필 사진 자리: 사진이 없어서 전화 아이콘으로 대신합니다. animate-pulse 로 숨 쉬듯 깜빡입니다. */}
        <div className="mt-10 animate-pulse rounded-full bg-indigo-500/30 p-3">
          <div className="bg-brand flex h-28 w-28 items-center justify-center rounded-full text-5xl sm:h-32 sm:w-32">
            <span aria-hidden>📞</span>
          </div>
        </div>

        <p className="mt-10 text-lg break-keep sm:text-xl">
          &quot;어제 순공 3시간 10분이었지?
          <br />
          오늘 얘기 잠깐 하자.&quot;
        </p>
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
