import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/hooks/useAuth'
import { getGoogleAuthErrorMessage, startWithGoogle } from '@/lib/authApi'
import { getAfterLoginPath, getReturnPath } from '@/lib/authRedirect'
import { isGoogleConfigured } from '@/lib/googleClient'
import { savePendingGoogleSignup } from '@/lib/googleSignup'
import { hasSignupInfo, markSignupDone } from '@/lib/signup'
import { TEST_TOKEN, isTestLoginEnabled, testUser } from '@/lib/testLogin'
import { GoogleLogin } from '@react-oauth/google'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

// 테스트 로그인을 보여줄지. `.env` 값은 앱이 켜진 뒤에 바뀌지 않아서, 화면 밖에서 한 번만 정합니다.
const isTestLoginOn = isTestLoginEnabled(import.meta.env.VITE_TEST_LOGIN)

// 구글 버튼의 가장 넓은 폭(px). 구글이 400 보다 넓게는 그려 주지 않습니다.
const GOOGLE_BUTTON_MAX_WIDTH = 400

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

interface GoogleStartButtonProps {
  /** 구글이 신분증(credential)을 줬을 때 */
  onCredential: (credential: string) => void
  /** 구글 창이 실패했을 때 */
  onFail: () => void
}

/**
 * [Google로 시작하기] 버튼입니다. 버튼은 구글이 직접 그립니다. (@react-oauth/google 의 GoogleLogin)
 * 구글 버튼은 폭을 숫자(px)로만 받아서, 감싼 칸의 폭을 재서 넘겨줍니다. 화면을 돌려 폭이 바뀌면 다시 잽니다.
 */
function GoogleStartButton({ onCredential, onFail }: GoogleStartButtonProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  // 감싼 칸의 폭. 재기 전에는 null 이라 버튼을 그리지 않습니다.
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    // ResizeObserver: 칸의 크기가 바뀔 때마다 알려 주는 브라우저 기능입니다.
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.min(GOOGLE_BUTTON_MAX_WIDTH, Math.floor(entry.contentRect.width)))
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  return (
    // min-h-10: 버튼이 그려지기 전에도 자리를 잡아 두어서 아래 내용이 들썩이지 않게 합니다.
    <div ref={boxRef} className="flex min-h-10 w-full justify-center">
      {width !== null && (
        <GoogleLogin
          onSuccess={(response) => {
            if (response.credential) onCredential(response.credential)
            else onFail()
          }}
          onError={onFail}
          text="continue_with"
          shape="rectangular"
          width={width}
        />
      )}
    </div>
  )
}

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

/**
 * 로그인 화면입니다. 시안(docs/design/screens/login-*.png)처럼 왼쪽은 앱 소개, 오른쪽은 "시작하기" 카드입니다.
 *  - [Google로 시작하기] : 가입한 구글 계정이면 바로 로그인, 처음이면 가입 화면으로 이어집니다. (#319)
 *    로그인은 구글 하나뿐입니다. 이메일 가입이 없어서 이메일 로그인도 뺐습니다. (2026-10-17)
 *  - 테스트 모드 (VITE_TEST_LOGIN=false 가 아닐 때만)
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

  function handleTestLogin() {
    // 테스트 로그인은 앱을 바로 둘러보려는 것이라 가입 화면을 건너뜁니다. "가입 마침" 표시를 해 두면 홈으로 갑니다.
    // (가입 화면은 로그인한 채로 /signup 을 직접 열면 볼 수 있습니다)
    markSignupDone()
    login(testUser, TEST_TOKEN)
    setHasJustLoggedIn(true)
  }

  /** 구글이 신분증을 줬을 때. 서버가 확인해서 "로그인" 또는 "가입 필요" 를 알려 줍니다. (lib/authApi.ts) */
  async function handleGoogleCredential(credential: string) {
    setIsGoogleWorking(true)
    setGoogleError(null)
    try {
      const result = await startWithGoogle(credential)
      if (result.status === 'LOGGED_IN') {
        // 구글로 이미 가입한 사람입니다. 이 기기에 가입 정보가 없어도 가입 화면으로 보내지 않습니다.
        markSignupDone()
        login(result.auth.user, result.auth.token)
        setHasJustLoggedIn(true)
        return
      }
      // 처음 온 구글 계정입니다. 가입 화면으로 이어 갑니다.
      // 구글 신분증은 가입을 마칠 때까지 이 탭에만 잠깐 둡니다. (lib/googleSignup.ts)
      savePendingGoogleSignup({ credential, name: result.name, email: result.email })
      navigate('/signup?step=1')
    } catch (error) {
      setGoogleError(getGoogleAuthErrorMessage(error))
    } finally {
      setIsGoogleWorking(false)
    }
  }

  // 로그인이 되면 갈 곳으로 보냅니다. 가려던 페이지가 있으면 거기로, 없으면 홈입니다.
  // (구글 · 테스트 로그인은 모두 위에서 "가입 마침" 표시를 해 두어서 가입 화면으로 가지 않습니다)
  // replace: 로그인 화면을 기록에 남기지 않습니다.
  // 가려던 주소 없이 /login 을 직접 연 "이미 로그인한 사람" 은 그대로 둡니다. (로그아웃 버튼을 쓸 수 있어야 하기 때문입니다)
  if (isLoggedIn && (hasJustLoggedIn || returnPath !== null)) {
    return <Navigate to={getAfterLoginPath(hasSignupInfo(), returnPath)} replace />
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      {/* ---------- 왼쪽: 앱 소개 ---------- */}
      <section className="flex flex-col gap-5 lg:pt-4">
        <p className="text-brand text-sm font-semibold">학생·입시생 AI 자기관리</p>
        <h1 className="text-3xl leading-tight font-bold tracking-tight break-keep sm:text-4xl">
          주머니 속
          <br />
          관리형 독서실 선생님
        </h1>
        <p className="break-keep text-slate-600">
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
              <span className="text-sm break-keep text-slate-700">{feature.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 오른쪽: 시작하기 ---------- */}
      <div className="flex flex-col gap-6">
        <Card title="시작하기" className="flex flex-col gap-4">
          <p className="-mt-1 text-sm break-keep text-slate-500">
            구글 계정으로 바로 시작해요. 처음이면 가입으로 이어져요.
          </p>

          {/* 구글로 시작하기. 클라이언트 ID 가 없으면(lib/googleClient.ts) 버튼 대신 안내를 보여줍니다. */}
          {isGoogleConfigured ? (
            <GoogleStartButton
              onCredential={(credential) => void handleGoogleCredential(credential)}
              onFail={() => setGoogleError('구글 창을 마치지 않았어요. 다시 눌러 주세요.')}
            />
          ) : (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
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

          <div className="border-t border-slate-100 pt-3 text-xs break-keep text-slate-500">
            <p>약관 동의는 다음 화면에서 따로 받아요.</p>
            <p>만 14세 이상만 가입할 수 있어요.</p>
          </div>
        </Card>

        {isTestLoginOn && <TestLoginPanel onStart={handleTestLogin} />}
      </div>
    </div>
  )
}
