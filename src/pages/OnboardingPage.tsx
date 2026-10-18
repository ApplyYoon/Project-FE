import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { OnboardingExitButton } from '@/components/ui/OnboardingExitButton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { getCareLimits, setInitialCareLimits } from '@/lib/careLimits'
import { getMessageSettings, saveMessageSettings } from '@/lib/messageSettings'
import { getOnboardingResumePath } from '@/lib/onboardingProgress'
import {
  CLASS_NO_KEY,
  GRADE_OPTIONS,
  getFirstSteps,
  isAnswerValid,
  isFirstStageDone,
  loadOnboardingAnswers,
  toChoiceOption,
  type OnboardingStep,
} from '@/lib/onboardingSteps'
import {
  MAX_CLASS_NO,
  loadSchoolClass,
  saveSchoolClass,
  schoolClassFromAnswers,
} from '@/lib/schoolToday'
import { loadData, removeData, saveData } from '@/lib/storage'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

// 설문을 끝내고 답을 저장하는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-onboarding-answers' 가 됩니다)
const STORAGE_KEY = 'onboarding-answers'

// 설문을 끝내기 전에, 고르던 답과 보고 있던 질문 번호를 임시로 넣어 두는 이름입니다.
// 새로고침하거나 다른 화면에 다녀와도 하던 질문부터 이어서 할 수 있습니다. 끝내면 지웁니다.
// (lib/onboardingProgress.ts 의 DRAFT_KEYS 와 같은 이름이어야 "처음부터 다시" 가 같이 지웁니다)
const DRAFT_KEY = 'onboarding-draft'

/** 설문 도중에 임시로 저장해 두는 값 */
interface OnboardingDraft {
  /** 보고 있던 질문이 몇 번째인지 (0 부터) */
  stepIndex: number
  /** 그때까지 고른 답 */
  answers: Record<string, string>
}

/**
 * 임시로 저장해 둔 값을 불러옵니다. 없거나 모양이 틀리면 "처음부터" 입니다.
 * stepCount 는 질문 수입니다. 저장된 번호가 질문 수를 넘지 않게 맞춥니다. (질문 목록이 바뀌었을 수 있습니다)
 */
function loadDraft(draftKey: string, stepCount: number): OnboardingDraft {
  const empty: OnboardingDraft = { stepIndex: 0, answers: {} }
  const saved = loadData<unknown>(draftKey, null)
  if (typeof saved !== 'object' || saved === null) return empty

  const draft = saved as Record<string, unknown>
  if (typeof draft.answers !== 'object' || draft.answers === null) return empty

  // 답은 글자인 것만 남깁니다.
  const answers: Record<string, string> = {}
  for (const [key, value] of Object.entries(draft.answers)) {
    if (typeof value === 'string') answers[key] = value
  }

  const savedIndex = typeof draft.stepIndex === 'number' ? Math.floor(draft.stepIndex) : 0
  const stepIndex = Number.isFinite(savedIndex)
    ? Math.min(Math.max(0, savedIndex), stepCount - 1)
    : 0
  return { stepIndex, answers }
}

/**
 * 처음 열 때 미리 골라 둘 답입니다. 보고 그대로 넘기면 됩니다.
 * 전에 답한 학년과, 홈 · 설정에서 고른 반이 있으면 넣어 둡니다.
 * ("처음부터 다시" 를 해도 반은 지우지 않아서, 다시 할 때 그대로 골라져 있습니다)
 */
function getPrefilledAnswers(
  steps: OnboardingStep[],
  savedAnswers: Record<string, string> | null,
): Record<string, string> {
  const prefilled: Record<string, string> = {}
  for (const step of steps) {
    const saved = savedAnswers?.[step.key]
    if (saved) prefilled[step.key] = saved
  }
  const schoolClass = loadSchoolClass()
  if (schoolClass) {
    prefilled.grade = `고${schoolClass.grade}`
    prefilled[CLASS_NO_KEY] = String(schoolClass.classNo)
  }
  return prefilled
}

interface ChoiceCardProps {
  /** 같은 질문의 카드끼리 같은 이름을 써야 하나만 골라집니다. */
  name: string
  label: string
  isSelected: boolean
  onSelect: () => void
}

/** 카드 모양 라디오 버튼 하나 */
function ChoiceCard({ name, label, isSelected, onSelect }: ChoiceCardProps) {
  return (
    // h-14 = 56px. label 전체가 눌리는 영역이라 글자 쪽을 눌러도 선택됩니다.
    // border-2: 고른 카드의 테두리를 굵게 보이려고 처음부터 2px 로 둡니다. (1px 였다가 2px 가 되면 카드가 움직여 보입니다)
    <label
      className={cn(
        'flex h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 font-medium',
        isSelected
          ? 'border-brand bg-brand-light text-brand'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={isSelected}
        onChange={onSelect}
        className="accent-brand h-5 w-5 shrink-0"
      />
      <span className="break-keep">{label}</span>
    </label>
  )
}

interface SchoolClassInputProps {
  answers: Record<string, string>
  onChange: (key: string, value: string) => void
}

/**
 * 학년 · 반 고르기. 학년은 카드 3개, 반은 목록에서 고릅니다.
 * 처음엔 아무것도 골라 두지 않습니다. 기본값을 그대로 넘겨서 남의 반 시간표가 나오는 일이 없게 직접 고르게 합니다.
 * 학년은 온보딩 답의 grade 칸, 반은 CLASS_NO_KEY 칸에 넣습니다.
 */
function SchoolClassInput({ answers, onChange }: SchoolClassInputProps) {
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="학년" className="grid grid-cols-3 gap-2">
        {GRADE_OPTIONS.map((grade) => (
          <ChoiceCard
            key={grade}
            name="grade"
            label={grade}
            isSelected={answers.grade === grade}
            onSelect={() => onChange('grade', grade)}
          />
        ))}
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-600">반</span>
        <select
          value={answers[CLASS_NO_KEY] ?? ''}
          onChange={(event) => onChange(CLASS_NO_KEY, event.target.value)}
          className="h-14 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-base font-medium text-slate-700"
        >
          {/* 아직 안 골랐을 때 보이는 안내. 다시 고를 수는 없게 disabled 로 둡니다. */}
          <option value="" disabled>
            반을 골라 줘
          </option>
          {Array.from({ length: MAX_CLASS_NO }, (_, index) => String(index + 1)).map((classNo) => (
            <option key={classNo} value={classNo}>
              {classNo}반
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

interface StepInputProps {
  step: OnboardingStep
  /** 지금까지 고른 답 (질문 이름 → 답) */
  answers: Record<string, string>
  /** 답 하나를 바꿉니다. 학년 · 반 질문은 학년과 반을 따로 바꿉니다. */
  onChange: (key: string, value: string) => void
}

/** 질문의 답 입력칸을 그립니다. 학년 · 반 고르기(schoolClass)와 보기 중 하나 고르기(choice)가 있습니다. */
function StepInput({ step, answers, onChange }: StepInputProps) {
  if (step.type === 'schoolClass') {
    return <SchoolClassInput answers={answers} onChange={onChange} />
  }
  // 보기 중 하나 고르기 (카드 모양 라디오 버튼)
  return (
    <div role="radiogroup" aria-label={step.title} className="flex flex-col gap-3">
      {step.options.map((rawOption) => {
        // 보이는 글자(label)와 저장할 값(value)이 다른 보기도 있어서, 둘로 나눠서 씁니다.
        const option = toChoiceOption(rawOption)
        return (
          <ChoiceCard
            key={option.value}
            name={step.key}
            label={option.label}
            isSelected={option.value === answers[step.key]}
            onSelect={() => onChange(step.key, option.value)}
          />
        )
      })}
    </div>
  )
}

/**
 * 온보딩 설문입니다. 한 화면에 질문 하나씩 보여주고 "다음" 으로 넘어갑니다.
 * 질문 목록은 lib/onboardingSteps.ts 한 곳에서 관리합니다.
 *
 * 처음 온보딩의 학년 · 반 질문(basic 묶음)을 묻습니다. 고른 반은 홈 시간표와 같은 저장소에 넣습니다. (lib/schoolToday.ts) 마지막에 "다음" 을 누르면 답을 저장하고 온보딩의 다음 단계로 갑니다. (lib/onboardingProgress.ts)
 *   끝낼 때 관리 강도 한도와 메시지 설정을 기본값으로 시작합니다. (설정에서 언제든 바꿉니다) (#239)
 *   (자기 인식 4문항 묶음은 2026-10-18 에 지웠습니다. 주관적인 짐작이라 기록으로 재는 값만 씁니다)
 *   위쪽의 "로그인 화면으로" 를 눌러도 고르던 답은 임시로 저장되어 있어서, 다시 오면 하던 질문부터 이어집니다.
 *   그 묶음을 이미 끝낸 사람이 오면 온보딩의 다음 단계(다 끝났으면 홈)로 보냅니다.
 * (설정의 "내 정보 더 알려주기"(mode 'more')는 최종 기획서에 없는 질문들이라 #417 에서 지웠습니다)
 *
 * 메뉴·하단 탭이 없는 틀(PlainLayout)로 감싸서 시안처럼 앱 이름만 위에 보입니다.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  // 저장된 답. 설문을 한 번도 안 했으면 null 입니다.
  const [savedAnswers] = useState(loadOnboardingAnswers)
  // 이번에 물어볼 질문들 (그 묶음의 질문)
  const steps = getFirstSteps('basic')
  // 전에 하다 만 곳이 있으면 거기서부터 이어서 합니다. (새로고침해도 답이 남습니다)
  const [draft] = useState(() => {
    const loaded = loadDraft(DRAFT_KEY, steps.length)
    if (Object.keys(loaded.answers).length > 0) return loaded
    return { stepIndex: 0, answers: getPrefilledAnswers(steps, savedAnswers) }
  })
  // 이 묶음을 이미 끝냈는지. 끝냈으면 아래에서 다음 단계로 보냅니다.
  const [isStageDone] = useState(() => isFirstStageDone(savedAnswers, 'basic'))
  const [stepIndex, setStepIndex] = useState(draft.stepIndex)
  // 지금 화면에서 고른 답. 예) { grade: '고2', classNo: '3' }
  // "이전" 으로 돌아가도 여기에 남아 있어서 고른 답이 그대로 보입니다.
  const [answers, setAnswers] = useState<Record<string, string>>(draft.answers)

  // 온보딩을 하는 동안에는 답을 고르거나 질문을 넘길 때마다 임시로 저장합니다.
  // (이 묶음을 이미 끝낸 사람은 아래에서 다음 단계로 보내므로 저장하지 않습니다)
  const draftKey = DRAFT_KEY
  const shouldSaveDraft = !isStageDone
  useEffect(() => {
    if (shouldSaveDraft) saveData(draftKey, { stepIndex, answers })
  }, [shouldSaveDraft, draftKey, stepIndex, answers])

  // 질문이 바뀌면 키보드 포커스를 새 질문 제목으로 옮깁니다.
  // ("다음" 을 누르면 누른 버튼이 잠깐 꺼지면서 포커스가 사라져서, 스크린리더가 새 질문을 읽어 주지 않았습니다)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 화면이 처음 열릴 때는 옮기지 않습니다. 질문을 넘겼을 때만 옮깁니다.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    titleRef.current?.focus()
  }, [stepIndex])

  // 이 묶음을 이미 끝낸 사람은 다음 단계로, 다 끝났으면 홈으로 보냅니다. (Navigate: 화면을 그리는 대신 주소를 바꿔 주는 부품)
  if (isStageDone) return <Navigate to={getOnboardingResumePath() ?? '/'} replace />

  const step = steps[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === steps.length - 1
  // 학년 · 반 질문은 학년과 반을 둘 다 골라야, 보기 고르기 질문은 답이 있어야(선택 질문 제외) 넘어갑니다.
  const canGoNext =
    step.type === 'schoolClass'
      ? schoolClassFromAnswers(answers) !== null
      : isAnswerValid(step, answers[step.key] ?? '')
  // 현재 몇 번째 질문까지 왔는지를 0~100 으로 바꿉니다. (예: 10개 중 3번째 = 30)
  const progress = ((stepIndex + 1) / steps.length) * 100

  function handleChangeAnswer(key: string, nextValue: string) {
    setAnswers((prev) => ({ ...prev, [key]: nextValue }))
  }

  function handlePrev() {
    setStepIndex((index) => Math.max(0, index - 1))
  }

  // form 으로 감싸 두어서 입력칸에서 Enter 를 눌러도 "다음" 이 눌립니다.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (!canGoNext) return

    if (isLastStep) {
      // 반은 학년 · 반 저장소로 옮깁니다. 홈 시간표 · 코치 채팅이 이 반을 씁니다. (lib/schoolToday.ts)
      const schoolClass = schoolClassFromAnswers(answers)
      if (schoolClass) saveSchoolClass(schoolClass)
      // 앞뒤 빈칸은 떼고 저장합니다. 빈칸만 적은 선택 질문은 답하지 않은 것으로 보고 저장하지 않습니다.
      const trimmedAnswers: Record<string, string> = {}
      for (const [key, answer] of Object.entries(answers)) {
        // 반은 위에서 옮겼으니 온보딩 답에는 넣지 않습니다.
        if (key === CLASS_NO_KEY) continue
        if (answer.trim() !== '') trimmedAnswers[key] = answer.trim()
      }
      // 앞 묶음에서 저장한 답(과 관리 설정의 취침 · 기상 시각)은 그대로 두고, 이 묶음의 답만 더합니다.
      saveData(STORAGE_KEY, { ...(savedAnswers ?? {}), ...trimmedAnswers })
      // 묶음을 끝냈으니 임시로 저장해 둔 답은 지웁니다.
      removeData(draftKey)
      // 관리 강도 한도 · 독설 수위 · 메시지 설정은 묻지 않고 기본값으로 시작합니다. (#239)
      // getCareLimits · getMessageSettings 는 저장된 게 없으면 기본값을 돌려줍니다.
      const limits = getCareLimits()
      setInitialCareLimits(limits.maxCareLevel, limits.maxHarshness)
      saveMessageSettings(getMessageSettings())
      // 온보딩의 다음 단계로 갑니다. 다 끝났으면 홈입니다. (순서: lib/onboardingProgress.ts)
      navigate(getOnboardingResumePath() ?? '/')
      return
    }
    setStepIndex((index) => index + 1)
  }

  return (
    <PlainLayout
      // 온보딩을 끝내기 전에는 나갈 수 없어서 "나중에 하기" 대신 "로그인 화면으로" 를 둡니다. 답은 남아서 다음에 이어 할 수 있습니다. (RequireAuth)
      headerAction={<OnboardingExitButton />}
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
          {/* tabIndex -1: 코드로 포커스를 줄 수 있게 합니다. outline-none: 제목에 포커스 테두리는 그리지 않습니다. */}
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-2xl font-bold tracking-tight break-keep outline-none sm:text-3xl"
          >
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
        <StepInput key={step.key} step={step} answers={answers} onChange={handleChangeAnswer} />

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
            다음
          </Button>
        </div>

        <p className="text-center text-sm break-keep text-slate-500">온보딩은 3분이면 끝나요.</p>
      </form>
    </PlainLayout>
  )
}
