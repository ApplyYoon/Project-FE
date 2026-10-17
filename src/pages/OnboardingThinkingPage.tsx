import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { OnboardingExitButton } from '@/components/ui/OnboardingExitButton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useQueryParam } from '@/hooks/useQueryParam'
import { cn } from '@/lib/cn'
import { SUPPORT_PATH } from '@/lib/helpLines'
import { getOnboardingResumePath } from '@/lib/onboardingProgress'
import { getSafetyBrakeResult } from '@/lib/safetyBrake'
import { loadData, removeData, saveData } from '@/lib/storage'
import {
  THINKING_TEST_PATH,
  WEAKNESS_NOTE_MAX,
  getStyleName,
  getTopHabits,
  isSameAnswerEverywhere,
  likertLabels,
  getWeaknessLabel,
  loadThinkingTest,
  saveThinkingTest,
  scoreThinkingTest,
  thinkingHabits,
  thinkingTestItems,
  weaknessOptions,
  type ThinkingTestResult,
  type WeaknessKey,
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
  if (from === 'records') return { path: '/analysis', label: '기록으로 돌아가기' }
  return { path: '/', label: '시작하기' }
}

/**
 * 생각 습관 테스트 화면입니다. 가입 설문 다음에 나오고, 안 했으면 RequireAuth 가 여기로 보냅니다.
 * 문장 24개에 7점 척도로 답하고 마지막에 "내가 생각하는 나의 약점" 을 고르면,
 * "지금 내 공부 스타일"(4개 축)과 많이 해당하는 생각 습관(인지편향)을 보여 줍니다.
 * (문항·채점·약점 칩: lib/thinkingTest.ts)
 *
 * 지금 보고 있는 단계는 주소에 둡니다. (?step=intro · 1 ~ 24 · weakness · result) 뒤로 가기를 누르면 앞 단계로 갑니다.
 * 결과는 "너는 ○○형" 이 아니라 "이런 생각을 자주 고른 편" 이라는 가설로 보여 줍니다.
 */
export function OnboardingThinkingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useQueryParam('step', 'intro')
  const [from] = useQueryParam('from', '')
  const [answers, setAnswers] = useState<Record<string, number>>(loadDraft)
  const next = getNextStep(from)
  const total = thinkingTestItems.length
  // 온보딩 중이면 헤더에 "로그인 화면으로" 를 둡니다. (온보딩을 마친 뒤 기록 화면에서 다시 하는 경우에는 두지 않습니다)
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
    // 마지막 질문 다음에는 "나의 약점" 을 고르러 갑니다.
    setStep(questionNumber < total ? String(questionNumber + 1) : 'weakness')
  }

  function handleFinish(weaknesses: WeaknessKey[], weaknessNote: string) {
    // 결과를 저장하고 임시 답은 지웁니다.
    saveThinkingTest(answers, weaknesses, weaknessNote)
    removeData(DRAFT_KEY)
    // "기타" 에 쓴 글에 위기 표현이 있으면 결과보다 도움 안내를 먼저 보여 줍니다. (안전이 먼저입니다)
    const brake = getSafetyBrakeResult({
      now: new Date(),
      recentTexts: [weaknessNote],
      recentMoods: [],
      exams: [],
    })
    if (brake.stopWhip) {
      navigate(SUPPORT_PATH)
      return
    }
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
          isSameAnswer={isSameAnswerEverywhere(saved.answers)}
          weaknesses={saved.weaknesses}
          weaknessNote={saved.weaknessNote}
          nextLabel={next.label}
          onNext={() => navigate(next.path)}
          onRetry={handleStart}
        />
      </PlainLayout>
    )
  }

  // 아직 답하지 않은 첫 질문의 자리 (0 부터). 다 답했으면 -1
  const firstUnanswered = thinkingTestItems.findIndex((item) => !(item.id in answers))

  // 질문에 다 답했으면 "나의 약점" 을 고릅니다. 덜 답했는데 주소로 건너뛰었으면 아래에서 그 질문을 보여 줍니다.
  if (step === 'weakness' && firstUnanswered === -1) {
    return (
      <PlainLayout headerAction={exitAction}>
        <WeaknessStep onSubmit={handleFinish} onBack={() => setStep(String(total))} />
      </PlainLayout>
    )
  }

  // 주소의 질문 번호. "나의 약점" 에서 넘어온 것은 마지막 질문으로 봅니다. 숫자가 아니거나 범위 밖이면 처음 화면입니다.
  const requested = step === 'weakness' ? total : Number(step)
  if (step === 'intro' || !Number.isInteger(requested) || requested < 1 || requested > total) {
    // 답하다 만 문제가 있는데 처음 화면으로 왔으면(로고·홈을 눌렀다가 돌아온 경우 등) 그 문제부터 바로 이어 줍니다.
    // 다 답했으면 "나의 약점" 고르기로 갑니다. 새로 시작하고 싶으면 다음에 들어올 때 "처음부터 다시" 를 고르면 됩니다. (OnboardingResumePage)
    if (step === 'intro' && Object.keys(answers).length > 0) {
      const params = new URLSearchParams({
        step: firstUnanswered === -1 ? 'weakness' : String(firstUnanswered + 1),
      })
      if (from !== '') params.set('from', from)
      return <Navigate to={`${THINKING_TEST_PATH}?${params.toString()}`} replace />
    }
    return (
      <PlainLayout headerAction={exitAction}>
        <ThinkingTestIntro onStart={handleStart} />
      </PlainLayout>
    )
  }

  // 앞 질문에 답하지 않고 주소로 건너뛰었으면, 아직 답하지 않은 첫 질문을 보여 줍니다.
  const questionNumber =
    firstUnanswered === -1 ? requested : Math.min(requested, firstUnanswered + 1)
  const item = thinkingTestItems[questionNumber - 1]

  return (
    <PlainLayout headerAction={exitAction}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div>
          <p className="text-brand text-sm font-semibold">
            생각 습관 테스트 · {questionNumber} / {total}
          </p>
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
              return (
                <button
                  key={label}
                  type="button"
                  aria-label={`${value}점 · ${label}`}
                  aria-pressed={answers[item.id] === value}
                  onClick={() => handleChoose(item.id, value, questionNumber)}
                  className={cn(
                    'h-12 w-full cursor-pointer rounded-xl border text-base font-semibold',
                    // 앞에서 고른 답(이전으로 돌아왔을 때)은 색으로 표시합니다.
                    answers[item.id] === value
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
          <li>
            · 문장 24개가 나와요. 나와 얼마나 비슷한지 1(전혀 아니다) ~ 7(매우 그렇다)로 골라 줘.
          </li>
          <li>· 4분쯤 걸려요. 마지막에 내가 생각하는 약점을 골라요.</li>
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
  /** 모든 문장에 같은 답을 했으면 true. 맨 위에 다시 해 볼지 묻는 안내를 띄웁니다. */
  isSameAnswer: boolean
  /** 내가 꼽은 약점 칩들 */
  weaknesses: WeaknessKey[]
  /** "기타" 에 쓴 약점. 없으면 null */
  weaknessNote: string | null
  nextLabel: string
  onNext: () => void
  onRetry: () => void
}

/** 테스트 결과. 맨 위에 "지금 내 공부 스타일"(4개 축), 많이 해당하는 습관 2개는 카드로, 8개 전체는 막대로 보여 줍니다. */
function ThinkingTestResultView({
  result,
  isSameAnswer,
  weaknesses,
  weaknessNote,
  nextLabel,
  onNext,
  onRetry,
}: ThinkingTestResultViewProps) {
  const topHabits = getTopHabits(result)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {isSameAnswer && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm break-keep text-amber-900">
            모든 문장에 같은 번호를 골랐어요. 이러면 내 모습이 잘 안 보여요. 문장을 하나씩 읽고 다시
            해 볼래요?
          </p>
          <Button variant="secondary" className="mt-3 w-full sm:w-auto" onClick={onRetry}>
            다시 하기
          </Button>
        </Card>
      )}
      <div>
        <p className="text-brand text-sm font-semibold">지금 내 공부 스타일</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          {getStyleName(result)}
        </h1>
        <p className="mt-2 text-sm break-keep text-slate-600">
          성격이 아니라 지금의 공부 스타일이에요. 몇 주 뒤에 다시 하면 바뀌어 있을 수 있어요.
        </p>
      </div>

      <Card>
        <ul className="flex flex-col gap-5">
          {result.styles.map((style) => (
            <li key={style.axis.name}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{style.axis.name}</p>
                <p className="text-brand-dark text-sm font-bold">{style.label}</p>
              </div>
              {/* 왼쪽 끝 = 낮은 쪽(현실·회복·루틴·성장), 오른쪽 끝 = 높은 쪽. 점이 내 위치입니다. */}
              <div className="relative mt-2 h-2 w-full rounded-full bg-slate-200">
                <span
                  aria-hidden
                  className="bg-brand absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  // 점의 위치는 사람마다 달라서 Tailwind 클래스로 미리 만들 수 없습니다. 그래서 이 한 줄만 style 을 씁니다.
                  style={{ left: `${style.percent}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                <span>{style.axis.lowLabel}</span>
                <span>{style.axis.highLabel}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <h2 className="text-lg font-bold tracking-tight break-keep sm:text-xl">
        {topHabits.length > 0
          ? '이런 생각을 자주 하는 편이에요'
          : '뚜렷하게 자주 하는 생각 습관은 없었어요'}
      </h2>

      {topHabits.map((score) => {
        const habit = thinkingHabits[score.key]
        return (
          <Card key={score.key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xl font-bold text-slate-900">{habit.label}</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                평균 {score.average} / 7
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

      {(weaknesses.length > 0 || weaknessNote !== null) && (
        <Card title="내가 꼽은 나의 약점">
          <ul className="flex flex-wrap gap-2">
            {weaknesses.map((key) => (
              <li
                key={key}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                {getWeaknessLabel(key)}
              </li>
            ))}
            {weaknessNote !== null && (
              <li className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium break-all text-slate-700">
                {weaknessNote}
              </li>
            )}
          </ul>
          <p className="mt-3 text-sm break-keep text-slate-600">
            약점은 탓할 거리가 아니라 작전을 세울 곳이에요. 통화에서 언제 그런지 같이 이야기해
            볼게요.
          </p>
        </Card>
      )}

      <Card title="생각 습관 8개 전체">
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
      </Card>

      <p className="text-xs break-keep text-slate-500">
        스스로 답한 것으로 본 첫 모습이에요. AI 선생님과 통화하면서 진짜 그런지 같이 확인해 볼게요.
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

interface WeaknessStepProps {
  onSubmit: (weaknesses: WeaknessKey[], weaknessNote: string) => void
  onBack: () => void
}

/** 테스트 마지막 단계: 내가 생각하는 나의 약점을 칩으로 여러 개 고르고, "기타" 는 직접 씁니다. */
function WeaknessStep({ onSubmit, onBack }: WeaknessStepProps) {
  const [selected, setSelected] = useState<WeaknessKey[]>([])
  const [isEtcOpen, setIsEtcOpen] = useState(false)
  const [note, setNote] = useState('')

  function handleToggle(key: WeaknessKey) {
    setSelected((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    )
  }

  function handleSubmit() {
    // 칩의 순서는 화면 순서로 맞춰 저장합니다. (누른 순서와 상관없이 결과가 늘 같은 모양이 되게)
    const ordered = weaknessOptions
      .map((option) => option.key)
      .filter((key) => selected.includes(key))
    onSubmit(ordered, isEtcOpen ? note : '')
  }

  // 칩 하나의 모양. 고르면 색이 채워집니다. 누르는 곳은 최소 40px(h-10)
  function chipClass(isOn: boolean) {
    return cn(
      'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium',
      isOn
        ? 'border-brand bg-brand text-white'
        : 'hover:border-brand border-slate-200 bg-white text-slate-700',
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <p className="text-brand text-sm font-semibold">생각 습관 테스트 · 마지막</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight break-keep sm:text-2xl">
          내가 생각하는 나의 약점은?
        </h1>
        <p className="mt-2 text-sm break-keep text-slate-500">
          여러 개 골라도 돼요. 없으면 그냥 넘어가도 돼요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {weaknessOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected.includes(option.key)}
            onClick={() => handleToggle(option.key)}
            className={chipClass(selected.includes(option.key))}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={isEtcOpen}
          onClick={() => setIsEtcOpen((previous) => !previous)}
          className={chipClass(isEtcOpen)}
        >
          기타
        </button>
      </div>

      {isEtcOpen && (
        <div className="flex flex-col gap-1.5">
          <Input
            id="weakness-note"
            label="기타 약점"
            value={note}
            maxLength={WEAKNESS_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            placeholder="예: 웹툰"
          />
          <p className="text-xs text-slate-500">
            {note.length} / {WEAKNESS_NOTE_MAX}자 · 이 글은 내 기기에만 저장되고 AI 에게 보내지
            않아요.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="w-full sm:w-auto" onClick={handleSubmit}>
          결과 보기
        </Button>
        <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={onBack}>
          ← 이전
        </Button>
      </div>
    </div>
  )
}
