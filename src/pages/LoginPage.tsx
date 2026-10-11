import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { getPasswordAuthErrorMessage, loginWithPassword } from '@/lib/authApi'
import { getAfterLoginPath, getReturnPath, getSignedUpEmail } from '@/lib/authRedirect'
import { getEmailError, hasSignupInfo, markSignupDone } from '@/lib/signup'
import { TEST_TOKEN, isTestLoginEnabled, testUser } from '@/lib/testLogin'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'

// 테스트 로그인을 보여줄지. `.env` 값은 앱이 켜진 뒤에 바뀌지 않아서, 화면 밖에서 한 번만 정합니다.
const isTestLoginOn = isTestLoginEnabled(import.meta.env.VITE_TEST_LOGIN)

interface TestLoginPanelProps {
  /** "테스트로 시작하기" 를 눌렀을 때 */
  onStart: () => void
}

/**
 * 서버 없이도 앱을 끝까지 써 볼 수 있게 하는 테스트용 영역입니다. (lib/testLogin.ts)
 * 가짜라서 누구나 "로그인" 할 수 있습니다. 서버를 배포해 이메일 로그인이 되면 VITE_TEST_LOGIN=false 로 끕니다.
 */
function TestLoginPanel({ onStart }: TestLoginPanelProps) {
  const { user, isLoggedIn, logout } = useAuth()

  return (
    <Card title="테스트 모드" className="flex flex-col gap-3">
      <p className="text-sm break-keep text-slate-500">
        서버 없이 테스트 계정으로 써 볼 수 있어요. 기록은 이 브라우저에만 저장돼요.
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
  // 방금 이 화면에서 로그인했는지. 이미 로그인한 채로 /login 을 직접 연 사람(로그아웃하러 온 사람)과 구분하려고 씁니다.
  const [hasJustLoggedIn, setHasJustLoggedIn] = useState(false)

  const { isLoggedIn, login } = useAuth()
  const location = useLocation()
  // 로그인 안 하고 막힌 페이지에 갔다가 여기로 왔다면, 가려던 주소가 들어 있습니다. (RequireAuth 가 넘겨줌)
  const returnPath = getReturnPath(location.state)
  // 방금 이메일로 가입을 마치고 온 사람이면 그 이메일이 들어 있습니다. (가입 화면이 넘겨줌) 아니면 null
  const signedUpEmail = getSignedUpEmail(location.state)

  // 일반 로그인(이메일·비밀번호) 칸에 적은 값. 비밀번호는 화면에만 두고 어디에도 저장하지 않습니다.
  // 방금 가입하고 온 사람은 가입한 이메일을 미리 채워 둡니다.
  const [email, setEmail] = useState(signedUpEmail ?? '')
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

      {/* 방금 가입을 마친 사람에게만 보이는 안내 */}
      {signedUpEmail !== null && !isLoggedIn && (
        // role="status": 화면이 바뀌었다는 것을 스크린리더가 읽어 줍니다.
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium break-keep text-emerald-700"
        >
          가입이 끝났어요. 방금 정한 비밀번호로 로그인해 주세요.
        </p>
      )}

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
            placeholder="예) tmax@starflow.com"
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

      {isTestLoginOn && <TestLoginPanel onStart={handleTestLogin} />}
    </div>
  )
}
