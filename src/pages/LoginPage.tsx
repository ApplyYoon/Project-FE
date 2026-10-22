import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { GoogleButton } from '@/components/ui/GoogleButton'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import {
  getDemoLoginErrorMessage,
  getGoogleAuthErrorMessage,
  loginWithDemoCode,
  startWithGoogle,
  type AuthResult,
} from '@/lib/authApi'
import { getAfterLoginPath, getReturnPath } from '@/lib/authRedirect'
import { isDemoCodeLoginEnabled } from '@/lib/demoLogin'
import { isGoogleConfigured } from '@/lib/googleClient'
import { savePendingGoogleSignup } from '@/lib/googleSignup'
import { markOnboardingDoneOnServer } from '@/lib/onboardingProgress'
import { hasSignupInfo, markSignupDone } from '@/lib/signup'
import { TEST_TOKEN, isTestLoginEnabled, testUser } from '@/lib/testLogin'
import { cn } from '@/lib/cn'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

// 테스트 로그인을 보여줄지. `.env` 값은 앱이 켜진 뒤에 바뀌지 않아서, 화면 밖에서 한 번만 정합니다.
const isTestLoginOn = isTestLoginEnabled(import.meta.env.VITE_TEST_LOGIN)
// 시연 코드 로그인을 보여줄지. 앱용 웹(starflow-app-web)에서만 VITE_DEMO_CODE_LOGIN=true 로 켭니다. (lib/demoLogin.ts)
const isDemoCodeLoginOn = isDemoCodeLoginEnabled(import.meta.env.VITE_DEMO_CODE_LOGIN)

/* 왼쪽 소개에 나오는 세 줄. 아이콘은 글자를 꾸미는 것이라 화면 읽기 프로그램이 건너뜁니다(aria-hidden). */
const features: { icon: ReactNode; text: string }[] = [
  {
    // 전화기
    icon: (
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    ),
    text: '정해진 시간에 AI 선생님이 전화로 챙겨줘요',
  },
  {
    // 꺾은선 그래프
    icon: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
    text: '2주 기록이 쌓이면 "나도 몰랐던 나" 를 알려줘요',
  },
  {
    // 조절 막대
    icon: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
    text: '칭찬과 독촉의 세기는 내가 정해요',
  },
]

interface TestLoginPanelProps {
  /** "테스트로 시작하기" 를 눌렀을 때 */
  onStart: () => void
}

/**
 * 서버 없이도 앱을 끝까지 써 볼 수 있게 하는 테스트용 영역입니다. (lib/testLogin.ts)
 * 가짜라서 누구나 "로그인" 할 수 있습니다. 서버가 배포돼 구글로 시작하기가 되면 VITE_TEST_LOGIN=false 로 끕니다.
 */
function TestLoginPanel({ onStart }: TestLoginPanelProps) {
  const { user, isLoggedIn, logout } = useAuth()

  // 구글 버튼이 1순위라서, 테스트 영역은 흰 묶음 대신 선만 두른 조용한 칸으로 아래에 둡니다. (폰 레스토프 효과)
  return (
    <section
      aria-label="테스트 모드"
      className="flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-slate-700">테스트 모드</h2>
        <p className="mt-1 text-[13px] break-keep text-slate-500">
          서버 없이 테스트 계정으로 써 볼 수 있어요. 기록은 이 브라우저에만 저장돼요.
        </p>
      </div>

      {isLoggedIn ? (
        <>
          {/* role="status": 로그인 상태가 바뀌면 스크린리더가 읽어 줍니다. */}
          <p role="status" className="text-[13px] font-medium text-slate-900">
            로그인됨: {user?.name}
          </p>
          <Button variant="ghost" className="w-full text-red-700 hover:bg-red-50" onClick={logout}>
            로그아웃
          </Button>
        </>
      ) : (
        <>
          <p role="status" className="text-[13px] font-medium text-slate-900">
            로그인 안 됨
          </p>
          <Button variant="outline" className="w-full" onClick={onStart}>
            테스트로 시작하기
          </Button>
        </>
      )}
    </section>
  )
}

interface DemoCodeLoginPanelProps {
  /** 서버에 코드를 확인하는 중인지 */
  isWorking: boolean
  /** 실패했을 때 보여줄 한 줄. 없으면 null */
  error: string | null
  /** [시연 코드로 로그인] 을 눌렀을 때. 입력한 코드를 넘깁니다 */
  onSubmit: (code: string) => void
}

/**
 * 시연 코드로 로그인하는 영역입니다. (lib/demoLogin.ts, 2026-10-18)
 * 앱 안의 웹 화면처럼 구글 로그인이 막힌 곳에서, 시연 때 진짜 서버 · AI 를 쓰려고 둡니다.
 * 코드는 비밀번호처럼 가려서 입력합니다(type="password"). 코드 값은 이 앱 어디에도 저장하지 않습니다.
 */
function DemoCodeLoginPanel({ isWorking, error, onSubmit }: DemoCodeLoginPanelProps) {
  const [code, setCode] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 의 기본 동작(페이지 새로 고침)을 막습니다. 키보드의 Enter 로도 이 함수가 불립니다.
    event.preventDefault()
    if (code.trim() === '' || isWorking) return
    onSubmit(code.trim())
  }

  return (
    <Card title="시연 코드로 로그인" className="flex flex-col gap-3">
      <p className="text-[13px] break-keep text-slate-500">
        시연 때 받은 코드를 넣으면 시연 계정으로 들어가요. 진짜 서버와 AI 를 써요.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          id="demo-code"
          name="demo-code"
          type="password"
          label="시연 코드"
          // 비밀번호 저장 창이 뜨지 않게 합니다. (공용 시연 코드라 기기에 남길 필요가 없습니다)
          autoComplete="off"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={isWorking}
        />
        {/* 채운 버튼은 구글로 시작하기 하나라서, 시연 코드는 테두리 버튼으로 둡니다. */}
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={code.trim() === '' || isWorking}
        >
          {isWorking ? '확인하는 중…' : '시연 코드로 로그인'}
        </Button>
      </form>
      {error !== null && (
        <p role="alert" className="text-sm break-keep text-red-600">
          {error}
        </p>
      )}
    </Card>
  )
}

/**
 * 로그인 화면입니다. 시안(docs/design/screens/login-*.png)처럼 왼쪽은 앱 소개, 오른쪽은 "시작하기" 카드입니다.
 *  - [Google로 시작하기] : 가입한 구글 계정이면 바로 로그인, 처음이면 가입 화면으로 이어집니다. (#319)
 *    로그인은 구글 하나뿐입니다. 이메일 가입이 없어서 이메일 로그인도 뺐습니다. (2026-10-17)
 *  - 시연 코드로 로그인 (VITE_DEMO_CODE_LOGIN=true 일 때만, 앱용 웹) — 진짜 서버 · AI
 *  - 테스트 모드 (VITE_TEST_LOGIN=false 가 아닐 때만) — 서버 없이 시연 대본
 * 모바일은 소개 → 카드 순서로 위아래로 쌓고, PC(lg)에서 두 칸으로 나눕니다.
 */
export function LoginPage() {
  // 방금 이 화면에서 로그인했는지. 이미 로그인한 채로 /login 을 직접 연 사람(로그아웃하러 온 사람)과 구분하려고 씁니다.
  const [hasJustLoggedIn, setHasJustLoggedIn] = useState(false)

  const { isLoggedIn, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // 로그인 안 하고 막힌 페이지에 갔다가 여기로 왔다면, 가려던 주소가 들어 있습니다. (RequireAuth 가 넘겨줌)
  const returnPath = getReturnPath(location.state)

  // 구글로 시작하는 중인지(서버 확인을 기다림), 실패했을 때 보여줄 안내
  const [isGoogleWorking, setIsGoogleWorking] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  // 서버 확인을 기다리는 중인지를 ref 로도 들고 있습니다. 구글 창에서 계정을 연달아 고르면 state 는 아직 바뀌기 전일 수 있어서, 두 번째 신분증은 이 값으로 걸러냅니다.
  const isGoogleWorkingRef = useRef(false)

  // 시연 코드를 확인하는 중인지, 실패했을 때 보여줄 안내
  const [isDemoWorking, setIsDemoWorking] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)

  function handleTestLogin() {
    // 테스트 로그인은 앱을 바로 둘러보려는 것이라 가입 화면을 건너뜁니다. "가입 마침" 표시를 해 두면 홈으로 갑니다.
    // ("가입 마침" 표시가 있으면 /signup 을 직접 열어도 홈으로 갑니다. 이미 가입한 사람의 가입 정보를 덮어쓰지 않게 하려는 것입니다)
    markSignupDone()
    login(testUser, TEST_TOKEN)
    setHasJustLoggedIn(true)
  }

  /**
   * 서버가 로그인 정보를 줬을 때 (구글로 이미 가입한 사람 · 시연 코드).
   * 가입 화면을 건너뛰고, 서버가 온보딩을 마쳤다고 하면 이 기기에 기록이 없어도 온보딩을 다시 하지 않습니다.
   */
  function finishServerLogin(auth: AuthResult) {
    markSignupDone()
    // 다른 기기에서 처음 로그인한 경우를 위한 것입니다. (BE PR #300)
    if (auth.user.onboarded === true) markOnboardingDoneOnServer()
    login(auth.user, auth.token)
    setHasJustLoggedIn(true)
  }

  /** 시연 코드를 서버에 보냅니다. 맞으면 구글로 로그인한 것과 똑같이 진짜 서버 모드로 들어갑니다. */
  async function handleDemoCode(code: string) {
    setIsDemoWorking(true)
    setDemoError(null)
    try {
      finishServerLogin(await loginWithDemoCode(code))
    } catch (error) {
      setDemoError(getDemoLoginErrorMessage(error))
    } finally {
      setIsDemoWorking(false)
    }
  }

  /** 구글이 신분증을 줬을 때. 서버가 확인해서 "로그인" 또는 "가입 필요" 를 알려 줍니다. (lib/authApi.ts) */
  async function handleGoogleCredential(credential: string) {
    // 이미 확인하는 중이면 무시합니다. (두 번 보내면 서버 요청이 두 번 나가고 화면이 두 번 이동합니다)
    if (isGoogleWorkingRef.current) return
    isGoogleWorkingRef.current = true
    setIsGoogleWorking(true)
    setGoogleError(null)
    try {
      const result = await startWithGoogle(credential)
      if (result.status === 'LOGGED_IN') {
        // 구글로 이미 가입한 사람입니다. 이 기기에 가입 정보가 없어도 가입 화면으로 보내지 않습니다.
        finishServerLogin(result.auth)
        return
      }
      // 처음 온 구글 계정입니다. 가입 화면으로 이어 갑니다.
      // 구글 신분증은 가입을 마칠 때까지 이 탭에만 잠깐 둡니다. (lib/googleSignup.ts)
      savePendingGoogleSignup({ credential, name: result.name, email: result.email })
      navigate('/signup?step=1')
    } catch (error) {
      setGoogleError(getGoogleAuthErrorMessage(error))
    } finally {
      isGoogleWorkingRef.current = false
      setIsGoogleWorking(false)
    }
  }

  // 로그인이 되면 갈 곳으로 보냅니다. 가려던 페이지가 있으면 거기로, 없으면 홈입니다.
  // (구글 · 시연 코드 · 테스트 로그인은 모두 위에서 "가입 마침" 표시를 해 두어서 가입 화면으로 가지 않습니다)
  // replace: 로그인 화면을 기록에 남기지 않습니다.
  // 가려던 주소 없이 /login 을 직접 연 "이미 로그인한 사람" 은 그대로 둡니다. (로그아웃 버튼을 쓸 수 있어야 하기 때문입니다)
  if (isLoggedIn && (hasJustLoggedIn || returnPath !== null)) {
    return <Navigate to={getAfterLoginPath(hasSignupInfo(), returnPath)} replace />
  }

  // 로그인 화면은 메뉴·하단 탭 없이 앱 이름만 있는 틀(PlainLayout)로 감쌉니다. (시안: 탭 없이 뜨는 화면)
  return (
    <PlainLayout>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        {/* ---------- 왼쪽: 앱 소개 ---------- */}
        <section className="flex flex-col gap-4 sm:gap-5 lg:pt-4">
          <p className="text-[13px] font-semibold text-slate-500">학생·입시생 AI 자기관리</p>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight break-keep sm:text-4xl">
            주머니 속
            <br />
            관리형 독서실 선생님
          </h1>
          <p className="max-w-prose text-[15px] break-keep text-slate-600">
            정해진 시간에 전화로 챙기고, 기록으로 나를 알려주고, 필요하면 엄하게 관리해요.
          </p>
          <ul className="flex flex-col gap-3">
            {features.map((feature) => (
              <li key={feature.text} className="flex items-center gap-3">
                <span className="bg-brand-light text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-5 w-5 fill-none stroke-current stroke-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {feature.icon}
                  </svg>
                </span>
                <span className="text-[15px] break-keep text-slate-700">{feature.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- 오른쪽: 시작하기 ---------- */}
        {/* max-w-md(448px): 구글 버튼은 400px 보다 넓어지지 않아서, 칸을 이만큼으로 두어야 버튼이 카드 폭을 꽉 채웁니다. */}
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <Card title="시작하기" className="flex flex-col gap-4">
            <p className="-mt-1 text-[13px] break-keep text-slate-500">
              구글 계정으로 바로 시작해요. 처음이면 가입으로 이어져요.
            </p>

            {/* 구글로 시작하기. 클라이언트 ID 가 없으면(lib/googleClient.ts) 버튼 대신 안내를 보여줍니다. */}
            {isGoogleConfigured ? (
              // 확인하는 중에는 버튼을 눌러도 아무 일이 없도록 막고 흐리게 보입니다. (구글이 그리는 버튼이라 disabled 를 줄 수 없어서 pointer-events 로 막습니다)
              <div
                aria-busy={isGoogleWorking}
                className={cn(isGoogleWorking && 'pointer-events-none opacity-60')}
              >
                <GoogleButton
                  onCredential={(credential) => void handleGoogleCredential(credential)}
                  onFail={() => setGoogleError('구글 창을 마치지 않았어요. 다시 눌러 주세요.')}
                />
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-500">
                구글로 시작하기는 아직 준비 중이에요.
              </p>
            )}
            {isGoogleWorking && (
              <p role="status" className="text-sm text-slate-500">
                구글 계정을 확인하는 중…
              </p>
            )}
            {googleError !== null && (
              <p role="alert" className="text-sm break-keep text-red-600">
                {googleError}
              </p>
            )}

            <div className="border-t border-slate-100 pt-3 text-[13px] break-keep text-slate-500">
              <p>약관 동의는 다음 화면에서 따로 받아요.</p>
              <p>고등학생만 가입할 수 있어요.</p>
            </div>
          </Card>

          {/* 이미 로그인한 사람에게는 보이지 않습니다. (로그인한 채로 틀린 코드를 넣으면 401 때문에 로그아웃되기 때문입니다) */}
          {isDemoCodeLoginOn && !isLoggedIn && (
            <DemoCodeLoginPanel
              isWorking={isDemoWorking}
              error={demoError}
              onSubmit={(code) => void handleDemoCode(code)}
            />
          )}

          {isTestLoginOn && <TestLoginPanel onStart={handleTestLogin} />}
        </div>
      </div>
    </PlainLayout>
  )
}
