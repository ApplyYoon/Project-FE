import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { getPasswordAuthErrorMessage, signupWithPassword } from '@/lib/authApi'
import { cn } from '@/lib/cn'
import {
  getSchoolQueryError,
  searchHighSchools,
  type School,
  type SchoolSearchResult,
} from '@/lib/schoolSearch'
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  SIGNUP_STORAGE_KEY,
  canSubmitSignup,
  getEmailError,
  getNameError,
  getNicknameError,
  getPasswordConfirmError,
  getPasswordError,
  isAllConsented,
  makeAllConsents,
  type SignupConsents,
  type SignupInfo,
} from '@/lib/signup'
import { saveData } from '@/lib/storage'
import { diaryAnalysisConsent, privacyConsent, serviceTerms, type TermsDocument } from '@/lib/terms'
import { testUser } from '@/lib/testLogin'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/*
 * ⚠️ 이 화면의 동의 문구("쓰는 곳" 안내)와 "보기" 로 여는 약관 전문(lib/terms.ts)은 초안입니다.
 *    동의 문구는 Tmax-IT-Hope-School/Project#8 검토 뒤에 확정되니, 그때 글자를 바꾸세요.
 *    (이름·이메일·학교를 받게 되면서 "무엇을 모으나요?" 의 내용이 바뀌었습니다. 이 부분도 같이 검토받아야 합니다)
 */

type ConsentKey = keyof SignupConsents

interface ConsentItem {
  key: ConsentKey
  label: string
  isRequired: boolean
  /** 라벨 아래 작은 설명 (없어도 됩니다) */
  description?: string
  /** "보기" 를 눌렀을 때 팝업에 보여줄 안내문 (lib/terms.ts) */
  terms: TermsDocument
}

// 동의 항목. 이 순서대로 보입니다.
const consentItems: ConsentItem[] = [
  {
    key: 'terms',
    label: '서비스 이용약관',
    isRequired: true,
    terms: serviceTerms,
  },
  {
    key: 'privacy',
    label: '개인정보 수집·이용',
    isRequired: true,
    terms: privacyConsent,
  },
  {
    key: 'diaryAnalysis',
    label: '일기·감정 기록을 분석에 쓰기',
    isRequired: false,
    description: '안 해도 앱을 쓸 수 있어요. 일기 원문은 나만 봐요.',
    terms: diaryAnalysisConsent,
  },
]

// "무엇을 모으나요?" 에 보이는 안내. (펼쳐 보는 상자)
const collectedItems = [
  '공부 기록 — 타이머 시간, 계획, 달성률',
  '매일 체크인 — 컨디션, 기분, 못 한 이유, 예상 공부 시간',
  '일기·감정 — 위에서 [선택]에 동의한 경우에만',
  '쓰는 곳 — 나에게 맞는 계획과 피드백, 리포트를 만드는 데 써요',
  '가입 정보 — 이름, 닉네임, 이메일, 학교(고른 경우에만)',
  '전화번호·주소는 받지 않아요',
  '설정 › 내 데이터에서 언제든 지울 수 있어요',
]

// 위쪽 단계 안내. SNS·테스트 로그인을 하고 온 사람은 3단계 중 두 번째(가입 정보)입니다.
const signupSteps = [
  { label: '로그인 완료', state: 'done' },
  { label: '가입 정보', state: 'current' },
  { label: '온보딩', state: 'next' },
] as const

// 이메일로 가입하는 사람은 로그인을 먼저 하지 않아서 2단계입니다.
const emailSignupSteps = [
  { label: '가입 정보', state: 'current' },
  { label: '온보딩', state: 'next' },
] as const

interface SignupStepsProps {
  /** 이메일로 가입하는 중이면 true (로그인 없이 가입 화면에 온 사람) */
  isEmailSignup: boolean
}

/** "1 로그인 완료 / 2 가입 정보 / 3 온보딩" 처럼 지금 어느 단계인지 보여주는 막대입니다. */
function SignupSteps({ isEmailSignup }: SignupStepsProps) {
  const steps = isEmailSignup ? emailSignupSteps : signupSteps

  return (
    <ol
      className={cn('grid gap-2 text-xs sm:text-sm', isEmailSignup ? 'grid-cols-2' : 'grid-cols-3')}
    >
      {steps.map((step, index) => (
        <li key={step.label} className="flex flex-col gap-2">
          <span
            className={cn('h-1 rounded-full', step.state === 'next' ? 'bg-slate-200' : 'bg-brand')}
          />
          <span
            className={cn(
              'break-keep',
              step.state === 'current' && 'font-bold text-slate-900',
              step.state === 'done' && 'text-brand font-semibold',
              step.state === 'next' && 'text-slate-500',
            )}
          >
            {index + 1} {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

interface TermsViewProps {
  terms: TermsDocument
}

/** 약관·동의 안내문 한 편을 보여줍니다. 글이 길면 팝업(Modal) 안에서 스크롤됩니다. */
function TermsView({ terms }: TermsViewProps) {
  return (
    <div className="flex flex-col gap-4 text-sm break-keep text-slate-700">
      <p>{terms.intro}</p>
      {terms.sections.map((section) => (
        <section key={section.title}>
          <h3 className="font-semibold text-slate-900">{section.title}</h3>
          <ul className="mt-1.5 flex list-disc flex-col gap-1.5 pl-5">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-slate-500">마지막으로 고친 날: {terms.updatedAt}</p>
    </div>
  )
}

interface ChoiceCardProps {
  label: string
  isSelected: boolean
  onSelect: () => void
}

/** "네 / 아니요" 처럼 하나만 고르는 카드입니다. (카드 전체가 눌립니다) */
function ChoiceCard({ label, isSelected, onSelect }: ChoiceCardProps) {
  return (
    <label
      className={cn(
        // min-h-14 = 56px. 글자가 두 줄이 되어도 카드가 같이 커집니다.
        'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 font-medium',
        isSelected
          ? 'border-brand bg-brand-light text-brand'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      <input
        type="radio"
        name="isOver14"
        checked={isSelected}
        onChange={onSelect}
        className="accent-brand h-5 w-5 shrink-0"
      />
      <span className="break-keep">{label}</span>
    </label>
  )
}

interface SchoolFieldProps {
  /** 지금 골라 둔 학교. 아직 안 골랐으면 null */
  school: School | null
  /** 학교를 골랐을 때(School) 또는 고른 것을 취소했을 때(null) */
  onChange: (school: School | null) => void
}

/**
 * 고등학교를 검색해서 하나 고르는 칸입니다. (검색은 lib/schoolSearch.ts)
 *   아직 안 골랐으면 -> 검색어 칸 + "검색" 버튼 + 결과 목록
 *   골랐으면         -> 고른 학교 + "바꾸기" 버튼
 */
function SchoolField({ school, onChange }: SchoolFieldProps) {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  // 마지막 검색 결과. 아직 검색하지 않았으면 null
  const [result, setResult] = useState<SchoolSearchResult | null>(null)
  // 검색어가 너무 짧거나 검색에 실패했을 때 보여줄 안내. 없으면 null
  const [searchError, setSearchError] = useState<string | null>(null)

  async function handleSearch() {
    // 찾는 중에 또 누르면 응답이 뒤섞일 수 있어서, 끝날 때까지 기다립니다.
    if (isSearching) return

    const queryError = getSchoolQueryError(query)
    if (queryError !== null) {
      setSearchError(queryError)
      setResult(null)
      return
    }

    setIsSearching(true)
    setSearchError(null)
    try {
      setResult(await searchHighSchools(query))
    } catch {
      setResult(null)
      setSearchError('학교를 검색하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setIsSearching(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    // 이 칸은 가입 form 안에 있어서, 그냥 두면 Enter 가 "가입 제출" 이 됩니다. 검색으로 바꿉니다.
    event.preventDefault()
    // 한글은 글자를 조합하는 중에도 Enter 가 한 번 들어옵니다. 조합이 끝난 Enter 에만 검색합니다.
    if (event.nativeEvent.isComposing) return
    handleSearch()
  }

  if (school !== null) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-slate-700">고등학교</p>
        <div className="border-brand bg-brand-light flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3">
          {/* min-w-0: 긴 학교 이름·주소가 "바꾸기" 버튼을 밀어내지 않고 줄바꿈되게 합니다. */}
          <div className="min-w-0">
            <p className="font-semibold break-keep text-slate-900">{school.name}</p>
            <p className="text-sm break-keep text-slate-600">{school.address || school.region}</p>
          </div>
          <Button variant="secondary" className="shrink-0" onClick={() => onChange(null)}>
            바꾸기
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* items-end: 라벨이 붙은 입력 칸과 버튼의 아래쪽을 맞춥니다. */}
      <div className="flex items-end gap-2">
        <Input
          id="school"
          label="고등학교 (선택)"
          value={query}
          placeholder="예) 디지털미디어"
          // 검색어를 적는 칸이라 브라우저의 자동 완성(예전에 적은 값 추천)은 끕니다.
          autoComplete="off"
          // 휴대폰 키보드의 Enter 자리에 "검색" 이 보이게 합니다.
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          className="h-12 text-base"
        />
        <Button
          variant="secondary"
          size="lg"
          className="shrink-0 px-4"
          onClick={handleSearch}
          disabled={isSearching}
        >
          {isSearching ? '찾는 중…' : '검색'}
        </Button>
      </div>
      <p className="text-sm break-keep text-slate-500">
        학교 이름의 일부만 적고 검색해도 돼요. 졸업했거나 목록에 없으면 비워 두세요.
      </p>

      {/* role="alert": 안내가 뜨면 스크린리더가 바로 읽어 줍니다. */}
      {searchError !== null && (
        <p role="alert" className="text-sm break-keep text-red-600">
          {searchError}
        </p>
      )}

      {result !== null && (
        // aria-live: 검색 결과가 나오면 스크린리더가 알려 줍니다.
        <div aria-live="polite" className="flex flex-col gap-2">
          {result.schools.length === 0 ? (
            <p className="text-sm break-keep text-slate-600">
              찾은 고등학교가 없어요. 줄임말 대신 학교 이름의 일부를 적어 보세요. (예: 디미고 →
              디지털미디어)
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.schools.map((item) => (
                <li key={item.code}>
                  {/* min-h-14 = 56px. 주소가 두 줄이 되어도 버튼이 같이 커집니다. */}
                  <button
                    type="button"
                    onClick={() => onChange(item)}
                    className="hover:border-brand flex min-h-14 w-full cursor-pointer flex-col items-start justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-left"
                  >
                    <span className="font-medium break-keep text-slate-900">{item.name}</span>
                    <span className="text-sm break-keep text-slate-500">
                      {item.address || item.region}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 인증키 없이는 5곳까지만 받을 수 있어서, 더 있으면 알려 줍니다. */}
          {result.totalCount > result.schools.length && (
            <p className="text-sm break-keep text-slate-500">
              {result.totalCount}곳 중 {result.schools.length}곳만 보여요. 이름을 더 자세히 적으면
              찾기 쉬워요.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** 만 14세 미만이라고 답했을 때 보이는 안내 화면입니다. 입력한 정보는 저장하지 않습니다. */
function UnderFourteenView() {
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
        <p className="text-sm break-keep text-slate-500">입력한 가입 정보는 저장하지 않았어요.</p>
        <Button variant="secondary" size="lg" className="mt-4 w-full" onClick={handleLeave}>
          로그인 화면으로
        </Button>
      </div>
    </PlainLayout>
  )
}

/**
 * 가입 정보를 받는 화면입니다. 두 가지 경우에 옵니다.
 *   - SNS·테스트 로그인을 처음 한 사람: 이미 로그인된 상태라 비밀번호 없이 가입 정보만 받습니다.
 *   - 로그인 없이 온 사람(헤더의 "회원가입"): 이메일·비밀번호로 가입합니다. 서버에 계정을 만들고 바로 로그인됩니다.
 *  1) 이름·닉네임·이메일·고등학교(선택)  2) 만 14세 이상인지 확인  3) 개인정보 수집·이용 동의
 * 다 마치면 정보를 저장하고 온보딩(/onboarding)으로 갑니다.
 *
 * 만 14세 미만(아니요)을 고르면 가입 불가 안내 화면으로 바뀌고, 아무것도 저장하지 않습니다.
 * 학년·목표 시험 등은 온보딩에서 받습니다.
 */
export function SignupPage() {
  const navigate = useNavigate()
  const { user, isLoggedIn, login } = useAuth()
  // 이메일로 가입하는 중인지 = 로그인 없이 이 화면에 온 사람인지. (SNS·테스트 로그인을 하고 온 사람은 false)
  // 화면이 처음 그려질 때 한 번만 정합니다. 가입에 성공해 로그인되는 순간 화면이 바뀌면 안 되기 때문입니다.
  const [isEmailSignup] = useState(!isLoggedIn)
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  // 고른 고등학교. 안 골라도 가입할 수 있어서 null 로 시작합니다.
  const [school, setSchool] = useState<School | null>(null)
  // 칸을 한 번이라도 건드렸는지. 처음 열었을 때부터 빨간 글씨를 보여주지 않으려고 씁니다.
  const [isNameTouched, setIsNameTouched] = useState(false)
  const [isNicknameTouched, setIsNicknameTouched] = useState(false)
  const [isEmailTouched, setIsEmailTouched] = useState(false)
  // 이메일로 가입할 때만 쓰는 비밀번호. 서버로 보내기만 하고 이 기기에는 저장하지 않습니다.
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isPasswordTouched, setIsPasswordTouched] = useState(false)
  const [isPasswordConfirmTouched, setIsPasswordConfirmTouched] = useState(false)
  // 서버에 가입을 보내고 답을 기다리는 중인지, 실패했을 때 보여줄 안내
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // 만 14세 이상인지. 아직 안 골랐으면 null, 네 = true, 아니요 = false
  const [isOver14, setIsOver14] = useState<boolean | null>(null)
  const [consents, setConsents] = useState<SignupConsents>(makeAllConsents(false))
  // "보기" 로 열어 둔 동의 항목. 아무것도 안 열었으면 null
  const [openedKey, setOpenedKey] = useState<ConsentKey | null>(null)

  // 만 14세 미만이면 입력 화면 대신 안내 화면을 보여줍니다.
  if (isOver14 === false) return <UnderFourteenView />

  // 테스트 로그인으로 들어온 사람인지. (lib/testLogin.ts)
  const isTestUser = user?.id === testUser.id
  const nameError = isNameTouched ? getNameError(name) : null
  const nicknameError = isNicknameTouched ? getNicknameError(nickname) : null
  const emailError = isEmailTouched ? getEmailError(email) : null
  const passwordError = isPasswordTouched ? getPasswordError(password) : null
  const passwordConfirmError = isPasswordConfirmTouched
    ? getPasswordConfirmError(password, passwordConfirm)
    : null
  // 이메일로 가입할 때는 비밀번호 두 칸도 맞아야 합니다.
  const isPasswordReady =
    !isEmailSignup ||
    (getPasswordError(password) === null &&
      getPasswordConfirmError(password, passwordConfirm) === null)
  const canSubmit =
    canSubmitSignup({ name, nickname, email, isOver14, consents }) && isPasswordReady
  const openedItem = consentItems.find((item) => item.key === openedKey)

  function handleChangeConsent(key: ConsentKey, isChecked: boolean) {
    setConsents((prev) => ({ ...prev, [key]: isChecked }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (!canSubmit || isSubmitting) return

    // 이 기기에 저장해 두는 가입 정보입니다. 비밀번호는 넣지 않습니다.
    const info: SignupInfo = {
      name: name.trim(),
      nickname: nickname.trim(),
      email: email.trim(),
      school,
      consents,
      agreedAt: Date.now(),
    }

    // 이메일 가입: 서버에 계정을 만들고, 성공하면 바로 로그인된 상태가 됩니다. (lib/authApi.ts)
    if (isEmailSignup) {
      setIsSubmitting(true)
      setSubmitError(null)
      try {
        const result = await signupWithPassword({
          email: info.email,
          password,
          name: info.name,
          nickname: info.nickname,
          school,
          consents,
        })
        login(result.user, result.token)
      } catch (error) {
        setSubmitError(getPasswordAuthErrorMessage(error, 'signup'))
        setIsSubmitting(false)
        // 실패하면 가입 정보도 저장하지 않고 이 화면에 머뭅니다.
        return
      }
    }

    saveData(SIGNUP_STORAGE_KEY, info)
    navigate('/onboarding')
  }

  return (
    <PlainLayout>
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <SignupSteps isEmailSignup={isEmailSignup} />

        <div>
          <h1 className="text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            반가워요! 가입 정보를 알려주세요
          </h1>
          {/* 어떤 SNS 로 로그인했는지는 아직 저장하지 않아서(#47 이후) 이름 없이 적습니다. */}
          {isEmailSignup ? (
            <p className="mt-2 break-keep text-slate-600">
              이메일과 비밀번호로 가입해요. 이미 계정이 있다면{' '}
              {/* h-10 = 40px. 글자는 작아도 누르는 영역은 손가락으로 누를 만하게 합니다. */}
              <Link
                to="/login"
                className="text-brand inline-flex h-10 items-center font-medium underline underline-offset-4"
              >
                로그인
              </Link>
            </p>
          ) : (
            <p className="mt-2 break-keep text-slate-600">
              {isTestUser
                ? '테스트 계정으로 로그인했어요. 적은 정보는 이 브라우저에만 저장돼요.'
                : 'SNS 계정으로 로그인했어요.'}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Input
            id="name"
            label="이름"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            placeholder="예) 김하늘"
            // autoComplete: 브라우저가 저장해 둔 내 이름을 추천해 줍니다.
            autoComplete="name"
            error={nameError ?? undefined}
            onChange={(event) => setName(event.target.value)}
            // 다 적고 칸을 떠났을 때부터 검사합니다. (적는 중에 빨간 글씨가 뜨지 않게)
            onBlur={() => setIsNameTouched(true)}
            className="h-12 text-base"
          />
          <p className="text-sm text-slate-500">
            실제 이름을 적어 주세요. ({NAME_MIN_LENGTH}~{NAME_MAX_LENGTH}자)
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Input
            id="nickname"
            label="닉네임"
            value={nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder="예) 공부하는 고양이"
            autoComplete="nickname"
            error={nicknameError ?? undefined}
            onChange={(event) => {
              setNickname(event.target.value)
              setIsNicknameTouched(true)
            }}
            onBlur={() => setIsNicknameTouched(true)}
            className="h-12 text-base"
          />
          <p className="text-sm text-slate-500">
            앱에서 부르는 이름이에요. ({NICKNAME_MIN_LENGTH}~{NICKNAME_MAX_LENGTH}자)
          </p>
        </div>

        <Input
          id="email"
          // type="email": 휴대폰에서 @ 가 있는 키보드가 뜹니다.
          type="email"
          label="이메일"
          value={email}
          maxLength={EMAIL_MAX_LENGTH}
          placeholder="예) study@example.com"
          autoComplete="email"
          error={emailError ?? undefined}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setIsEmailTouched(true)}
          className="h-12 text-base"
        />

        {/* 이메일로 가입할 때만 비밀번호를 받습니다. (SNS·테스트 로그인은 비밀번호가 없습니다) */}
        {isEmailSignup && (
          <>
            <div className="flex flex-col gap-2">
              <Input
                id="password"
                // type="password": 적은 글자가 점(●)으로 가려집니다.
                type="password"
                label="비밀번호"
                value={password}
                // new-password: 브라우저가 "새 비밀번호" 로 알고 저장을 물어봅니다.
                autoComplete="new-password"
                error={passwordError ?? undefined}
                onChange={(event) => setPassword(event.target.value)}
                onBlur={() => setIsPasswordTouched(true)}
                className="h-12 text-base"
              />
              <p className="text-sm text-slate-500">
                {PASSWORD_MIN_LENGTH}자 이상, 영문과 숫자를 모두 넣어 주세요.
              </p>
            </div>
            <Input
              id="password-confirm"
              type="password"
              label="비밀번호 확인"
              value={passwordConfirm}
              autoComplete="new-password"
              error={passwordConfirmError ?? undefined}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              onBlur={() => setIsPasswordConfirmTouched(true)}
              className="h-12 text-base"
            />
          </>
        )}

        <SchoolField school={school} onChange={setSchool} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900">만 14세 이상인가요?</legend>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceCard
              label="네, 만 14세 이상이에요"
              isSelected={isOver14 === true}
              onSelect={() => setIsOver14(true)}
            />
            {/* "아니요" 를 누르면 바로 안내 화면으로 바뀌어서, 이 입력 화면에서는 선택된 모양이 될 일이 없습니다. */}
            <ChoiceCard label="아니요" isSelected={false} onSelect={() => setIsOver14(false)} />
          </div>
          <p className="text-sm break-keep text-slate-500">
            만 14세 미만은 보호자 동의 기능이 생긴 뒤에 가입할 수 있어요.
          </p>
        </fieldset>

        <fieldset className="overflow-hidden rounded-xl border border-slate-200">
          <legend className="sr-only">약관 동의</legend>

          <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 font-semibold">
            <input
              type="checkbox"
              checked={isAllConsented(consents)}
              onChange={(event) => setConsents(makeAllConsents(event.target.checked))}
              className="accent-brand h-5 w-5 shrink-0"
            />
            전체 동의
          </label>

          <ul className="divide-y divide-slate-100">
            {consentItems.map((item) => (
              <li key={item.key} className="flex items-start justify-between gap-3 px-4 py-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={consents[item.key]}
                    onChange={(event) => handleChangeConsent(item.key, event.target.checked)}
                    className="accent-brand mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span className="min-w-0 break-keep">
                    <span
                      className={cn(
                        'font-semibold',
                        item.isRequired ? 'text-brand' : 'text-slate-500',
                      )}
                    >
                      {item.isRequired ? '[필수]' : '[선택]'}
                    </span>{' '}
                    {item.label}
                    {item.description && (
                      <span className="mt-1 block text-sm text-slate-500">{item.description}</span>
                    )}
                  </span>
                </label>
                {/* h-10 = 40px. 글자는 작아도 누르는 영역은 손가락으로 누를 만하게 합니다. */}
                <button
                  type="button"
                  onClick={() => setOpenedKey(item.key)}
                  aria-label={`${item.label} 보기`}
                  className="text-brand h-10 shrink-0 cursor-pointer px-1 text-sm underline"
                >
                  보기
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        {/* details/summary: 따로 코드를 쓰지 않아도 눌러서 접고 펼 수 있는 HTML 기본 부품입니다. 처음에는 접혀 있습니다. */}
        <details className="group rounded-xl bg-slate-50 p-4">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
            무엇을 모으나요?
            {/* group-open: 펼쳐졌을 때만 화살표를 뒤집습니다. */}
            <span aria-hidden className="text-slate-500 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm break-keep text-slate-700 sm:text-base">
            {collectedItems.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </details>

        <div className="flex flex-col gap-2">
          {/* 서버가 가입을 거절했거나 연결하지 못했을 때의 안내 (이메일 가입만) */}
          {submitError !== null && (
            <p role="alert" className="text-center text-sm break-keep text-red-600">
              {submitError}
            </p>
          )}
          {/* 이름·닉네임·이메일·나이·필수 동의 중 하나라도 빠졌으면 눌리지 않습니다. */}
          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit || isSubmitting}>
            {isSubmitting
              ? '가입하는 중…'
              : isEmailSignup
                ? '가입하고 온보딩 시작'
                : '다음 · 온보딩 시작'}
          </Button>
          {!canSubmit && (
            <p className="text-center text-sm break-keep text-slate-500">
              {isEmailSignup
                ? '이름·닉네임·이메일·비밀번호, 만 14세 확인, 필수 동의를 마치면 눌러져요.'
                : '이름·닉네임·이메일, 만 14세 확인, 필수 동의를 마치면 눌러져요.'}
            </p>
          )}
        </div>
      </form>

      <Modal
        isOpen={openedItem !== undefined}
        onClose={() => setOpenedKey(null)}
        title={openedItem?.label}
      >
        {openedItem && <TermsView terms={openedItem.terms} />}
        <Button className="mt-5 w-full" onClick={() => setOpenedKey(null)}>
          닫기
        </Button>
      </Modal>
    </PlainLayout>
  )
}
