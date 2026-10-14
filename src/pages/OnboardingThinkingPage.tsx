import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useQueryParam } from '@/hooks/useQueryParam'
import { cn } from '@/lib/cn'
import { loadData, removeData, saveData } from '@/lib/storage'
import {
  getTopHabits,
  loadThinkingTest,
  saveThinkingTest,
  scoreThinkingTest,
  thinkingHabits,
  thinkingTestQuestions,
  type ThinkingTestResult,
} from '@/lib/thinkingTest'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

// 테스트 도중 고른 답을 임시로 넣어 두는 이름입니다. 새로고침해도 이어서 할 수 있고, 끝내면 지웁니다.
const DRAFT_KEY = 'thinking-test-draft'

/** 임시로 저장해 둔 답. 없거나 모양이 틀리면 빈 답 */
function loadDraft(): Record<string, number> {
  const saved = loadData<unknown>(DRAFT_KEY, {})
  if (typeof saved !== 'object' || saved === null) return {}
  const answers: Record<string, number> = {}
  for (const [id, index] of Object.entries(saved)) {
    if (typeof index === 'number') answers[id] = index
  }
  return answers
}

/** 결과를 본 뒤 갈 곳. from 은 주소의 ?from= 값입니다. */
function getNextStep(from: string): { path: string; label: string } {
  // 가입 설문에서 왔으면 처음 계획을 세우러, 기록 화면에서 왔으면 기록으로, 그 밖에는 홈으로 갑니다.
  if (from === 'onboarding') return { path: '/onboarding/plan', label: '다음: 처음 계획 세우기' }
  if (from === 'records') return { path: '/records', label: '기록으로 돌아가기' }
  return { path: '/', label: '시작하기' }
}

/**
 * 생각 습관 테스트 화면입니다. 가입 설문 다음에 나오고, 안 했으면 RequireAuth 가 여기로 보냅니다.
 * 상황 질문 12개에 답하면, 내가 자주 고른 생각 습관(인지편향)을 보여 줍니다. (문항·채점: lib/thinkingTest.ts)
 *
 * 지금 보고 있는 단계는 주소에 둡니다. (?step=intro · 1 ~ 12 · result) 뒤로 가기를 누르면 앞 질문으로 갑니다.
 * 결과는 "너는 ○○형" 이 아니라 "이런 생각을 자주 고른 편" 이라는 가설로 보여 줍니다.
 */
export function OnboardingThinkingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useQueryParam('step', 'intro')
  const [from] = useQueryParam('from', '')
  const [answers, setAnswers] = useState<Record<string, number>>(loadDraft)
  const next = getNextStep(from)
  const total = thinkingTestQuestions.length

  function handleStart() {
    // 처음부터 다시 하므로 임시 답을 비웁니다.
    removeData(DRAFT_KEY)
    setAnswers({})
    setStep('1')
  }

  function handleChoose(questionId: string, optionIndex: number, questionNumber: number) {
    const nextAnswers = { ...answers, [questionId]: optionIndex }
    setAnswers(nextAnswers)
    if (questionNumber < total) {
      saveData(DRAFT_KEY, nextAnswers)
      setStep(String(questionNumber + 1))
      return
    }
    // 마지막 질문이면 결과를 저장하고 임시 답은 지웁니다.
    saveThinkingTest(nextAnswers)
    removeData(DRAFT_KEY)
    setStep('result')
  }

  if (step === 'result') {
    const saved = loadThinkingTest()
    // 결과가 없는데 결과 주소로 들어왔으면 처음 화면으로 보냅니다.
    if (saved === null) return <Navigate to={`/onboarding/thinking?from=${from}`} replace />
    return (
      <PlainLayout>
        <ThinkingTestResultView
          result={scoreThinkingTest(saved.answers)}
          nextLabel={next.label}
          onNext={() => navigate(next.path)}
          onRetry={handleStart}
        />
      </PlainLayout>
    )
  }

  // 주소의 질문 번호. 숫자가 아니거나 범위 밖이면 처음 화면입니다.
  const requested = Number(step)
  if (step === 'intro' || !Number.isInteger(requested) || requested < 1 || requested > total) {
    return (
      <PlainLayout>
        <ThinkingTestIntro onStart={handleStart} />
      </PlainLayout>
    )
  }

  // 앞 질문에 답하지 않고 주소로 건너뛰었으면, 아직 답하지 않은 첫 질문을 보여 줍니다.
  const firstUnanswered = thinkingTestQuestions.findIndex((question) => !(question.id in answers))
  const questionNumber =
    firstUnanswered === -1 ? requested : Math.min(requested, firstUnanswered + 1)
  const question = thinkingTestQuestions[questionNumber - 1]

  return (
    <PlainLayout>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div>
          <p className="text-brand text-sm font-semibold">
            생각 습관 테스트 · {questionNumber} / {total}
          </p>
          <ProgressBar value={(questionNumber / total) * 100} className="mt-2" />
          <h1 className="mt-6 text-xl font-bold tracking-tight break-keep sm:text-2xl">
            {question.situation}
          </h1>
          <p className="mt-2 text-sm text-slate-500">정답은 없어요. 가장 나다운 것을 골라 줘.</p>
        </div>

        {/* 보기는 화면 너비 가득, 누르는 곳은 최소 48px(min-h-12) */}
        <div className="flex flex-col gap-3">
          {question.options.map((option, index) => (
            <button
              key={option.text}
              type="button"
              onClick={() => handleChoose(question.id, index, questionNumber)}
              className={cn(
                'min-h-12 w-full cursor-pointer rounded-xl border px-4 py-3 text-left text-sm break-keep text-slate-900 sm:text-base',
                // 앞에서 고른 답(이전으로 돌아왔을 때)은 색으로 표시합니다.
                answers[question.id] === index
                  ? 'border-brand bg-brand/10'
                  : 'hover:border-brand border-slate-200 bg-white',
              )}
            >
              {option.text}
            </button>
          ))}
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

interface ThinkingTestIntroProps {
  onStart: () => void
}

/** 테스트 첫 화면 */
function ThinkingTestIntro({ onStart }: ThinkingTestIntroProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <p className="text-brand text-sm font-semibold">생각 습관 테스트</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          나는 계획이 틀어질 때 어떤 생각을 할까?
        </h1>
        <p className="mt-3 text-sm break-keep text-slate-600 sm:text-base">
          공부하다 보면 누구나 &quot;어차피 망했어&quot;, &quot;내일부터 하면 돼&quot; 같은 생각을
          해요. 이런 생각 습관을 알아차리면 바꿀 수 있어요.
        </p>
      </div>
      <Card>
        <ul className="flex flex-col gap-2 text-sm break-keep text-slate-700">
          <li>· 상황 질문 12개, 2분이면 끝나요.</li>
          <li>· 정답은 없어요. 가장 나다운 답을 골라 줘.</li>
          <li>· 결과는 AI 선생님과 통화할 때 같이 확인해 볼게요.</li>
        </ul>
      </Card>
      <Button size="lg" className="w-full sm:w-auto sm:self-start" onClick={onStart}>
        시작하기
      </Button>
    </div>
  )
}

interface ThinkingTestResultViewProps {
  result: ThinkingTestResult
  nextLabel: string
  onNext: () => void
  onRetry: () => void
}

/** 테스트 결과. 많이 고른 습관 2개를 카드로, 8개 전체를 막대로 보여 줍니다. */
function ThinkingTestResultView({
  result,
  nextLabel,
  onNext,
  onRetry,
}: ThinkingTestResultViewProps) {
  const topHabits = getTopHabits(result)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <p className="text-brand text-sm font-semibold">생각 습관 테스트 결과</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          {topHabits.length > 0
            ? '이런 생각을 자주 고른 편이에요'
            : '뚜렷하게 자주 고른 생각 습관은 없었어요'}
        </h1>
      </div>

      {topHabits.map((score) => {
        const habit = thinkingHabits[score.key]
        return (
          <Card key={score.key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xl font-bold text-slate-900">{habit.label}</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {score.appeared}번 중 {score.chosen}번 고름
              </span>
            </div>
            <p className="mt-1 text-sm break-keep text-slate-700">{habit.description}</p>
            <div className="bg-brand/10 mt-4 rounded-lg px-3 py-3">
              <p className="text-brand-dark text-sm font-semibold">이렇게 해 볼까요?</p>
              <p className="mt-1 text-sm break-keep text-slate-900">{habit.solution}</p>
            </div>
          </Card>
        )
      })}

      <Card title="전체 결과">
        <ul className="flex flex-col gap-3">
          {result.scores.map((score) => (
            <li key={score.key}>
              <p className="text-sm font-medium text-slate-800">
                {thinkingHabits[score.key].label}
              </p>
              <ProgressBar value={score.percent} showLabel className="mt-1" />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm break-keep text-slate-600">
          건강하게 대처하는 답은 12개 중 {result.healthyCount}개 골랐어요.
        </p>
      </Card>

      <p className="text-xs break-keep text-slate-500">
        스스로 고른 답으로 본 첫 모습이에요. AI 선생님과 통화하면서 진짜 그런지 같이 확인해 볼게요.
        생각 습관은 성격이 아니라, 알아차리면 바꿀 수 있는 버릇이에요.
      </p>

      {/* 모바일에서는 버튼을 위아래로, PC 에서는 나란히 놓습니다. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="w-full sm:w-auto" onClick={onNext}>
          {nextLabel}
        </Button>
        <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={onRetry}>
          다시 하기
        </Button>
      </div>
    </div>
  )
}
