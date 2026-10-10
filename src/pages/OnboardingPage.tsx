import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import {
  getDaysUntil,
  isAnswerValid,
  onboardingSteps,
  type OnboardingStep,
} from '@/lib/onboardingSteps'
import { loadData, saveData } from '@/lib/storage'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

// 설문을 끝내고 답을 저장하는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-onboarding-answers' 가 됩니다)
const STORAGE_KEY = 'onboarding-answers'

interface StepInputProps {
  step: OnboardingStep
  value: string
  onChange: (value: string) => void
}

/** 질문 모양(choice·text·date·time)에 맞는 답 입력칸을 그립니다. */
function StepInput({ step, value, onChange }: StepInputProps) {
  // 보기 중 하나 고르기 (카드 모양 라디오 버튼)
  if (step.type === 'choice') {
    return (
      <div role="radiogroup" aria-label={step.title} className="flex flex-col gap-3">
        {step.options.map((option) => {
          const isSelected = option === value
          return (
            // h-14 = 56px. label 전체가 눌리는 영역이라 글자 쪽을 눌러도 선택됩니다.
            <label
              key={option}
              className={cn(
                'flex h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 font-medium',
                isSelected
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name={step.key}
                value={option}
                checked={isSelected}
                onChange={() => onChange(option)}
                className="accent-brand h-5 w-5 shrink-0"
              />
              <span className="break-keep">{option}</span>
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

/**
 * 첫 실행 온보딩 설문입니다. 한 화면에 질문 하나씩 보여주고 "다음" 으로 넘어갑니다.
 * 질문 목록은 lib/onboardingSteps.ts 한 곳에서 관리합니다.
 *
 * 마지막 질문에서 "완료" 를 누르면 답을 저장하고 홈으로 갑니다.
 * 이미 설문을 마친 사람(저장된 답이 있는 사람)이 오면 바로 홈으로 돌려보냅니다.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  // 이미 설문을 마친 사람인지. 저장된 답이 있으면 마친 사람입니다.
  const [isFinished] = useState(() => loadData<unknown>(STORAGE_KEY, null) !== null)
  const [stepIndex, setStepIndex] = useState(0)
  // 지금까지 고른 답. 예) { grade: '고2', targetExam: '수능' }
  // "이전" 으로 돌아가도 여기에 남아 있어서 고른 답이 그대로 보입니다.
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // 이미 마친 사람은 홈으로 보냅니다. (Navigate: 화면을 그리는 대신 주소를 바꿔 주는 부품)
  if (isFinished) return <Navigate to="/" replace />

  const step = onboardingSteps[stepIndex]
  const value = answers[step.key] ?? ''
  const isValid = isAnswerValid(step, value)
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === onboardingSteps.length - 1
  // 현재 몇 번째 질문까지 왔는지를 0~100 으로 바꿉니다. (예: 10개 중 3번째 = 30)
  const progress = ((stepIndex + 1) / onboardingSteps.length) * 100

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
    if (!isValid) return

    if (isLastStep) {
      saveData(STORAGE_KEY, answers)
      navigate('/')
      return
    }
    setStepIndex((index) => index + 1)
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-brand font-semibold">{step.group}</span>
          <span className="text-slate-500">
            {stepIndex + 1} / {onboardingSteps.length}
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight break-keep sm:text-2xl">
          {step.title}
          {step.optional && (
            <span className="ml-2 align-middle text-sm font-medium text-slate-400">(선택)</span>
          )}
        </h1>
        {step.description && (
          <p className="mt-2 text-sm break-keep text-slate-600 sm:text-base">{step.description}</p>
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
        {/* 답이 없으면(선택 질문 제외) 눌리지 않습니다. */}
        <Button type="submit" size="lg" className="flex-1" disabled={!isValid}>
          {isLastStep ? '완료' : '다음'}
        </Button>
      </div>

      <p className="text-center text-sm text-slate-500">온보딩은 5분이면 끝나요</p>
    </form>
  )
}
