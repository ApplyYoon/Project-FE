import { PlainLayout } from '@/components/layout/PlainLayout'
import { useAuth } from '@/hooks/useAuth'
import { isServerDataToken } from '@/lib/dataMode'
import { sendPsychTest } from '@/lib/psychTestApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { OnboardingExitButton } from '@/components/ui/OnboardingExitButton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useQueryParam } from '@/hooks/useQueryParam'
import { cn } from '@/lib/cn'
import { getOnboardingResumePath } from '@/lib/onboardingProgress'
import {
  PSYCH_TEST_PATH,
  getScaleLevel,
  isPsychTestComplete,
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
import { useState } from 'react'
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
        <PsychTestIntro total={total} onStart={handleStart} />
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
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-brand text-sm font-semibold">나에 대해</p>
            <p className="text-sm text-slate-500">
              {questionNumber} / {total}
            </p>
          </div>
          <ProgressBar value={(questionNumber / total) * 100} className="mt-2" />
          <h1 className="mt-6 text-xl font-bold tracking-tight break-keep sm:text-2xl">
            {item.text}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            정답은 없어요. 나와 얼마나 비슷한지 골라 줘.
          </p>
        </div>

        {/* 1 ~ 7 버튼. 375px 화면에서도 한 줄에 들어가게 칸을 7등분합니다. 누르는 곳은 높이 48px(h-12) */}
        <div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
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
                    'h-12 w-full cursor-pointer rounded-xl border text-base font-semibold',
                    // 앞에서 고른 답(이전으로 돌아왔을 때)은 색으로 표시합니다.
                    isChosen
                      ? 'border-brand bg-brand text-white'
                      : 'hover:border-brand border-slate-200 bg-white text-slate-700',
                  )}
                >
                  {value}
                </button>
              )
            })}
          </div>
          {/* 양 끝과 가운데의 뜻 */}
          <div className="mt-2 flex justify-between text-xs text-slate-500">
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
  total: number
  onStart: () => void
}

/** 검사 첫 화면 */
function PsychTestIntro({ total, onStart }: PsychTestIntroProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <p className="text-brand text-sm font-semibold">나에 대해</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          나는 어떻게 공부하는 사람일까?
        </h1>
        <p className="mt-3 text-sm break-keep text-slate-600 sm:text-base">
          답을 보고 알림·타이머·관리 강도의 처음 설정을 맞춰 둘게요.
        </p>
      </div>
      <Card>
        <ul className="flex flex-col gap-2 text-sm break-keep text-slate-700">
          <li>
            · 문장 {total}개가 나와요. 나와 얼마나 비슷한지 1(전혀 아니다) ~ 7(매우 그렇다)로 골라
            줘.
          </li>
          <li>· 4분쯤 걸려요. 정답은 없어요. 중간에 나가도 이어서 할 수 있어요.</li>
          <li>· 2주 동안 실제 기록이 쌓이면 이 답 대신 기록으로 다시 맞춰요.</li>
        </ul>
      </Card>
      <Button size="lg" className="w-full sm:w-auto sm:self-start" onClick={onStart}>
        시작하기
      </Button>
    </div>
  )
}

// 높낮이마다 글자 칩의 색. 높음·낮음이 "좋다·나쁘다" 가 아니라서 빨강·초록은 쓰지 않습니다.
const levelChipStyles: Record<ScaleLevel, string> = {
  high: 'bg-brand text-white',
  mid: 'bg-slate-100 text-slate-700',
  low: 'bg-white text-slate-700 border border-slate-200',
}

interface PsychTestResultViewProps {
  result: PsychTestResult
  onNext: () => void
  onRetry: () => void
}

/** 검사 결과. 척도 7개마다 이름·설명·높낮이를 보여 줍니다. */
function PsychTestResultView({ result, onNext, onRetry }: PsychTestResultViewProps) {
  const scales = Object.keys(psychScales) as PsychScale[]

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <p className="text-brand text-sm font-semibold">나에 대해 · 결과</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          지금의 나는 이렇게 답했어요
        </h1>
        <p className="mt-2 text-sm break-keep text-slate-600">
          문장이 적어서 정확하지 않은 첫 짐작이에요. 2주 동안 기록을 보고 같이 확인해 볼게요.
        </p>
      </div>

      <Card>
        <ul className="flex flex-col gap-4">
          {scales.map((scale) => {
            const level = getScaleLevel(result.scores[scale])
            return (
              <li key={scale} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{psychScales[scale].label}</p>
                  <p className="text-xs break-keep text-slate-500">
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

      {/* 모바일에서는 버튼을 위아래로, PC 에서는 나란히 놓습니다. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="w-full sm:w-auto" onClick={onNext}>
          다음
        </Button>
        <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={onRetry}>
          다시 하기
        </Button>
      </div>
    </div>
  )
}
