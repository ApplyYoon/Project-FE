import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/lib/api'
import { exchangeSnsCode } from '@/lib/authApi'
import { markSignupDone } from '@/lib/signup'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// 실패 안내를 보여준 뒤 로그인 화면으로 돌아가기까지 기다리는 시간(밀리초)
const RETURN_DELAY_MS = 3000

// 우리가 지원하는 SNS. 주소에 다른 값이 와도 그대로 서버에 보내지 않습니다.
const providers = ['kakao', 'naver', 'google']

/** 주소만 봐도 실패인 경우(SNS 가 취소·오류를 알려줬거나, 코드가 없음)를 알려줍니다. 문제없으면 null. */
function getAddressFailure(code: string | null, snsError: string | null): string | null {
  // SNS 에서 "취소했다/실패했다" 고 알려주면 주소에 error 가 붙어 옵니다.
  if (snsError) return 'SNS 로그인을 마치지 못했어요. 처음부터 다시 시도해 주세요.'
  if (!code) return '로그인 정보를 받지 못했어요. 처음부터 다시 시도해 주세요.'
  return null
}

/** 서버 요청이 실패한 이유에 맞는 안내 문구를 고릅니다. */
function getRequestFailure(error: unknown): string {
  if (error instanceof ApiError) {
    // 4xx: 서버가 "이 코드로는 안 된다" 고 답한 경우 (틀렸거나 이미 한 번 썼음)
    if (error.status >= 400 && error.status < 500) {
      return '로그인에 실패했어요. 처음부터 다시 시도해 주세요.'
    }
    return '서버에 문제가 있어요. 잠시 후 다시 시도해 주세요.'
  }
  // 인터넷이 끊겼거나, 정해 둔 시간 안에 서버가 답하지 않은 경우
  return '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'
}

export function AuthCallbackPage() {
  // useSearchParams: 주소의 ?code=... 같은 값을 읽습니다.
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()

  const code = searchParams.get('code')
  const snsError = searchParams.get('error')
  const providerParam = searchParams.get('provider')
  const provider = providerParam && providers.includes(providerParam) ? providerParam : undefined

  // 실패 안내 문구. null 이면 아직 처리 중입니다. 주소만 봐도 실패인 경우는 처음부터 실패로 시작합니다.
  const [failure, setFailure] = useState<string | null>(() => getAddressFailure(code, snsError))

  // 서버 요청을 이미 보냈는지. 코드는 한 번만 쓸 수 있는데, 개발 중에는 효과(useEffect)가 두 번 실행될 수 있어서
  // 두 번 보내지 않도록 기억해 둡니다.
  const hasStarted = useRef(false)
  // 이 화면이 아직 떠 있는지. 로딩 중에 사용자가 다른 화면으로 가 버렸다면, 늦게 온 응답으로 강제로 끌고 가지 않습니다.
  const isMounted = useRef(false)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  // 처리: 코드를 서버에 보내서 토큰을 받고, 저장한 뒤 갈 곳으로 이동합니다.
  useEffect(() => {
    if (hasStarted.current || code === null || getAddressFailure(code, snsError) !== null) return
    hasStarted.current = true

    exchangeSnsCode(code, provider)
      .then((result) => {
        // 토큰 저장은 useAuth 가 합니다. (새로고침해도 유지됨)
        login(result.user, result.token)
        // 기존 회원은 이 기기에 가입 정보가 없어도 가입 화면을 다시 거치지 않게 표시해 둡니다.
        if (!result.isNewUser) markSignupDone()
        // replace: 지금 주소(일회용 코드가 붙어 있음)를 기록에 남기지 않고 바꿉니다. 뒤로가기로 돌아오지 못합니다.
        // 처음 온 사람은 회원가입 추가 정보로, 기존 회원은 홈으로 갑니다.
        if (isMounted.current) navigate(result.isNewUser ? '/signup' : '/', { replace: true })
      })
      .catch((error: unknown) => {
        if (isMounted.current) setFailure(getRequestFailure(error))
      })
  }, [code, snsError, provider, login, navigate])

  // 실패하면 안내를 잠깐 보여준 뒤 로그인 화면으로 돌아갑니다. 화면을 떠나면 타이머를 정리합니다.
  useEffect(() => {
    if (failure === null) return
    const timerId = setTimeout(() => navigate('/login', { replace: true }), RETURN_DELAY_MS)
    return () => clearTimeout(timerId)
  }, [failure, navigate])

  if (failure !== null) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 py-10 text-center">
        <div
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 7v6M12 17h.01" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">로그인하지 못했어요</h1>
        {/* role="alert": 안내가 뜨면 스크린리더가 바로 읽어 줍니다. */}
        <p role="alert" className="text-slate-700">
          {failure}
        </p>
        <p className="text-sm text-slate-500">잠시 후 로그인 화면으로 돌아가요.</p>
        <Button
          size="lg"
          className="mt-2 w-full"
          onClick={() => navigate('/login', { replace: true })}
        >
          로그인 화면으로 돌아가기
        </Button>
      </div>
    )
  }

  return (
    // role="status": 처리 중이라는 걸 스크린리더에도 알려줍니다.
    <div
      role="status"
      className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 py-10 text-center"
    >
      {/* 빙글빙글 도는 표시. "움직임 줄이기" 설정을 켠 사람에게는 멈춰 있게 합니다. */}
      <span
        aria-hidden
        className="border-t-brand h-12 w-12 animate-spin rounded-full border-4 border-slate-200 motion-reduce:animate-none"
      />
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">로그인하고 있어요</h1>
      <p className="text-slate-600">잠시만 기다려 주세요.</p>
    </div>
  )
}
