import { helpLines } from '@/lib/helpLines'
import { useLocation, useNavigate } from 'react-router-dom'

/** 하트 아이콘. 글자 없이 분위기만 전하는 그림이라 스크린리더가 읽지 않게 aria-hidden 입니다. */
function HeartIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  )
}

/** 전화기 아이콘 */
function PhoneIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  )
}

/**
 * 위기 표현이나 오랜 기분 저하가 보일 때 안내하는 도움 연결 화면입니다. (#96)
 * 헤더·하단 탭 없이 화면 전체를 쓰고, 다그치는 말투나 공부·채찍 관련 UI 는 일절 넣지 않습니다.
 * 전화번호를 누르면 바로 전화가 걸립니다. 로그인하지 않았어도 열 수 있습니다.
 */
export function SupportPage() {
  const navigate = useNavigate()
  const location = useLocation()

  /** "괜찮아, 돌아갈게": 오기 전 화면으로. 주소를 직접 열어서 돌아갈 곳이 없으면 홈으로 갑니다. */
  function handleBack() {
    // 이 화면이 앱 안에서 처음 열린 화면이면 location.key 가 'default' 입니다.
    if (location.key === 'default') {
      navigate('/')
    } else {
      navigate(-1)
    }
  }

  return (
    // min-h-screen: 모바일 주소창 때문에 h-screen 대신 씁니다.
    <div className="flex min-h-screen items-center justify-center bg-teal-50 px-4 py-10">
      <main className="w-full max-w-md text-center">
        <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <HeartIcon />
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight break-words text-slate-900 sm:text-3xl">
          오늘 많이 힘들었구나
        </h1>
        <p className="mt-3 text-slate-700">
          지금은 공부 얘기 안 할게.
          <br />
          독촉이랑 채찍은 모두 멈췄어.
        </p>

        <ul className="mt-6 flex flex-col gap-3 text-left">
          {helpLines.map((line) => (
            <li key={line.number}>
              {/* 누르면 바로 전화가 걸립니다. min-h-16 = 64px 로 크게 만들어 손가락으로 누르기 쉽습니다. */}
              <a
                href={`tel:${line.number}`}
                className="flex min-h-16 items-center gap-4 rounded-2xl bg-teal-700 px-5 py-3 text-white transition-colors hover:bg-teal-800"
              >
                <PhoneIcon />
                <span className="min-w-0">
                  <span className="block text-lg font-bold break-words">
                    {line.name} {line.number}
                  </span>
                  <span className="block text-sm text-teal-50">{line.detail}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-5 rounded-2xl border border-teal-200 bg-white px-5 py-4 text-left text-sm break-words text-slate-600">
          믿을 수 있는 어른(부모님·선생님)에게 지금 기분을 이야기해 보는 것도 좋아. 혼자 견디지
          않아도 돼.
        </p>

        <button
          type="button"
          onClick={handleBack}
          className="mt-6 inline-flex h-12 cursor-pointer items-center px-4 text-slate-700 underline"
        >
          괜찮아, 돌아갈게
        </button>
      </main>
    </div>
  )
}
