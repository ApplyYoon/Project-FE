import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useCards } from '@/hooks/useCards'
import { useManualItems } from '@/hooks/useManualItems'
import { useStudySessions } from '@/hooks/useStudySessions'
import { buildJudgedCardDays } from '@/lib/cardDays'
import { CARD_FAIL_CAUSES, loadCardMarks, type CardFailCause } from '@/lib/cardMarks'
import { isOneOffCard } from '@/lib/cards'
import { cn } from '@/lib/cn'
import { getTodayKey, moveDateKey } from '@/lib/date'
import {
  DEFAULT_MIN_GAIN_PP,
  EXPERIMENT_DAYS,
  createExperimentNow,
  getExperimentDay,
  isJudgeDay,
  judgeExperiment,
  loadExperiments,
  saveExperiments,
  type Experiment,
} from '@/lib/experiments'
import { getCardDayMarkInfo, loadRestDays } from '@/lib/restDays'
import { STRATEGY_LEVEL_LABELS, findStrategy, getStrategiesFor } from '@/lib/strategyCatalog'
import type { Card as CardModel } from '@/types'

/**
 * 분석 탭 › 자기 실험 (최종 기획서 「4.6 분석」 자기 실험, #412)
 *
 * 1. 가설: 최근 14일 못 한 이유 중 가장 많은 것
 * 2. 전략 카탈로그에서 쉬움 · 보통 · 강함 3개 → 1개
 * 3. 관련 카드에 '실험 규칙' 으로 붙임 (새 카드를 만들지 않음, 14일)
 * 4. 시작 전에 그만둘 기준을 정함 (기본: 실행률 +10%p 넘게 안 오르면 효과 없음)
 * 5. 14일이 지나면 붙인 카드의 기록으로 판정 → 효과가 있으면 나 사용설명서에 올림
 */

// 판정에 쓸 기록 범위 (기준선 14일 + 실험 14일)
const LOOKBACK_DAYS = EXPERIMENT_DAYS * 2
// 그만둘 기준으로 고를 수 있는 값 (%p)
const GAIN_OPTIONS = [5, 10, 15]

const STATUS_LABELS: Record<Experiment['status'], string> = {
  running: '진행 중',
  effective: '효과 있음',
  noEffect: '효과 없음',
  unclear: '기록이 모자라 알 수 없음',
}

/** 숫자(0 ~ 1)를 '62%' 로. 없으면 '–' */
function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '–' : `${Math.round(rate * 100)}%`
}

export function ExperimentPage() {
  const { cards } = useCards()
  const { allSessions } = useStudySessions()
  const { addItem } = useManualItems()
  const [experiments, setExperiments] = useState<Experiment[]>(loadExperiments)
  // 판정에 쓰는 '지금'. 화면을 열 때 한 번 정합니다.
  const [now] = useState(() => Date.now())
  const todayKey = getTodayKey()

  // 휴식 · 미루기 · 실패 표시는 화면을 열 때 한 번 읽습니다.
  const [restDays] = useState(loadRestDays)
  const [marks] = useState(loadCardMarks)
  const judgedDays = buildJudgedCardDays(
    cards,
    allSessions,
    moveDateKey(todayKey, -LOOKBACK_DAYS),
    todayKey,
    now,
    (cardId, dateKey) => getCardDayMarkInfo(cardId, dateKey, restDays, marks),
  )
  const running = experiments.find((item) => item.status === 'running')

  useEffect(() => {
    saveExperiments(experiments)
  }, [experiments])

  /** 판정일에 [결과 보기] 를 누르면, 시작 전에 정한 기준으로만 판정합니다. 효과가 있으면 사용설명서에 올립니다. */
  function handleJudge(target: Experiment) {
    const verdict = judgeExperiment(target, judgedDays)
    const judged: Experiment = {
      ...target,
      status: verdict.status,
      ...(verdict.baselineRate === null ? {} : { baselineRate: verdict.baselineRate }),
      ...(verdict.experimentRate === null ? {} : { experimentRate: verdict.experimentRate }),
    }
    setExperiments((prev) => prev.map((item) => (item.id === target.id ? judged : item)))
    if (verdict.status === 'effective') {
      const strategy = findStrategy(target.strategyId)
      addItem({
        id: `experiment-${target.id}`,
        category: 'effectiveMethod',
        title: strategy?.rule ?? '효과가 있었던 방법',
        confirmedDate: todayKey,
        evidence: `2주 실험: 실행률 ${percent(verdict.baselineRate)} → ${percent(verdict.experimentRate)}`,
      })
    }
  }

  function handleStart(experiment: Experiment) {
    setExperiments((prev) => [...prev, experiment])
  }

  const past = experiments.filter((item) => item.status !== 'running')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">자기 실험</h2>
        <p className="mt-1 text-sm text-slate-600">
          방법 하나를 카드에 붙여 {EXPERIMENT_DAYS}일 해 보고, 기록으로 효과를 확인해요. '지켰어?'
          는 묻지 않아요.
        </p>
      </div>

      {running ? (
        <RunningExperiment
          experiment={running}
          cards={cards}
          todayKey={todayKey}
          onJudge={() => handleJudge(running)}
        />
      ) : (
        <NewExperiment
          cards={cards}
          judgedDays={judgedDays}
          todayKey={todayKey}
          onStart={handleStart}
        />
      )}

      {past.length > 0 && (
        <Card title="지난 실험">
          <ul className="flex flex-col gap-2">
            {past.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">{findStrategy(item.strategyId)?.rule}</p>
                <p className="text-slate-600">
                  {STATUS_LABELS[item.status]} · 실행률 {percent(item.baselineRate)} →{' '}
                  {percent(item.experimentRate)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

interface RunningExperimentProps {
  experiment: Experiment
  cards: CardModel[]
  todayKey: string
  /** 판정일이 지났을 때 [결과 보기] */
  onJudge: () => void
}

/** 진행 중인 실험 */
function RunningExperiment({ experiment, cards, todayKey, onJudge }: RunningExperimentProps) {
  const strategy = findStrategy(experiment.strategyId)
  const attached = cards.filter((card) => experiment.cardIds.includes(card.id))
  const day = Math.min(getExperimentDay(experiment, todayKey), EXPERIMENT_DAYS)
  return (
    <Card title="진행 중인 실험">
      <p className="text-sm text-slate-600">가설: {experiment.hypothesis}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{strategy?.rule}</p>
      <p className="text-sm text-slate-600">{strategy?.why}</p>
      <p className="mt-3 text-sm text-slate-700">
        붙인 카드: {attached.map((card) => card.title).join(', ') || '없음'}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">
        {day}일째 / {EXPERIMENT_DAYS}일
      </p>
      <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
        그만둘 기준: 기준선보다 실행률이 {experiment.minGainPp}%p 넘게 오르지 않으면 효과 없음으로
        봐요. 판정일에는 이 기준만 확인해요.
      </p>
      {isJudgeDay(experiment, todayKey) && (
        <Button size="lg" className="mt-4 w-full" onClick={onJudge}>
          {EXPERIMENT_DAYS}일이 끝났어요 · 결과 보기
        </Button>
      )}
    </Card>
  )
}

interface NewExperimentProps {
  cards: CardModel[]
  judgedDays: ReturnType<typeof buildJudgedCardDays>
  todayKey: string
  onStart: (experiment: Experiment) => void
}

/** 최근 14일 못 한 이유 중 가장 많은 것 */
function findMainCause(
  days: NewExperimentProps['judgedDays'],
  todayKey: string,
): CardFailCause | undefined {
  const from = moveDateKey(todayKey, -(EXPERIMENT_DAYS - 1))
  const counts = new Map<CardFailCause, number>()
  for (const day of days) {
    if (day.dateKey < from || !day.missReason) continue
    counts.set(day.missReason, (counts.get(day.missReason) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** 새 실험 시작 — 가설 → 전략 1개 → 카드 고르기 → 그만둘 기준에 동의 */
function NewExperiment({ cards, judgedDays, todayKey, onStart }: NewExperimentProps) {
  const cause = findMainCause(judgedDays, todayKey)
  const causeLabel = CARD_FAIL_CAUSES.find((item) => item.key === cause)?.label
  const hypothesis = causeLabel
    ? `최근 2주 동안 '${causeLabel}' 때문에 놓친 카드가 가장 많아요.`
    : '시작이 어려워서 늦거나 놓치는 날이 있어요.'
  const strategies = getStrategiesFor(cause)
  const routineCards = cards.filter((card) => !isOneOffCard(card))
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? '')
  const [cardIds, setCardIds] = useState<string[]>([])
  const [minGainPp, setMinGainPp] = useState(DEFAULT_MIN_GAIN_PP)
  const canStart = strategyId !== '' && cardIds.length > 0

  return (
    <Card title="새 실험">
      <p className="text-sm font-medium text-slate-800">가설</p>
      <p className="mt-1 text-sm text-slate-700">{hypothesis}</p>

      <p className="mt-4 text-sm font-medium text-slate-800">해 볼 방법 하나</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {strategies.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={strategyId === item.id}
            onClick={() => setStrategyId(item.id)}
            className={cn(
              'min-h-10 rounded-lg border px-3 py-2 text-left text-sm',
              strategyId === item.id ? 'border-brand bg-brand/10' : 'border-slate-200',
            )}
          >
            <span className="text-xs font-semibold text-slate-500">
              {STRATEGY_LEVEL_LABELS[item.level]}
            </span>
            <span className="block font-medium text-slate-900">{item.rule}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm font-medium text-slate-800">이 방법을 붙일 반복 카드</p>
      {routineCards.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">
          반복 카드가 없어요. 카드 탭에서 반복 카드를 먼저 만들어요.
        </p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {routineCards.map((card) => (
            <li key={card.id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="accent-brand size-5"
                  checked={cardIds.includes(card.id)}
                  onChange={() =>
                    setCardIds((prev) =>
                      prev.includes(card.id)
                        ? prev.filter((id) => id !== card.id)
                        : [...prev, card.id],
                    )
                  }
                />
                <span className="text-slate-800">{card.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm font-medium text-slate-800">
        그만둘 기준 (시작하면 바꿀 수 없어요)
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {GAIN_OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={minGainPp === value}
            onClick={() => setMinGainPp(value)}
            className={cn(
              'h-10 rounded-lg border text-sm',
              minGainPp === value
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-slate-200 text-slate-700',
            )}
          >
            +{value}%p
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {EXPERIMENT_DAYS}일 뒤 실행률이 기준선보다 {minGainPp}%p 넘게 오르지 않으면 효과 없음으로
        보고 그만해요.
      </p>

      <Button
        size="lg"
        className="mt-4 w-full"
        disabled={!canStart}
        onClick={() =>
          onStart(
            createExperimentNow({
              hypothesis,
              cause,
              strategyId,
              cardIds,
              startDate: todayKey,
              minGainPp,
            }),
          )
        }
      >
        이 기준에 동의하고 시작
      </Button>
    </Card>
  )
}
