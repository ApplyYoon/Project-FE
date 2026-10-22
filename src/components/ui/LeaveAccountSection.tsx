import { Button } from '@/components/ui/Button'
import { GoogleButton } from '@/components/ui/GoogleButton'
import { Modal } from '@/components/ui/Modal'
import { getAccountErrorMessage, withdraw } from '@/lib/accountApi'
import { cn } from '@/lib/cn'
import { isGoogleConfigured } from '@/lib/googleClient'
import { clearResumeAsked } from '@/lib/onboardingProgress'
import { removeAllData } from '@/lib/storage'
import { unsubscribeThisDevice } from '@/lib/webPush'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

interface LeaveAccountSectionProps {
  /** 테스트 로그인이면 true. 서버에 계정이 없어서 탈퇴 대신 [처음부터 다시 하기] 를 보여 줍니다. */
  isTestUser: boolean
  className?: string
}

/**
 * 이 기기에 남은 것을 모두 지우고 로그인 화면을 처음부터 다시 엽니다.
 * 그냥 주소만 옮기면 화면이 기억하던 값(코치 대화 등)이 저장소에 다시 적힐 수 있어서, 화면을 통째로 새로 엽니다.
 * replace: 뒤로 가기로 지운 화면에 돌아오지 못하게 합니다.
 */
async function wipeThisDeviceAndRestart() {
  // 이 기기의 푸시 구독도 지웁니다. 남겨 두면 같은 기기의 다음 사람에게 앞사람 알림이 옵니다. (못 지워도 계속)
  await unsubscribeThisDevice()
  // 'study-' 로 시작하는 것 전부: 로그인 정보 · 기록 · 설정 · 코치 대화 · 온보딩 진행 · 준비하는 것 · 내 일정
  removeAllData()
  // "이번 접속에서 이어하기를 물었다" 표시(sessionStorage)도 지워서, 다음 로그인은 정말 처음처럼 시작합니다.
  clearResumeAsked()
  window.location.replace('/login')
}

/**
 * 탈퇴 · 처음부터 다시 하기 버튼과 확인 창입니다. 설정의 계정 묶음과 내 계정 화면이 같이 씁니다. (2026-10-18)
 *
 * 다크패턴 없이 만듭니다 (사용자: "탈퇴는 물론 다크패턴 없이")
 *   - 숨기지 않습니다. 설정 첫 묶음에 바로 있습니다.
 *   - 확인 창은 한 번이고, 무엇이 지워지는지만 분명히 적습니다. 붙잡는 말 · 죄책감을 주는 말은 쓰지 않습니다.
 *   - [취소] 와 확인 버튼은 같은 크기입니다.
 *
 * - 진짜 계정: 가입한 구글 계정으로 한 번 확인하면 서버의 계정과 기록이 지워집니다. (남이 내 계정을 지우지 못하게)
 *   앱 안에서는 GoogleButton 이 휴대폰 구글 로그인(앱 브릿지)으로 확인합니다.
 * - 테스트 계정: 서버에 계정이 없어서, 이 기기의 기록을 모두 지우고 로그인 화면으로 갑니다. 다시 테스트 로그인하면 가입 · 온보딩부터 봅니다.
 */
export function LeaveAccountSection({ isTestUser, className }: LeaveAccountSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  // 구글 창을 끝까지 마치지 않았을 때 보여 줄 안내. 없으면 null
  const [googleError, setGoogleError] = useState<string | null>(null)

  const leave = useMutation({
    mutationFn: async (credential: string | null) => {
      // 테스트 계정은 서버에 지울 계정이 없습니다.
      if (credential !== null) await withdraw(credential)
    },
    onSuccess: wipeThisDeviceAndRestart,
  })

  function handleClose() {
    if (leave.isPending) return
    setIsOpen(false)
    setGoogleError(null)
    leave.reset()
  }

  const label = isTestUser ? '처음부터 다시 하기' : '탈퇴하기'

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* 되돌릴 수 없는 일이라 꽉 찬 빨간 버튼 대신 빨간 글자 + 선으로 조용히 둡니다. 숨기지는 않습니다. (2차 규칙 3) */}
      <Button
        variant="outline"
        className="w-full border-red-200 text-red-700 hover:bg-red-50"
        onClick={() => setIsOpen(true)}
      >
        {label}
      </Button>
      <p className="text-[13px] break-keep text-slate-500">
        {isTestUser
          ? '테스트 계정이라 이 기기의 기록을 모두 지우고 가입 · 온보딩부터 다시 시작해요.'
          : '계정과 모든 기록을 지워요. 같은 구글 계정으로 다시 가입하면 처음부터 시작해요.'}
      </p>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={isTestUser ? '처음부터 다시 할까요?' : '탈퇴할까요?'}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm break-keep text-slate-700">
            {isTestUser
              ? '이 기기에 저장된 기록 · 코치와의 대화 · 온보딩 진행이 모두 지워지고 로그인 화면으로 돌아가요. 되돌릴 수 없어요.'
              : '서버의 계정과 모든 기록, 이 기기에 저장된 기록 · 코치와의 대화가 지워져요. 되돌릴 수 없어요.'}
          </p>
          {!isTestUser && (
            <p className="text-sm break-keep text-slate-500">
              본인 확인을 위해 가입한 구글 계정으로 한 번 확인하면 바로 탈퇴돼요.
            </p>
          )}

          {leave.isPending && (
            <p role="status" className="text-sm text-slate-500">
              {isTestUser ? '지우는 중…' : '탈퇴하는 중…'}
            </p>
          )}
          {/* role="alert": 안내가 뜨면 스크린리더가 바로 읽어 줍니다. */}
          {googleError !== null && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {googleError}
            </p>
          )}
          {leave.isError && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {getAccountErrorMessage(leave.error)}
            </p>
          )}

          {/* [취소] 와 확인 버튼은 같은 크기로 나란히 둡니다. (한쪽만 크게 만들어 누르게 하지 않음) */}
          {isTestUser ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleClose}
                disabled={leave.isPending}
              >
                취소
              </Button>
              <Button
                variant="danger"
                size="lg"
                onClick={() => leave.mutate(null)}
                disabled={leave.isPending}
              >
                {/* 제목이 "처음부터 다시 할까요?" 라서 버튼은 짧게 둡니다. (375px 에서 한 줄로) */}
                다시 하기
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* 클라이언트 ID 가 없으면(lib/googleClient.ts) 구글 버튼 대신 안내를 보여 줍니다. */}
              {isGoogleConfigured ? (
                <GoogleButton
                  onCredential={(credential) => {
                    if (leave.isPending) return
                    setGoogleError(null)
                    leave.mutate(credential)
                  }}
                  onFail={() =>
                    setGoogleError(
                      '구글 확인을 마치지 못했어요. 다시 눌러 주세요. 앱에서 계속 안 되면 휴대폰 브라우저에서도 탈퇴할 수 있어요.',
                    )
                  }
                />
              ) : (
                <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm break-keep text-slate-600">
                  구글 확인이 아직 준비 중이라 지금은 탈퇴할 수 없어요.
                </p>
              )}
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={handleClose}
                disabled={leave.isPending}
              >
                취소
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
