import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { clearResumeAsked } from '@/lib/onboardingProgress'

interface OnboardingExitButtonProps {
  className?: string
}

/**
 * 온보딩 화면 위쪽(헤더 오른쪽)의 "로그인 화면으로" 버튼입니다.
 * 온보딩 질문 · 심리검사 · 관리 설정 화면에서 씁니다.
 *
 * 온보딩은 끝내기 전에는 앱의 다른 화면으로 갈 수 없어서, 그만두고 싶으면 이 버튼으로 로그아웃합니다.
 * 지금까지의 답은 지우지 않습니다. 다음에 로그인하면 "이어하기 / 처음부터 다시" 를 고를 수 있습니다. (OnboardingResumePage)
 */
export function OnboardingExitButton({ className }: OnboardingExitButtonProps) {
  const { logout } = useAuth()

  function handleExit() {
    // 다음에 로그인하면 "이어하기 / 처음부터 다시" 를 다시 묻게 합니다.
    clearResumeAsked()
    // 로그아웃하면 문지기(RequireAuth)가 로그인 화면으로 보냅니다.
    logout()
  }

  return (
    <button
      type="button"
      onClick={handleExit}
      // h-10: 글자는 작아도 누르는 영역은 40px 로 둡니다.
      className={cn(
        'text-brand inline-flex h-10 cursor-pointer items-center text-sm font-medium underline underline-offset-4',
        className,
      )}
    >
      로그인 화면으로
    </button>
  )
}
