import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  SIGNUP_STORAGE_KEY,
  canSubmitSignup,
  getNicknameError,
  isAllConsented,
  makeAllConsents,
  type SignupConsents,
  type SignupInfo,
} from '@/lib/signup'
import { saveData } from '@/lib/storage'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

/*
 * ⚠️ 이 화면의 동의 문구(약관 전문, "쓰는 곳" 안내)는 임시입니다.
 *    동의 문구는 Tmax-IT-Hope-School/Project#8 검토 뒤에 확정되니, 그때 아래 글자를 바꾸세요.
 */

type ConsentKey = keyof SignupConsents

interface ConsentItem {
  key: ConsentKey
  label: string
  isRequired: boolean
  /** 라벨 아래 작은 설명 (없어도 됩니다) */
  description?: string
  /** "보기" 를 눌렀을 때 팝업에 보여줄 글 */
  detail: string
}

// 동의 항목. 이 순서대로 보입니다.
const consentItems: ConsentItem[] = [
  {
    key: 'terms',
    label: '서비스 이용약관',
    isRequired: true,
    detail: '서비스 이용약관 전문은 문구가 확정되면 이곳에서 볼 수 있어요.',
  },
  {
    key: 'privacy',
    label: '개인정보 수집·이용',
    isRequired: true,
    detail:
      '무엇을 모으는지는 가입 화면의 "무엇을 모으나요?" 에서 볼 수 있어요. 전문은 문구가 확정되면 이곳에서 볼 수 있어요.',
  },
  {
    key: 'diaryAnalysis',
    label: '일기·감정 기록을 분석에 쓰기',
    isRequired: false,
    description: '안 해도 앱을 쓸 수 있어요. 일기 원문은 나만 봐요.',
    detail: '일기·감정 기록을 분석에 쓰는 방법은 문구가 확정되면 이곳에서 볼 수 있어요.',
  },
]

// "무엇을 모으나요?" 에 보이는 안내. (펼쳐 보는 상자)
const collectedItems = [
  '공부 기록 — 타이머 시간, 계획, 달성률',
  '매일 체크인 — 컨디션, 기분, 못 한 이유, 예상 공부 시간',
  '일기·감정 — 위에서 [선택]에 동의한 경우에만',
  '쓰는 곳 — 나에게 맞는 계획과 피드백, 리포트를 만드는 데 써요',
  '실명·전화번호·학교는 받지 않아요',
  '설정 › 내 데이터에서 언제든 지울 수 있어요',
]

// 위쪽 3단계 안내. 지금은 두 번째(가입 정보) 단계입니다.
const signupSteps = [
  { label: '로그인 완료', state: 'done' },
  { label: '가입 정보', state: 'current' },
  { label: '온보딩', state: 'next' },
] as const

/** "1 로그인 완료 / 2 가입 정보 / 3 온보딩" 처럼 지금 어느 단계인지 보여주는 막대입니다. */
function SignupSteps() {
  return (
    <ol className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
      {signupSteps.map((step, index) => (
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

/** 만 14세 미만이라고 답했을 때 보이는 안내 화면입니다. 입력한 정보는 저장하지 않습니다. */
function UnderFourteenView() {
  const navigate = useNavigate()

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
        <Button
          variant="secondary"
          size="lg"
          className="mt-4 w-full"
          onClick={() => navigate('/login')}
        >
          로그인 화면으로
        </Button>
      </div>
    </PlainLayout>
  )
}

/**
 * SNS 로그인을 처음 한 사람에게 가입 정보를 받는 화면입니다.
 *  1) 닉네임  2) 만 14세 이상인지 확인  3) 개인정보 수집·이용 동의
 * 다 마치면 정보를 저장하고 온보딩(/onboarding)으로 갑니다.
 *
 * 만 14세 미만(아니요)을 고르면 가입 불가 안내 화면으로 바뀌고, 아무것도 저장하지 않습니다.
 * 학년·목표 시험 등은 온보딩에서 받습니다.
 */
export function SignupPage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  // 닉네임 칸을 한 번이라도 건드렸는지. 처음 열었을 때부터 빨간 글씨를 보여주지 않으려고 씁니다.
  const [isNicknameTouched, setIsNicknameTouched] = useState(false)
  // 만 14세 이상인지. 아직 안 골랐으면 null, 네 = true, 아니요 = false
  const [isOver14, setIsOver14] = useState<boolean | null>(null)
  const [consents, setConsents] = useState<SignupConsents>(makeAllConsents(false))
  // "보기" 로 열어 둔 동의 항목. 아무것도 안 열었으면 null
  const [openedKey, setOpenedKey] = useState<ConsentKey | null>(null)

  // 만 14세 미만이면 입력 화면 대신 안내 화면을 보여줍니다.
  if (isOver14 === false) return <UnderFourteenView />

  const nicknameError = isNicknameTouched ? getNicknameError(nickname) : null
  const canSubmit = canSubmitSignup(nickname, isOver14, consents)
  const openedItem = consentItems.find((item) => item.key === openedKey)

  function handleChangeConsent(key: ConsentKey, isChecked: boolean) {
    setConsents((prev) => ({ ...prev, [key]: isChecked }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (!canSubmit) return

    const info: SignupInfo = { nickname: nickname.trim(), consents, agreedAt: Date.now() }
    saveData(SIGNUP_STORAGE_KEY, info)
    navigate('/onboarding')
  }

  return (
    <PlainLayout>
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <SignupSteps />

        <div>
          <h1 className="text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            반가워요! 가입 정보를 알려주세요
          </h1>
          {/* 어떤 SNS 로 로그인했는지는 아직 저장하지 않아서(#47 이후) 이름 없이 적습니다. */}
          <p className="mt-2 text-slate-600">SNS 계정으로 로그인했어요.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Input
            id="nickname"
            label="닉네임"
            value={nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder="예) 공부하는 고양이"
            error={nicknameError ?? undefined}
            onChange={(event) => {
              setNickname(event.target.value)
              setIsNicknameTouched(true)
            }}
            onBlur={() => setIsNicknameTouched(true)}
            className="h-12 text-base"
          />
          <p className="text-sm text-slate-500">
            앱에서 부르는 이름이에요. 실명은 받지 않아요. ({NICKNAME_MIN_LENGTH}~
            {NICKNAME_MAX_LENGTH}자)
          </p>
        </div>

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
          {/* 닉네임·나이·필수 동의 중 하나라도 빠졌으면 눌리지 않습니다. */}
          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
            다음 · 온보딩 시작
          </Button>
          {!canSubmit && (
            <p className="text-center text-sm break-keep text-slate-500">
              닉네임, 만 14세 확인, 필수 동의를 마치면 눌러져요.
            </p>
          )}
        </div>
      </form>

      <Modal
        isOpen={openedItem !== undefined}
        onClose={() => setOpenedKey(null)}
        title={openedItem?.label}
      >
        <p className="break-keep text-slate-700">{openedItem?.detail}</p>
        <Button className="mt-5 w-full" onClick={() => setOpenedKey(null)}>
          닫기
        </Button>
      </Modal>
    </PlainLayout>
  )
}
