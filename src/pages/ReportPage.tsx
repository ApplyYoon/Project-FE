import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AnalysisExperimentSuggestion, AnalysisInsight } from '@/components/ui/AiAnalysisCard'
import { useCards } from '@/hooks/useCards'
import { useQueryParam } from '@/hooks/useQueryParam'
import { loadStudySessions } from '@/lib/dailyRecords'
import { getTodayKey, moveDateKey, toDateKey, toDayDate } from '@/lib/date'
import {
  EXPERIMENT_DAYS,
  EXPERIMENT_STATUS_LABELS,
  getExperimentDay,
  loadExperiments,
} from '@/lib/experiments'
import { loadRoutines } from '@/lib/routines'
import { buildCardIdByPlanId } from '@/lib/sessionRecords'
import { findStrategy } from '@/lib/strategyCatalog'
import { loadRecord } from '@/lib/storage'
import {
  getWeekCardDays,
  getWeeklyNumbers,
  type WeekCardDay,
  type WeeklyNumbers,
} from '@/lib/weeklyCardStats'
import {
  PREDICTION_OPTIONS,
  describePredictionDiff,
  findPrediction,
  getActualValue,
  getAvailableKinds,
  getPredictionDiff,
  getPredictionQuestion,
  pickPredictionKind,
  savePrediction,
  type PredictionKind,
  type WeeklyPrediction,
} from '@/lib/weeklyPrediction'
import type { StudyPlan, StudySession } from '@/types'
import { useState } from 'react'

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토']

/** weeksAgo 번째 이전 주의 월요일 날짜를 돌려줍니다. (0 = 이번 주) */
function getMondayKey(weeksAgo: number): string {
  // 오늘은 하루의 기준(새벽 4시)으로 정합니다. 월요일 새벽 2시면 아직 일요일(지난주)입니다. (lib/date.ts)
  const date = toDayDate(Date.now())
  // getDay(): 일요일 0, 월요일 1 ... 토요일 6. 월요일에서 며칠 지났는지 계산합니다. (일요일은 6일 지난 것으로 봅니다)
  const daysFromMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysFromMonday - weeksAgo * 7)
  return toDateKey(date)
}

/** 'YYYY-MM-DD' 를 "10월 5일 (일)" 처럼 보여줍니다. */
function formatShortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return `${month}월 ${day}일 (${WEEKDAY_SHORT[date.getDay()]})`
}

/** 분을 "3시간 10분" 처럼 보여줍니다. 60분 미만이면 "분"만 보여줍니다. */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

/** % 숫자를 보여줍니다. 계산할 수 없는 값(null)은 0% 가 아니라 '-' 입니다. */
function formatPercent(value: number | null): string {
  return value === null ? '-' : `${value}%`
}

export function ReportPage() {
  // 타이머가 저장해 둔 공부 기록을 불러옵니다. 없으면 빈 목록입니다. (예시 숫자를 보여주지 않습니다)
  const [sessions] = useState<StudySession[]>(loadStudySessions)

  return (
    <div className="flex flex-col gap-8">
      {/* 리포트는 기록 탭의 하위 탭이라, 위의 [기록 | 리포트] 막대로 오갑니다. 따로 "‹ 기록" 링크를 두지 않습니다. (2026-10-18) */}
      <WeeklyReport sessions={sessions} />
    </div>
  )
}

interface WeeklyReportProps {
  sessions: StudySession[]
}

/**
 * 주간 리포트 (#72, 칸 고정은 #409 · 최종 기획서 「4.6 분석」)
 * 칸 5개를 이 순서로 고정합니다: ① 예측 후 공개 → ② 숫자 3개 → ③ 인사이트 1개 → ④ 지난 실험 결과 → ⑤ 다음 실험 제안
 */
function WeeklyReport({ sessions }: WeeklyReportProps) {
  // 0 = 이번 주, 1 = 지난 주, 2 = 지지난 주 ... 주소에 둡니다. (/records?tab=report&weeksAgo=1)
  // replace: ‹ › 를 여러 번 눌러도 뒤로 가기 한 번이면 리포트 화면을 떠납니다.
  const [weeksAgoParam, setWeeksAgoParam] = useQueryParam('weeksAgo', '0', { replace: true })
  // 주소의 값이 0 이상의 정수가 아니면 이번 주(0)로 봅니다.
  const weeksAgo = /^\d{1,3}$/.test(weeksAgoParam) ? Number(weeksAgoParam) : 0
  const { cards } = useCards()
  // 옛 계획으로 켠 타이머 기록도 카드에 잇는 표입니다. 화면이 열릴 때 한 번만 만듭니다. (lib/sessionRecords.ts)
  const [cardIdByPlanId] = useState(() =>
    buildCardIdByPlanId(loadRecord<StudyPlan[]>('plans'), loadRoutines()),
  )
  // 화면을 연 시각. 카드가 아직 판정 전(카드 시간 전 · 하는 중)인지 이 시각으로 봅니다.
  const [now] = useState(() => Date.now())

  const mondayKey = getMondayKey(weeksAgo)
  const weekName = weeksAgo === 0 ? '이번 주' : weeksAgo === 1 ? '지난주' : '이 주'
  const days = getWeekCardDays(cards, sessions, mondayKey, now, cardIdByPlanId)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-snug font-bold tracking-tight sm:text-3xl">
            주간 리포트
          </h1>
          <p className="mt-1 text-slate-600">
            {formatShortDate(mondayKey)} ~ {formatShortDate(moveDateKey(mondayKey, 6))}
          </p>
        </div>

        <div className="flex gap-1">
          <Button
            variant="secondary"
            aria-label="지난 주로 이동"
            className="w-10 shrink-0 px-0"
            onClick={() => setWeeksAgoParam(String(weeksAgo + 1))}
          >
            ‹
          </Button>
          <Button
            variant="secondary"
            aria-label="다음 주로 이동"
            disabled={weeksAgo === 0}
            className="w-10 shrink-0 px-0"
            onClick={() => setWeeksAgoParam(String(Math.max(0, weeksAgo - 1)))}
          >
            ›
          </Button>
        </div>
      </div>

      {/* key: 주를 넘기면 그 주의 예측을 새로 읽습니다. 안 맞힌 주는 다시 질문부터 보입니다. */}
      <WeekCells
        key={mondayKey}
        mondayKey={mondayKey}
        weekName={weekName}
        isCurrentWeek={weeksAgo === 0}
        days={days}
        sessions={sessions}
      />
    </>
  )
}

interface WeekCellsProps {
  /** 보고 있는 주의 월요일 ('YYYY-MM-DD') */
  mondayKey: string
  /** '이번 주' · '지난주' · '이 주' */
  weekName: string
  /** 아직 진행 중인 이번 주인지 */
  isCurrentWeek: boolean
  /** 이 주에 판정이 끝난 카드 하루치 */
  days: WeekCardDay[]
  sessions: StudySession[]
}

/**
 * 한 주의 칸 5개입니다.
 * 예측을 고르기 전에는 ① 질문만 보이고, 고르면 ② ~ ⑤ 가 열립니다. (숫자를 먼저 보면 맞혀 볼 수 없어서)
 * 맞혀 볼 숫자가 없는 주(판정이 끝난 카드가 없음)는 질문 없이 바로 엽니다.
 */
function WeekCells({ mondayKey, weekName, isCurrentWeek, days, sessions }: WeekCellsProps) {
  // 이 주에 이미 고른 답 ('study-predictions'). 처음 그릴 때 한 번만 읽습니다.
  const [prediction, setPrediction] = useState<WeeklyPrediction | undefined>(() =>
    findPrediction(mondayKey),
  )
  const numbers = getWeeklyNumbers(days)
  // 이미 맞힌 주는 그때 낸 질문을, 아니면 이번 차례 질문을 냅니다. (lib/weeklyPrediction.ts)
  const kind = prediction?.kind ?? pickPredictionKind(mondayKey, getAvailableKinds(numbers))
  const isLocked = prediction === undefined && kind !== null

  function handlePredict(value: number) {
    if (kind === null) return
    const actual = getActualValue(kind, numbers)
    if (actual === null) return
    const next: WeeklyPrediction = {
      weekStart: mondayKey,
      kind,
      predicted: value,
      actual,
      diff: getPredictionDiff(value, actual),
      answeredAt: Date.now(),
    }
    savePrediction(next)
    setPrediction(next)
  }

  return (
    <>
      {/* ① 예측 후 공개 */}
      <PredictionCard
        kind={kind}
        prediction={prediction}
        numbers={numbers}
        questionWeek={isCurrentWeek ? `${weekName} 지금까지` : weekName}
        onPredict={handlePredict}
      />

      {isLocked ? (
        <p className="text-sm break-keep text-slate-500">
          하나를 고르면 {weekName}의 숫자 3개 · 인사이트 · 실험 결과가 열려요.
        </p>
      ) : (
        <>
          {/* ② 숫자 3개 */}
          <NumbersSection weekName={weekName} numbers={numbers} />

          {/* ③ 인사이트 1개. 발견은 지금까지의 기록으로 만든 것이라, 지난 주를 볼 때는 제목만 맞게 바꿉니다. */}
          <section>
            <h2 className="text-lg font-bold text-slate-900">
              {isCurrentWeek ? '이번 주 발견' : '지금까지의 발견'}
            </h2>
            {/* 인사이트는 1개만. 최근 28일 기록으로 만든 AI 분석에서 '생각과 실제' 를 먼저 고릅니다. (#419) */}
            <AnalysisInsight sessions={sessions} className="mt-3" />
          </section>

          {/* ④ 지난 실험 결과. 가장 최근 자기 실험(#412)이 진행 중이면 며칠째인지, 끝났으면 판정 */}
          <section>
            <h2 className="text-lg font-bold text-slate-900">지난 실험 결과</h2>
            <LatestExperimentLine />
          </section>

          {/* ⑤ 다음 실험 제안. AI 분석이 고른 실험 하나를 보여 줍니다. (가설·실험 탭은 2026-10-18 에 지웠습니다) */}
          <section>
            <h2 className="text-lg font-bold text-slate-900">다음 실험 제안</h2>
            <AnalysisExperimentSuggestion className="mt-2" />
          </section>
        </>
      )}
    </>
  )
}

/**
 * 주간 리포트 ④ — 가장 최근에 시작한 자기 실험(lib/experiments.ts) 한 줄.
 *   진행 중   -> "'폰을 다른 방에' · 진행 중 · 5 / 14일째"
 *   끝남      -> "'폰을 다른 방에' · 효과 있음 · 실행률 50% → 70%"
 *   없음      -> "아직 해 본 실험이 없어요."
 */
function LatestExperimentLine() {
  // 실험은 화면을 열 때 한 번만 읽습니다. (이 화면에서는 실험을 바꾸지 않습니다)
  const [experiments] = useState(loadExperiments)
  const latest = [...experiments].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  if (!latest) {
    return <p className="mt-2 text-sm text-slate-500">아직 해 본 실험이 없어요.</p>
  }
  const rule = findStrategy(latest.strategyId)?.rule ?? latest.hypothesis
  // 진행 중이면 며칠째인지, 끝났으면 실험 전 → 실험 중 실행률을 붙입니다.
  let detail = ''
  if (latest.status === 'running') {
    detail = `${getExperimentDay(latest, getTodayKey())} / ${EXPERIMENT_DAYS}일째`
  } else if (latest.baselineRate !== undefined && latest.experimentRate !== undefined) {
    detail = `실행률 ${Math.round(latest.baselineRate * 100)}% → ${Math.round(latest.experimentRate * 100)}%`
  }
  return (
    <p className="mt-2 text-sm break-keep text-slate-700">
      <span className="font-semibold text-slate-900">&quot;{rule}&quot;</span> ·{' '}
      {EXPERIMENT_STATUS_LABELS[latest.status]}
      {detail !== '' && ` · ${detail}`}
    </p>
  )
}

interface PredictionCardProps {
  /** 낼 질문. 맞혀 볼 숫자가 없는 주면 null */
  kind: PredictionKind | null
  /** 이미 고른 답. 아직 안 골랐으면 undefined */
  prediction: WeeklyPrediction | undefined
  /** 이 주의 숫자. 실제 값을 여기서 꺼냅니다 */
  numbers: WeeklyNumbers
  /** 질문에 넣을 주 이름 (예: '지난주') */
  questionWeek: string
  /** 보기 하나를 눌렀을 때 */
  onPredict: (value: number) => void
}

/** ① 예측 후 공개 1문항. 고르기 전에는 보기만, 고른 뒤에는 내 예측 · 실제 · 차이를 보여줍니다. */
function PredictionCard({
  kind,
  prediction,
  numbers,
  questionWeek,
  onPredict,
}: PredictionCardProps) {
  if (kind === null) {
    return (
      <Card title="먼저 맞혀 보기">
        <p className="text-sm break-keep text-slate-500">
          이 주는 판정이 끝난 카드가 없어서 맞혀 볼 숫자가 없어요.
        </p>
      </Card>
    )
  }

  const { unit, values } = PREDICTION_OPTIONS[kind]
  const question = getPredictionQuestion(kind, questionWeek)

  if (prediction === undefined) {
    return (
      <Card title="먼저 맞혀 보기">
        <p className="text-base font-semibold break-keep text-slate-900">{question}</p>
        <p className="mt-1 text-sm text-slate-500">하나를 고르면 실제 숫자를 보여줄게.</p>
        {/* 1탭으로 고릅니다. 보기 5개가 375px 에서도 한 줄에 들어가게 5칸으로 나눕니다. */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {values.map((value) => (
            <Button
              key={value}
              variant="secondary"
              className="h-11 px-0"
              onClick={() => onPredict(value)}
            >
              {value}
              {unit}
            </Button>
          ))}
        </div>
      </Card>
    )
  }

  // 지금의 실제 값입니다. (이번 주는 기록이 늘면서 바뀝니다) 계산할 수 없게 됐으면 고를 때의 값을 씁니다.
  const actual = getActualValue(kind, numbers) ?? prediction.actual
  const diff = getPredictionDiff(prediction.predicted, actual)

  return (
    <Card title="먼저 맞혀 보기">
      <p className="text-sm break-keep text-slate-600">{question}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">내 예측</dt>
          <dd className="mt-1 text-2xl font-bold text-slate-900">
            {prediction.predicted}
            {unit}
          </dd>
        </div>
        <div className="bg-brand-light rounded-lg p-3">
          <dt className="text-brand text-xs">실제</dt>
          <dd className="mt-1 text-2xl font-bold text-slate-900">
            {actual}
            {unit}
          </dd>
        </div>
      </dl>
      <p className="text-brand mt-3 text-base font-semibold">
        {describePredictionDiff(kind, diff)}
      </p>
    </Card>
  )
}

interface NumbersSectionProps {
  /** '이번 주' · '지난주' · '이 주' */
  weekName: string
  numbers: WeeklyNumbers
}

/**
 * ② 숫자 3개 — 실행률 · 정시 시작 · 체크리스트 달성률. 모두 lib/cardResult.ts(#381)의 값입니다.
 * 바로 아래 한 줄에 측정 대 자기 보고 시간을 둡니다.
 */
function NumbersSection({ weekName, numbers }: NumbersSectionProps) {
  const totalMinutes = numbers.measuredMinutes + numbers.selfReportMinutes

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">{weekName} 숫자</h2>
      <p className="mt-1 text-sm break-keep text-slate-500">
        묻지 않고, 카드와 타이머 기록으로 계산한 숫자예요.
      </p>

      {/* 모바일은 한 줄에 하나, PC(sm 이상)는 3칸으로 나란히 */}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberStat
          label="실행률"
          value={formatPercent(numbers.runRate)}
          detail={
            numbers.cardCount === 0
              ? '판정이 끝난 카드가 없어요'
              : `카드 ${numbers.cardCount}개의 계획 시간 기준`
          }
        />
        <NumberStat
          label="정시 시작"
          value={formatPercent(numbers.onTimeRate)}
          detail={
            numbers.startedCount === 0
              ? '시작 시각이 있는 카드를 시작하면 보여요'
              : `시작한 ${numbers.startedCount}개 중 ${numbers.onTimeCount}개가 10분 안에`
          }
        />
        <NumberStat
          label="체크리스트 달성률"
          value={formatPercent(numbers.checklistRate)}
          detail={
            numbers.checklistCount === 0
              ? '카드를 시작하면 보여요'
              : `시작한 카드 ${numbers.checklistCount}개 기준`
          }
        />
      </div>

      {/* 측정 대 자기 보고: 타이머로 잰 시간과 끝난 뒤 적은 시간 */}
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm break-keep text-slate-600">
        측정{' '}
        <strong className="font-semibold text-slate-900">
          {formatMinutes(numbers.measuredMinutes)}
        </strong>{' '}
        · 자기 보고{' '}
        <strong className="font-semibold text-slate-900">
          {formatMinutes(numbers.selfReportMinutes)}
        </strong>
        {totalMinutes > 0 &&
          ` (측정 ${Math.round((numbers.measuredMinutes / totalMinutes) * 100)}%)`}
      </p>
    </section>
  )
}

interface NumberStatProps {
  /** 숫자의 이름 (예: '실행률') */
  label: string
  /** 크게 보여줄 값 (예: '72%', '-') */
  value: string
  /** 값 아래의 작은 설명 */
  detail: string
}

/** 숫자 한 칸 (이름 · 값 · 설명) */
function NumberStat({ label, value, detail }: NumberStatProps) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs break-keep text-slate-500">{detail}</p>
    </Card>
  )
}
