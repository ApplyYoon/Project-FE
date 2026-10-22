import { PlainLayout } from '@/components/layout/PlainLayout'
import { useAuth } from '@/hooks/useAuth'
import { isServerDataToken } from '@/lib/dataMode'
import { sendPsychTest } from '@/lib/psychTestApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { OnboardingExitButton } from '@/components/ui/OnboardingExitButton'
import { OnboardingStepper } from '@/components/ui/OnboardingStepper'
import { StickyActionBar } from '@/components/ui/StickyActionBar'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useQueryParam } from '@/hooks/useQueryParam'
import { cn } from '@/lib/cn'
import { getOnboardingResumePath } from '@/lib/onboardingProgress'
import {
  PSYCH_TEST_PATH,
  getScaleLevel,
  isPsychTestComplete,
  isPsychTestReliable,
  loadPsychTest,
  psychScales,
  psychTestItems,
  savePsychTest,
  scaleLevelLabels,
  type PsychScale,
  type PsychTestResult,
  type ScaleLevel,
} from '@/lib/psychTest'
import { loadData, removeData, saveData } from '@/lib/storage'
import { likertLabels } from '@/lib/likert'
import { useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

// 검사 도중 고른 답을 임시로 넣어 두는 이름입니다. 새로고침해도 이어서 할 수 있고, 끝내면 지웁니다.
const DRAFT_KEY = 'psych-test-draft'

/** 임시로 저장해 둔 답. 없거나 모양이 틀리면 빈 답 */
function loadDraft(): Record<string, number> {
  const saved = loadData<unknown>(DRAFT_KEY, {})
  if (typeof saved !== 'object' || saved === null) return {}
  const answers: Record<string, number> = {}
  for (const [id, value] of Object.entries(saved)) {
    if (typeof value === 'number') answers[id] = value
  }
  return answers
}

/**
 * 온보딩 심리검사 화면입니다. 문장 35개에 7점 척도로 답하면 성향 척도 7개의 높낮이를 보여 줍니다.
 * (문항·채점: lib/psychTest.ts)
 *
 * 지금 보고 있는 단계는 주소에 둡니다. (?step=intro · 1 ~ 35 · result) 뒤로 가기를 누르면 앞 단계로 갑니다.
 * 온보딩에서는 학년 다음, 관리 설정 앞에 나옵니다. (#388) 설정 요약까지 보여 주는 결과 화면은 #389 에서 합니다.
 */
export function OnboardingPsychTestPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [step, setStep] = useQueryParam('step', 'intro')
  const [answers, setAnswers] = useState<Record<string, number>>(loadDraft)
  const total = psychTestItems.length
  // 온보딩 중이면 헤더에 "로그인 화면으로" 를 둡니다.
  const [isOnboarding] = useState(() => getOnboardingResumePath() !== null)
  const exitAction = isOnboarding ? <OnboardingExitButton /> : undefined
  // 온보딩 중이면 맨 위에 "3 / 5 단계" 를 보여 줍니다. (설정에서 다시 하는 검사에는 없습니다)
  const stepper = isOnboarding ? <OnboardingStepper current={3} /> : null

  function handleStart() {
    // 처음부터 다시 하므로 임시 답을 비웁니다.
    removeData(DRAFT_KEY)
    setAnswers({})
    setStep('1')
  }

  function handleChoose(itemId: string, value: number, questionNumber: number) {
    const nextAnswers = { ...answers, [itemId]: value }
    setAnswers(nextAnswers)
    saveData(DRAFT_KEY, nextAnswers)
    if (questionNumber < total) {
      setStep(String(questionNumber + 1))
      return
    }
    // 마지막 문장까지 답했으면 결과를 저장하고 임시 답은 지웁니다.
    if (isPsychTestComplete(nextAnswers)) {
      savePsychTest(nextAnswers)
      // 진짜 로그인이면 서버에도 보냅니다. 못 보내면 다음에 앱을 열 때 다시 보냅니다. (hooks/usePsychTestSync.ts)
      if (isServerDataToken(token)) void sendPsychTest().catch(() => undefined)
      removeData(DRAFT_KEY)
      setStep('result')
    }
  }

  if (step === 'result') {
    const saved = loadPsychTest()
    // 결과가 없는데 결과 주소로 들어왔으면 처음 화면으로 보냅니다.
    if (saved === undefined) return <Navigate to={PSYCH_TEST_PATH} replace />
    return (
      <PlainLayout headerAction={exitAction}>
        {/* 온보딩 중이면 다음 단계로, 아니면 홈으로 갑니다. (순서: lib/onboardingProgress.ts) */}
        <PsychTestResultView
          stepper={stepper}
          result={saved}
          onNext={() => navigate(getOnboardingResumePath() ?? '/')}
          onRetry={handleStart}
        />
      </PlainLayout>
    )
  }

  // 아직 답하지 않은 첫 문장의 자리 (0 부터). 다 답했으면 -1
  const firstUnanswered = psychTestItems.findIndex((item) => !(item.id in answers))

  // 주소의 문장 번호. 숫자가 아니거나 범위 밖이면 처음 화면입니다.
  const requested = Number(step)
  if (step === 'intro' || !Number.isInteger(requested) || requested < 1 || requested > total) {
    // 답하다 만 문장이 있는데 처음 화면으로 왔으면 그 문장부터 바로 이어 줍니다.
    if (step === 'intro' && firstUnanswered > 0) {
      return <Navigate to={`${PSYCH_TEST_PATH}?step=${firstUnanswered + 1}`} replace />
    }
    return (
      <PlainLayout headerAction={exitAction}>
        <PsychTestIntro stepper={stepper} total={total} onStart={handleStart} />
      </PlainLayout>
    )
  }

  // 앞 문장에 답하지 않고 주소로 건너뛰었으면, 아직 답하지 않은 첫 문장을 보여 줍니다.
  const questionNumber =
    firstUnanswered === -1 ? requested : Math.min(requested, firstUnanswered + 1)
  const item = psychTestItems[questionNumber - 1]

  return (
    <PlainLayout headerAction={exitAction}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        {stepper}
        <div>
          {/* 단계 안의 문장 진행. 35개 중 몇 번째인지 */}
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <p className="text-slate-500">문장</p>
            <p className="font-semibold text-slate-900 tabular-nums">
              {questionNumber} / {total}
            </p>
          </div>
          <ProgressBar value={(questionNumber / total) * 100} className="mt-2" />
          <h1 className="mt-6 text-[22px] leading-snug font-bold tracking-tight break-keep sm:text-2xl">
            {item.text}
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
            정답은 없어요. 나와 얼마나 비슷한지 골라 줘.
          </p>
        </div>

        {/* 1 ~ 7 버튼. 375px 화면에서도 한 줄에 들어가게 칸을 7등분합니다.
            누르는 곳은 높이 48px(h-12), 375px 에서 폭도 44px 이상이 되게 칸 사이를 4px(gap-1)로 둡니다. */}
        <div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {likertLabels.map((label, index) => {
              const value = index + 1
              const isChosen = answers[item.id] === value
              return (
                <button
                  key={label}
                  type="button"
                  aria-label={`${value}점 · ${label}`}
                  aria-pressed={isChosen}
                  onClick={() => handleChoose(item.id, value, questionNumber)}
                  className={cn(
                    'h-12 w-full cursor-pointer rounded-xl border text-base tabular-nums transition active:scale-95',
                    // 앞에서 고른 답(이전으로 돌아왔을 때)은 연한 brand 바탕 + 테두리 + 굵게 표시합니다. (2차 규칙 1)
                    isChosen
                      ? 'border-brand bg-brand-light text-brand ring-brand font-bold ring-1'
                      : 'hover:border-brand border-slate-200 bg-white font-semibold text-slate-700',
                  )}
                >
                  {value}
                </button>
              )
            })}
          </div>
          {/* 양 끝과 가운데의 뜻 */}
          <div className="mt-2 flex justify-between text-[13px] text-slate-500">
            <span>{likertLabels[0]}</span>
            <span>{likertLabels[3]}</span>
            <span>{likertLabels[6]}</span>
          </div>
        </div>

        <Button
          variant="ghost"
          className="self-start"
          onClick={() => setStep(questionNumber === 1 ? 'intro' : String(questionNumber - 1))}
        >
          ← 이전
        </Button>
      </div>
    </PlainLayout>
  )
}

interface PsychTestIntroProps {
  /** 맨 위 온보딩 단계 표시 (온보딩이 아니면 null) */
  stepper: ReactNode
  total: number
  onStart: () => void
}

/** 검사 첫 화면 */
function PsychTestIntro({ stepper, total, onStart }: PsychTestIntroProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {stepper}
      <div>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight break-keep">
          나는 어떻게 공부하는 사람일까?
        </h1>
        <p className="mt-3 max-w-prose text-[15px] break-keep text-slate-600">
          답을 보고 알림·타이머·관리 강도의 처음 설정을 맞춰 둘게요.
        </p>
      </div>
      <Card>
        <ul className="flex flex-col gap-2 text-[15px] break-keep text-slate-700">
          <li>
            · 문장 {total}개가 나와요. 나와 얼마나 비슷한지 1(전혀 아니다) ~ 7(매우 그렇다)로 골라
            줘.
          </li>
          <li>· 4분쯤 걸려요. 정답은 없어요. 중간에 나가도 이어서 할 수 있어요.</li>
          <li>· 2주 동안 실제 기록이 쌓이면 이 답 대신 기록으로 다시 맞춰요.</li>
        </ul>
      </Card>
      <StickyActionBar>
        <Button size="lg" className="w-full sm:w-auto sm:self-start" onClick={onStart}>
          시작하기
        </Button>
      </StickyActionBar>
    </div>
  )
}

// 높낮이마다 글자 칩의 색. 높음·낮음이 "좋다·나쁘다" 가 아니라서 빨강·초록은 쓰지 않습니다.
// brand 로 꽉 채우는 것은 [다음] 버튼만이라, "높음" 은 연한 brand 바탕으로 둡니다. (2차 규칙 1)
const levelChipStyles: Record<ScaleLevel, string> = {
  high: 'bg-brand-light text-brand',
  mid: 'bg-slate-100 text-slate-700',
  low: 'bg-white text-slate-700 border border-slate-200',
}

interface PsychTestResultViewProps {
  /** 맨 위 온보딩 단계 표시 (온보딩이 아니면 null) */
  stepper: ReactNode
  result: PsychTestResult
  onNext: () => void
  onRetry: () => void
}

/** 검사 결과. 척도 7개마다 이름·설명·높낮이를 보여 줍니다. */
function PsychTestResultView({ stepper, result, onNext, onRetry }: PsychTestResultViewProps) {
  const scales = Object.keys(psychScales) as PsychScale[]
  // 답이 거의 다 같으면 점수 위에서 한 번만 "다시 해 볼래?" 를 묻습니다. (규칙: lib/psychTest.ts 의 isPsychTestReliable)
  const isReliable = isPsychTestReliable(result.answers)
  const [isCheckClosed, setIsCheckClosed] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {stepper}
      <div>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight break-keep">
          지금의 나는 이렇게 답했어요
        </h1>
        <p className="mt-2 max-w-prose text-[15px] break-keep text-slate-600">
          문장이 적어서 정확하지 않은 첫 짐작이에요. 2주 동안 기록을 보고 같이 확인해 볼게요.
        </p>
      </div>

      {/* 의심은 벌이 아니라 한 번 더 묻는 것입니다. 두 버튼은 같은 모양 · 같은 크기로 둡니다. (다크패턴 금지) */}
      {!isReliable && !isCheckClosed && (
        <section
          aria-label="답 확인"
          className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5"
        >
          <div>
            <p className="text-[17px] font-semibold text-slate-900">답이 거의 다 같아요</p>
            <p className="mt-1 text-[15px] break-keep text-slate-600">
              빨리 넘겼다면 한 번만 다시 해 볼래? 그대로 둬도 괜찮아요. 코치가 이야기하면서 천천히
              알아갈게요.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onRetry}>
              다시 하기
            </Button>
            <Button variant="outline" onClick={() => setIsCheckClosed(true)}>
              이대로 둘게
            </Button>
          </div>
        </section>
      )}

      <Card>
        <ul className="flex flex-col gap-4">
          {scales.map((scale) => {
            const level = getScaleLevel(result.scores[scale])
            return (
              <li key={scale} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-900">
                    {psychScales[scale].label}
                  </p>
                  <p className="text-[13px] break-keep text-slate-500">
                    {psychScales[scale].description}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                    levelChipStyles[level],
                  )}
                >
                  {scaleLevelLabels[level]}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>

      {/* 1순위 [다음] 은 화면 아래 엄지 자리에 붙이고, [다시 하기] 는 낮은 버튼으로 둡니다. PC 에서는 나란히 놓습니다. */}
      <StickyActionBar className="sm:flex-row sm:gap-3">
        <Button size="lg" className="w-full sm:w-auto" onClick={onNext}>
          다음
        </Button>
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onRetry}>
          다시 하기
        </Button>
      </StickyActionBar>
    </div>
  )
}
