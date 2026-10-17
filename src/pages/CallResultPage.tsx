import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { ApiError } from '@/lib/api'
import {
  finishCall,
  readCallResultState,
  type CallConclusion,
  type ThinkingHabit,
} from '@/lib/callReview'
import { SUPPORT_PATH, helpLines } from '@/lib/helpLines'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

/**
 * 통화가 끝난 뒤 "오늘의 결론" 을 보여 주는 화면입니다. (BE 이슈 #28 · #29)
 *
 * 통화 화면이 넘겨준 통화 번호와 자막을 서버에 보내면, 서버가 정리해서 돌려줍니다. (lib/callReview.ts)
 *  - 대답에서 보인 생각 습관(인지편향): 이름 · 어떤 생각인지 · 근거 · 다음에 해 볼 행동
 *  - 오늘의 약속, 지난 약속을 지켰는지
 *  - 통화 요약
 * 위기 표현이 감지된 통화면 결론 대신 도움 안내를 먼저 보여 줍니다.
 *
 * 생각 습관의 이름은 "생각" 에 붙입니다. "너는 ~형이야" 처럼 사람에게 붙이지 않습니다.
 */
export function CallResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  // 처음 들어올 때 받은 값을 들고 있습니다. (정리가 끝나면 주소에 딸린 자막을 지우는데, 그 뒤에도 다시 시도할 수 있게)
  const [resultState] = useState(() => readCallResultState(location.state))

  // useMutation: 서버에 "통화를 마무리해 줘" 라고 보내는 요청입니다. 보내는 중·실패를 대신 관리해 줍니다. (docs/DATA-FETCHING.md 5장)
  const mutation = useMutation({
    mutationFn: finishCall,
    onSuccess: () => {
      // 정리가 끝났으면 방문 기록에 남아 있는 자막을 지웁니다. (화면에 보이는 결론은 그대로입니다)
      navigate(location.pathname, { replace: true, state: null })
    },
  })
  const { mutate } = mutation

  // 화면에 들어오면 한 번만 보냅니다.
  // (개발 모드에서는 React 가 useEffect 를 두 번 부르는데, ref 는 그대로 남아서 두 번 보내지 않습니다)
  const hasSent = useRef(false)
  useEffect(() => {
    if (resultState === null || hasSent.current) return
    hasSent.current = true
    mutate(resultState)
  }, [resultState, mutate])

  function handleRetry() {
    if (resultState !== null) mutate(resultState)
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">오늘의 통화 정리</h1>

      {resultState === null && (
        <Card>
          <p className="text-sm break-keep text-slate-700">
            정리할 통화가 없어요. 통화가 연결되지 않았거나, 서버에서 통화 번호를 받지 못했어요.
          </p>
        </Card>
      )}

      {resultState !== null && mutation.isPending && <ConclusionSkeleton />}

      {resultState !== null && mutation.isError && (
        <FinishError error={mutation.error} onRetry={handleRetry} />
      )}

      {mutation.isSuccess && <ConclusionView conclusion={mutation.data} />}

      {/* 모바일에서는 버튼을 위아래로, PC 에서는 나란히 놓습니다. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => navigate('/records')}
        >
          내 기록 보기
        </Button>
        <Button variant="ghost" className="w-full sm:w-auto" onClick={() => navigate('/')}>
          홈으로
        </Button>
      </div>
    </div>
  )
}

/** 서버가 정리하는 동안 보여 주는 자리 (진짜 카드와 비슷한 크기) */
function ConclusionSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="text-sm text-slate-500">
        통화 내용을 정리하고 있어요. 30초쯤 걸릴 수 있어요.
      </span>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  )
}

interface FinishErrorProps {
  error: Error
  onRetry: () => void
}

/** 정리하지 못했을 때. 이미 정리한 통화(409)가 아니면 다시 시도할 수 있습니다. */
function FinishError({ error, onRetry }: FinishErrorProps) {
  if (error instanceof ApiError && error.status === 409) {
    return (
      <Card>
        <p className="text-sm break-keep text-slate-700">
          이미 정리한 통화예요. 내 기록에서 다시 볼 수 있어요.
        </p>
      </Card>
    )
  }
  // 503 은 서버가 사람이 읽을 문장을 줍니다. (AI 가 꺼져 있음 · 정리 실패) 그 밖에는 기본 문장을 씁니다.
  const message =
    error instanceof ApiError && error.status === 503
      ? error.message
      : '통화 내용을 정리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  return (
    <Card>
      <p className="text-sm break-keep text-slate-700">{message}</p>
      <Button className="mt-4 w-full sm:w-auto" onClick={onRetry}>
        다시 정리하기
      </Button>
    </Card>
  )
}

interface ConclusionViewProps {
  conclusion: CallConclusion
}

/** 오늘의 결론. 위기 표현이 감지됐으면 도움 안내만 보여 줍니다. */
function ConclusionView({ conclusion }: ConclusionViewProps) {
  if (conclusion.showHelp) return <HelpCard />

  const hasPromise = conclusion.promiseIf !== null && conclusion.promiseThen !== null
  return (
    <div className="flex flex-col gap-4">
      <HabitCard habit={conclusion.bias} />

      {(hasPromise || conclusion.promiseKept !== null) && (
        <Card title="오늘의 약속">
          {conclusion.promiseKept !== null && (
            <p className="mb-2 text-sm break-keep text-slate-600">
              {conclusion.promiseKept
                ? '지난 약속은 지켰다고 했어요. 잘했어요!'
                : '지난 약속은 이번엔 못 지켰어요. 괜찮아요, 다시 해 보면 돼요.'}
            </p>
          )}
          {hasPromise && (
            <p className="text-base break-keep text-slate-900">
              만약 <strong>{conclusion.promiseIf}</strong> →{' '}
              <strong>{conclusion.promiseThen}</strong>
            </p>
          )}
        </Card>
      )}

      {conclusion.summary !== null && (
        <Card title="통화 요약">
          <p className="text-sm break-keep text-slate-700">{conclusion.summary}</p>
        </Card>
      )}
    </div>
  )
}

interface HabitCardProps {
  habit: ThinkingHabit | null
}

/** 대답에서 보인 생각 습관(인지편향) 카드 */
function HabitCard({ habit }: HabitCardProps) {
  if (habit === null) {
    return (
      <Card title="오늘 대화에서 보인 생각 습관">
        <p className="text-sm break-keep text-slate-700">
          오늘 대화에서는 뚜렷한 생각 습관이 보이지 않았어요.
        </p>
      </Card>
    )
  }
  return (
    <Card title="오늘 대화에서 보인 생각 습관">
      <p className="text-xl font-bold text-slate-900">{habit.label}</p>
      {/* 이름은 생각에 붙입니다. "너는 ~형이야" 가 아니라 "이런 생각에 붙이는 이름이에요" */}
      <p className="mt-1 text-sm break-keep text-slate-700">
        {habit.description}에 붙이는 이름이에요.
      </p>
      {habit.evidence !== null && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm break-keep text-slate-700">
          통화에서: {habit.evidence}
        </p>
      )}
      <div className="bg-brand/10 mt-4 rounded-lg px-3 py-3">
        <p className="text-brand-dark text-sm font-semibold">다음엔 이렇게 해 볼까요?</p>
        <p className="mt-1 text-sm break-keep text-slate-900">{habit.solution}</p>
      </div>
      <p className="mt-3 text-xs break-keep text-slate-500">
        한 번 보였다고 내가 그런 사람이라는 뜻은 아니에요. 생각 습관은 알아차리면 바꿀 수 있어요.
      </p>
    </Card>
  )
}

/** 위기 표현이 감지된 통화에서 보여 주는 도움 안내 */
function HelpCard() {
  return (
    <Card title="혼자 힘들어하지 않아도 돼요">
      <p className="text-sm break-keep text-slate-700">
        힘든 이야기를 들려줘서 고마워요. 오늘은 공부 이야기는 잠시 내려놓아도 괜찮아요. 믿을 수 있는
        어른에게 꼭 이야기해 주고, 이야기할 곳이 필요하면 아래로 언제든 연락해 보세요. 무료이고
        비밀이 지켜져요.
      </p>
      {/* 모바일에서는 눌러서 바로 전화가 걸립니다. 누르는 곳은 최소 40px(h-11 = 44px) */}
      <div className="mt-4 flex flex-col gap-2">
        {helpLines.map((line) => (
          <a
            key={line.number}
            href={`tel:${line.number}`}
            className="bg-brand hover:bg-brand-dark flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-white"
          >
            {line.name} {line.number}
          </a>
        ))}
      </div>
      <Link
        to={SUPPORT_PATH}
        className="mt-3 flex h-10 items-center justify-center text-sm font-medium text-slate-700 underline"
      >
        도움받을 수 있는 곳 더 보기
      </Link>
    </Card>
  )
}
