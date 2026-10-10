import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { getPasswordAuthErrorMessage, loginWithPassword } from '@/lib/authApi'
import { getAfterLoginPath, getReturnPath } from '@/lib/authRedirect'
import { cn } from '@/lib/cn'
import { getEmailError, hasSignupInfo, markSignupDone } from '@/lib/signup'
import { TEST_TOKEN, isTestLoginEnabled, testUser } from '@/lib/testLogin'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'

/* ---------- SNS 로고 ----------
 * 각 SNS 의 로고는 모양·비율·색을 바꾸면 안 됩니다. (공식 디자인 가이드)
 * 버튼 글자와는 별개의 그림이라 aria-hidden 으로 스크린리더가 읽지 않게 합니다. */

/** 카카오 심볼(말풍선). 가이드: 심볼은 검정(#000000), 버튼에는 반드시 심볼이 있어야 합니다. */
function KakaoSymbol() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="#000000">
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.88 5.32 4.71 6.74l-.96 3.51c-.08.3.26.54.52.37l4.19-2.78c.5.06 1.02.09 1.54.09 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
    </svg>
  )
}

/** 네이버 N 로고. 가이드: 네이버 그린 바탕 위에 흰색 N 을 씁니다. */
function NaverLogo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="#FFFFFF">
      <path d="M16.273 12.845 7.376 0H0v24h7.727V11.156L16.624 24H24V0h-7.727v12.845Z" />
    </svg>
  )
}

/** 구글 G 로고. 가이드: 4가지 색 그대로, 흰 바탕 위에서만 씁니다. 단색으로 바꾸면 안 됩니다. */
function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-6 w-6 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/* ---------- SNS 목록 ----------
 * 어떤 SNS 를 쓸지는 BE 와 정해야 합니다. 바뀌면 이 목록만 고치면 됩니다. */

interface SnsProvider {
  id: string
  /** "준비 중" 안내에 보여줄 이름 */
  name: string
  /** 버튼 글자. 공식 가이드가 허용하는 문구를 씁니다. */
  label: string
  logo: ReactNode
  /** 그 SNS 공식 색. hover 에도 같은 색을 적어야 기본 버튼의 hover 색이 덮어씌워집니다. */
  colorClassName: string
}

const snsProviders: SnsProvider[] = [
  {
    id: 'kakao',
    name: '카카오',
    // 카카오 가이드: 완성형 문구는 "카카오 로그인". 컨테이너 #FEE500, 레이블 검정 85%.
    label: '카카오 로그인',
    logo: <KakaoSymbol />,
    colorClassName: 'bg-[#FEE500] text-black/85 hover:bg-[#FEE500]',
  },
  {
    id: 'naver',
    name: '네이버',
    // 네이버 그린 #03C75A + 흰색 글자·N 로고.
    label: '네이버 로그인',
    logo: <NaverLogo />,
    colorClassName: 'bg-[#03C75A] text-white hover:bg-[#03C75A]',
  },
  {
    id: 'google',
    name: 'Google',
    // 구글 가이드(라이트): 흰 바탕, 테두리 #747775 1px, 글자 #1F1F1F.
    label: 'Google 계정으로 로그인',
    logo: <GoogleLogo />,
    colorClassName: 'border border-[#747775] bg-white text-[#1F1F1F] hover:bg-white',
  },
]

// 테스트 로그인을 보여줄지. `.env` 값은 앱이 켜진 뒤에 바뀌지 않아서, 화면 밖에서 한 번만 정합니다.
const isTestLoginOn = isTestLoginEnabled(import.meta.env.VITE_TEST_LOGIN)

interface TestLoginPanelProps {
  /** "테스트로 시작하기" 를 눌렀을 때 */
  onStart: () => void
}

/**
 * 서버 로그인이 준비되기 전에 앱을 끝까지 써 볼 수 있게 하는 테스트용 영역입니다. (lib/testLogin.ts)
 * 가짜라서 누구나 "로그인" 할 수 있습니다. 진짜 로그인이 붙으면 VITE_TEST_LOGIN=false 로 끕니다.
 */
function TestLoginPanel({ onStart }: TestLoginPanelProps) {
  const { user, isLoggedIn, logout } = useAuth()

  return (
    <Card title="테스트 모드" className="flex flex-col gap-3">
      <p className="text-sm break-keep text-slate-500">
        서버 로그인이 준비되기 전까지 테스트 계정으로 써 볼 수 있어요. 기록은 이 브라우저에만
        저장돼요.
      </p>

      {isLoggedIn ? (
        <>
          {/* role="status": 로그인 상태가 바뀌면 스크린리더가 읽어 줍니다. */}
          <p role="status" className="text-sm font-medium text-slate-900">
            로그인됨: {user?.name}
          </p>
          <Button variant="secondary" size="lg" className="w-full" onClick={logout}>
            로그아웃
          </Button>
        </>
      ) : (
        <>
          <p role="status" className="text-sm font-medium text-slate-900">
            로그인 안 됨
          </p>
          <Button size="lg" className="w-full" onClick={onStart}>
            테스트로 시작하기
          </Button>
        </>
      )}
    </Card>
  )
}

export function LoginPage() {
  // 누른 SNS 를 기억해 두면, 그 SNS 이름으로 "준비 중" 안내를 띄울 수 있습니다. null 이면 안내가 닫혀 있습니다.
  const [pendingProvider, setPendingProvider] = useState<SnsProvider | null>(null)

  // 방금 이 화면에서 로그인했는지. 이미 로그인한 채로 /login 을 직접 연 사람(로그아웃하러 온 사람)과 구분하려고 씁니다.
  const [hasJustLoggedIn, setHasJustLoggedIn] = useState(false)

  const { isLoggedIn, login } = useAuth()
  const location = useLocation()
  // 로그인 안 하고 막힌 페이지에 갔다가 여기로 왔다면, 가려던 주소가 들어 있습니다. (RequireAuth 가 넘겨줌)
  const returnPath = getReturnPath(location.state)

  // 일반 로그인(이메일·비밀번호) 칸에 적은 값. 비밀번호는 화면에만 두고 어디에도 저장하지 않습니다.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 서버 답을 기다리는 중인지. 기다리는 동안 버튼을 또 누르지 못하게 합니다.
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  // 로그인에 실패했을 때 보여줄 안내. 없으면 null
  const [loginError, setLoginError] = useState<string | null>(null)

  function handleTestLogin() {
    login(testUser, TEST_TOKEN)
    setHasJustLoggedIn(true)
  }

  /** 이메일·비밀번호로 로그인합니다. 맞는지 확인하는 것은 서버입니다. (lib/authApi.ts) */
  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (isLoggingIn) return

    // 서버에 보내기 전에, 눈에 보이는 실수(빈 칸·이메일 모양)는 먼저 알려 줍니다.
    const emailError = getEmailError(email)
    if (emailError !== null) {
      setLoginError(emailError)
      return
    }
    if (password === '') {
      setLoginError('비밀번호를 입력해 주세요.')
      return
    }

    setIsLoggingIn(true)
    setLoginError(null)
    try {
      const result = await loginWithPassword(email.trim(), password)
      // 이메일로 로그인되는 사람은 가입을 이미 마친 회원입니다. 이 기기에 가입 정보가 없어도 가입 화면으로 보내지 않습니다.
      markSignupDone()
      login(result.user, result.token)
      setHasJustLoggedIn(true)
    } catch (error) {
      setLoginError(getPasswordAuthErrorMessage(error, 'login'))
    } finally {
      setIsLoggingIn(false)
    }
  }

  // 로그인이 되면 갈 곳으로 보냅니다. 처음 온 사람은 가입 화면, 가입을 마친 사람은 가려던 페이지(없으면 홈)입니다.
  // replace: 로그인 화면을 기록에 남기지 않습니다.
  // 가려던 주소 없이 /login 을 직접 연 "이미 로그인한 사람" 은 그대로 둡니다. (로그아웃 버튼을 쓸 수 있어야 하기 때문입니다)
  if (isLoggedIn && (hasJustLoggedIn || returnPath !== null)) {
    return <Navigate to={getAfterLoginPath(hasSignupInfo(), returnPath)} replace />
  }

  return (
    // max-w-sm + mx-auto: 화면이 넓어도 버튼이 너무 길어지지 않게 가운데에 모읍니다. (모바일은 가득)
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">로그인</h1>
        {/* 앱 소개 한 줄 */}
        <p className="mt-2 text-slate-600">주머니 속 관리형 독서실 선생님</p>
      </div>

      {/* 일반 로그인 (이메일 · 비밀번호) */}
      <Card>
        {/* noValidate: 브라우저의 기본 안내 풍선 대신, 아래의 우리 안내 문구를 씁니다. */}
        <form onSubmit={handlePasswordLogin} noValidate className="flex flex-col gap-3">
          <Input
            id="login-email"
            // type="email": 휴대폰에서 @ 가 있는 키보드가 뜹니다.
            type="email"
            label="이메일"
            value={email}
            placeholder="예) study@example.com"
            // autoComplete: 브라우저(비밀번호 관리자)가 저장해 둔 값을 채워 줍니다.
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 text-base"
          />
          <Input
            id="login-password"
            // type="password": 적은 글자가 점(●)으로 가려집니다.
            type="password"
            label="비밀번호"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 text-base"
          />
          {/* role="alert": 안내가 뜨면 스크린리더가 바로 읽어 줍니다. */}
          {loginError !== null && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {loginError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={isLoggingIn}>
            {isLoggingIn ? '로그인하는 중…' : '로그인'}
          </Button>
        </form>
        <p className="mt-3 text-center text-sm text-slate-600">
          처음이라면 {/* h-10 = 40px. 글자는 작아도 누르는 영역은 손가락으로 누를 만하게 합니다. */}
          <Link
            to="/signup"
            className="text-brand inline-flex h-10 items-center font-medium underline underline-offset-4"
          >
            이메일로 회원가입
          </Link>
        </p>
      </Card>

      <p className="text-center text-sm text-slate-500">또는 SNS 계정으로</p>

      <Card className="flex flex-col gap-3">
        {snsProviders.map((provider) => (
          <Button
            key={provider.id}
            size="lg"
            // size lg = 높이 48px(h-12). w-full 로 가로를 꽉 채웁니다.
            // hover 는 색을 바꾸지 않고 그림자만 줍니다. (SNS 가이드가 공식 색 외의 색을 금지합니다)
            className={cn('w-full rounded-xl hover:shadow-md', provider.colorClassName)}
            onClick={() => setPendingProvider(provider)}
          >
            {provider.logo}
            {provider.label}
          </Button>
        ))}
      </Card>

      {isTestLoginOn && <TestLoginPanel onStart={handleTestLogin} />}

      {/* 지금은 실제 로그인 대신 안내만 보여 줍니다. (실제 연결은 콜백 처리 이슈에서) */}
      <Modal
        isOpen={pendingProvider !== null}
        onClose={() => setPendingProvider(null)}
        title="준비 중"
      >
        <p className="text-sm text-slate-600">
          {pendingProvider?.name} 로그인은 아직 준비 중이에요. 조금만 기다려 주세요.
        </p>
        <Button className="mt-4 w-full" onClick={() => setPendingProvider(null)}>
          확인
        </Button>
      </Modal>
    </div>
  )
}
