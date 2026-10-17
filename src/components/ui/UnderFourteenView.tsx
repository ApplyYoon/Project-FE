import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

interface UnderFourteenViewProps {
  /** 맨 아래 작은 안내 한 줄. 가입 화면은 "저장하지 않았어요", 다시 동의 화면은 계정을 지우는 방법을 알려 줍니다. */
  note?: string
}

/**
 * 만 14세 미만이라고 답했을 때 보이는 안내 화면입니다.
 * 가입 화면(SignupPage)과 다시 동의 화면(ConsentPage)이 같이 씁니다. [로그인 화면으로] 를 누르면 로그아웃합니다.
 */
export function UnderFourteenView({
  note = '입력한 가입 정보는 저장하지 않았어요.',
}: UnderFourteenViewProps) {
  const navigate = useNavigate()
  const { logout } = useAuth()

  function handleLeave() {
    // 가입하지 못했으니 로그인도 풀어 둡니다. 그대로 두면 가입을 안 한 채로 앱에 들어갈 수 있기 때문입니다.
    logout()
    navigate('/login')
  }

  return (
    <PlainLayout>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 pt-10 text-center sm:pt-20">
        <div
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-3xl"
        >
          🕐
        </div>
        <h1 className="text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          지금은 만 14세 이상만
          <br />
          가입할 수 있어요
        </h1>
        <p className="break-keep text-slate-600">
          보호자 동의 기능을 준비하고 있어요.
          <br />
          준비되면 다시 만나요.
        </p>
        <p className="text-sm break-keep text-slate-500">{note}</p>
        <Button variant="secondary" size="lg" className="mt-4 w-full" onClick={handleLeave}>
          로그인 화면으로
        </Button>
      </div>
    </PlainLayout>
  )
}
