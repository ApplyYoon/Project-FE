import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { getCareLimits, setInitialCareLimits } from '@/lib/careLimits'
import { getMessageSettings, saveMessageSettings } from '@/lib/messageSettings'
import {
  firstSteps,
  getDaysUntil,
  getUnansweredSteps,
  isAnswerValid,
  parseMultiAnswer,
  toChoiceOption,
  toggleMultiAnswer,
  type OnboardingStep,
} from '@/lib/onboardingSteps'
import { loadData, saveData } from '@/lib/storage'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

// 설문을 끝내고 답을 저장하는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-onboarding-answers' 가 됩니다)
const STORAGE_KEY = 'onboarding-answers'

interface StepInputProps {
  step: OnboardingStep
  value: string
  onChange: (value: string) => void
}

/** 질문 모양(choice·multiChoice·text·date·time)에 맞는 답 입력칸을 그립니다. */
function StepInput({ step, value, onChange }: StepInputProps) {
  // 보기 중 하나 고르기 (카드 모양 라디오 버튼)
  if (step.type === 'choice') {
    return (
      <div role="radiogroup" aria-label={step.title} className="flex flex-col gap-3">
        {step.options.map((rawOption) => {
          // 보이는 글자(label)와 저장할 값(value)이 다른 보기도 있어서, 둘로 나눠서 씁니다.
          const option = toChoiceOption(rawOption)
          const isSelected = option.value === value
          return (
            // h-14 = 56px. label 전체가 눌리는 영역이라 글자 쪽을 눌러도 선택됩니다.
            // border-2: 고른 카드의 테두리를 굵게 보이려고 처음부터 2px 로 둡니다. (1px 였다가 2px 가 되면 카드가 움직여 보입니다)
            <label
              key={option.value}
              className={cn(
                'flex h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 font-medium',
                isSelected
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name={step.key}
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
                className="accent-brand h-5 w-5 shrink-0"
              />
              <span className="break-keep">{option.label}</span>
            </label>
          )
        })}
      </div>
    )
  }

  // 여러 개 고르기 (체크 박스 카드). 누를 때마다 켜고 끄고, 답은 고른 값을 쉼표로 이은 글자입니다.
  if (step.type === 'multiChoice') {
    const optionValues = step.options.map((option) => option.value)
    const pickedValues = parseMultiAnswer(value)
    return (
      <div role="group" aria-label={step.title} className="flex flex-col gap-3">
        {step.options.map((option) => {
          const isSelected = pickedValues.includes(option.value)
          return (
            <label
              key={option.value}
              className={cn(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 font-medium',
                isSelected
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <input
                type="checkbox"
                name={step.key}
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(toggleMultiAnswer(value, option.value, optionValues))}
                className="accent-brand h-5 w-5 shrink-0"
              />
              <span className="break-keep">{option.label}</span>
            </label>
          )
        })}
      </div>
    )
  }

  // 한 줄 글자
  if (step.type === 'text') {
    return (
      <Input
        aria-label={step.title}
        placeholder={step.placeholder}
        maxLength={step.maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 text-base"
      />
    )
  }

  // 날짜. 고르면 시험까지 남은 날(D-day)을 보여주고, 이미 지난 날이면 안내합니다.
  if (step.type === 'date') {
    const days = getDaysUntil(value)
    const hasPassed = value !== '' && days < 0

    return (
      <div className="flex flex-col gap-2">
        <Input
          type="date"
          aria-label={step.title}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          error={hasPassed ? '오늘 이후 날짜를 골라 주세요.' : undefined}
          className="h-12 text-base"
        />
        {days >= 0 && (
          <p className="text-brand text-sm font-medium">
            {days === 0 ? '시험이 오늘이에요 (D-DAY)' : `시험까지 D-${days}`}
          </p>
        )}
      </div>
    )
  }

  // 시각 (step.type === 'time')
  return (
    <Input
      type="time"
      aria-label={step.title}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 text-base"
    />
  )
}

interface OnboardingPageProps {
  /**
   * first: 처음 실행할 때의 짧은 설문입니다. (기본값. 주소: /onboarding)
   * more: 설정의 "내 정보 더 알려주기" 입니다. 아직 안 답한 질문만 이어서 묻습니다. (주소: /onboarding/more)
   */
  mode?: 'first' | 'more'
}

/**
 * 온보딩 설문입니다. 한 화면에 질문 하나씩 보여주고 "다음" 으로 넘어갑니다.
 * 질문 목록은 lib/onboardingSteps.ts 한 곳에서 관리합니다.
 *
 * ■ 처음 설문 (mode 가 'first')
 *   꼭 필요한 질문만 묻습니다. 마지막에 "완료" 를 누르면 답을 저장하고 "준비 끝!" 화면(/onboarding/done)으로 갑니다.
 *   관리 강도 한도와 메시지 설정은 묻지 않고 기본값으로 시작합니다. (설정에서 언제든 바꿉니다) (#239)
 *   위쪽의 "나중에 하기" 를 누르면 답을 저장하지 않고 홈으로 갑니다. (지금까지 고른 답은 사라집니다)
 *   이미 설문을 마친 사람(저장된 답이 있는 사람)이 오면 바로 홈으로 돌려보냅니다.
 *
 * ■ 내 정보 더 알려주기 (mode 가 'more')
 *   아직 안 답한 질문만 이어서 묻습니다. "다음" 을 누를 때마다 그 답을 바로 저장해서, 중간에 나가도 남습니다.
 *   답하기 싫은 질문은 비워 둔 채 "건너뛰기" 로 넘어갑니다. 다 지나가면 설정 화면으로 돌아갑니다.
 *
 * 메뉴·하단 탭이 없는 틀(PlainLayout)로 감싸서 시안처럼 앱 이름만 위에 보입니다.
 */
export function OnboardingPage({ mode = 'first' }: OnboardingPageProps) {
  const navigate = useNavigate()
  const isMore = mode === 'more'
  // 저장된 답. 설문을 한 번도 안 했으면 null 입니다.
  const [savedAnswers] = useState(() => loadData<Record<string, string> | null>(STORAGE_KEY, null))
  // 이번에 물어볼 질문들. 화면이 처음 그려질 때 한 번만 정합니다.
  // (답할 때마다 목록이 줄어들면 "3 / 12" 같은 번호가 흔들리기 때문입니다)
  const [steps] = useState(() => (isMore ? getUnansweredSteps(savedAnswers ?? {}) : firstSteps))
  const [stepIndex, setStepIndex] = useState(0)
  // 지금 화면에서 고른 답. 예) { grade: '고2', targetExam: '수능' }
  // "이전" 으로 돌아가도 여기에 남아 있어서 고른 답이 그대로 보입니다.
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // (더 알려주기에서만) 지금까지 저장된 답. 질문 하나를 넘길 때마다 여기에 더해서 저장합니다.
  const [storedAnswers, setStoredAnswers] = useState<Record<string, string>>(savedAnswers ?? {})

  // 처음 설문: 이미 마친 사람은 홈으로 보냅니다. (Navigate: 화면을 그리는 대신 주소를 바꿔 주는 부품)
  if (!isMore && savedAnswers !== null) return <Navigate to="/" replace />
  // 더 알려주기: 처음 설문을 안 한 사람은 처음 설문부터 하게 하고, 남은 질문이 없으면 설정으로 돌려보냅니다.
  if (isMore && savedAnswers === null) return <Navigate to="/onboarding" replace />
  if (steps.length === 0) return <Navigate to="/settings" replace />

  const step = steps[stepIndex]
  const value = answers[step.key] ?? ''
  const isEmpty = value.trim() === ''
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === steps.length - 1
  // 처음 설문은 답이 있어야(선택 질문 제외) 넘어갑니다. 더 알려주기는 비워 둔 채로도 넘어갈 수 있습니다.
  const canGoNext = isMore ? isEmpty || isAnswerValid(step, value) : isAnswerValid(step, value)
  // 현재 몇 번째 질문까지 왔는지를 0~100 으로 바꿉니다. (예: 10개 중 3번째 = 30)
  const progress = ((stepIndex + 1) / steps.length) * 100

  // 넘어가는 버튼에 보여줄 글자
  let nextLabel = isLastStep ? '완료' : '다음'
  if (isMore && isEmpty) nextLabel = isLastStep ? '건너뛰고 끝내기' : '건너뛰기'

  function handleChangeAnswer(nextValue: string) {
    setAnswers((prev) => ({ ...prev, [step.key]: nextValue }))
  }

  function handlePrev() {
    setStepIndex((index) => Math.max(0, index - 1))
  }

  // form 으로 감싸 두어서 입력칸에서 Enter 를 눌러도 "다음" 이 눌립니다.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (!canGoNext) return

    if (isMore) {
      // 적은 답은 바로 저장합니다. 비워 둔 선택 질문도 "이미 본 질문" 으로 남기려고 빈 글자로 저장합니다.
      // 비워 둔 필수 질문은 저장하지 않습니다. 그래서 다음에 들어오면 다시 물어봅니다.
      if (!isEmpty || step.optional) {
        const nextStored = { ...storedAnswers, [step.key]: value }
        saveData(STORAGE_KEY, nextStored)
        setStoredAnswers(nextStored)
      }
      if (isLastStep) navigate('/settings')
      else setStepIndex((index) => index + 1)
      return
    }

    if (isLastStep) {
      saveData(STORAGE_KEY, answers)
      // 관리 강도 한도 · 독설 수위 · 메시지 설정은 묻지 않고 기본값으로 시작합니다. (#239)
      // getCareLimits · getMessageSettings 는 저장된 게 없으면 기본값을 돌려줍니다.
      const limits = getCareLimits()
      setInitialCareLimits(limits.maxCareLevel, limits.maxHarshness)
      saveMessageSettings(getMessageSettings())
      navigate('/onboarding/done')
      return
    }
    setStepIndex((index) => index + 1)
  }

  return (
    <PlainLayout
      headerAction={
        // h-10 = 40px. 글자는 작아도 누르는 영역은 손가락으로 누를 만하게 합니다.
        <Link
          to={isMore ? '/settings' : '/'}
          className="text-brand inline-flex h-10 items-center text-sm font-medium underline"
        >
          {isMore ? '그만하고 설정으로' : '나중에 하기'}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-brand font-semibold">{step.group}</span>
            <span className="text-slate-500">
              {stepIndex + 1} / {steps.length}
            </span>
          </div>
          <ProgressBar value={progress} />
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            {step.title}
            {step.optional && (
              <span className="ml-2 align-middle text-sm font-medium text-slate-400">(선택)</span>
            )}
          </h1>
          {step.description && (
            <p className="mt-2 text-sm break-keep text-slate-600 sm:text-base">
              {step.description}
            </p>
          )}
        </div>

        {/* key: 질문이 바뀔 때 입력칸을 새로 만들어서 이전 질문의 상태가 섞이지 않게 합니다. */}
        <StepInput key={step.key} step={step} value={value} onChange={handleChangeAnswer} />

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-1/3"
            disabled={isFirstStep}
            onClick={handlePrev}
          >
            이전
          </Button>
          {/* 처음 설문에서는 답이 없으면(선택 질문 제외) 눌리지 않습니다. */}
          <Button type="submit" size="lg" className="flex-1" disabled={!canGoNext}>
            {nextLabel}
          </Button>
        </div>

        <p className="text-center text-sm break-keep text-slate-500">
          {isMore
            ? '안 해도 앱은 그대로 쓸 수 있어요. 답은 넘어갈 때마다 저장돼요.'
            : `질문 ${steps.length}개면 끝나요. 나머지는 나중에 알려줘도 돼요.`}
        </p>
      </form>
    </PlainLayout>
  )
}
