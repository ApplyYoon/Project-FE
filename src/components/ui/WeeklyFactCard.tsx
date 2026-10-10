import { Card } from '@/components/ui/Card'
import { formatMinutes } from '@/lib/dailyRecords'
import { toDateKey } from '@/lib/date'
import {
  MIN_COMPLETION_SAMPLES,
  getFactDelta,
  getMondayKey,
  getWeeklyFacts,
} from '@/lib/weeklyFacts'
import type { InitialPlan, StudyPlan, StudySession } from '@/types'
import type { ReactNode } from 'react'

interface WeeklyFactCardProps {
  /** 모든 계획. 다른 주의 것이 섞여 있어도 됩니다. */
  plans: StudyPlan[]
  /** 모든 공부 기록. 다른 주의 것이 섞여 있어도 됩니다. */
  sessions: StudySession[]
  /** 온보딩에서 세운 처음 계획. 있으면 맨 아래에 "처음 계획 · 하루 평균" 한 줄을 보여줍니다. */
  initialPlan: InitialPlan | null
  /** 보여줄 주의 월요일 ('YYYY-MM-DD'). 비우면 이번 주입니다. */
  mondayKey?: string
  /** 지난 주를 넘겨 보는 중이면 true. 글자가 "이번 주 · 지난주" 대신 "이 주 · 그 전 주" 로 바뀝니다. */
  isPastWeek?: boolean
  /** 제목 오른쪽에 둘 것. 예) "리포트에서 자세히" 링크 */
  action?: ReactNode
  className?: string
}

/** 0분은 '0분', 그 밖에는 '2시간 14분' 처럼 보여줍니다. (formatMinutes 는 0분을 '1분 미만' 으로 보여줘서 따로 처리합니다) */
function formatTotalMinutes(minutes: number): string {
  return minutes <= 0 ? '0분' : formatMinutes(minutes)
}

/**
 * "이번 주 팩트" 카드입니다. (#245) 홈과 주간 리포트에서 같이 씁니다.
 * 계획과 타이머 기록에서 계산한 숫자 3개(계획 대비 실제 · 완주율 · 시작 지연)를 지난주와 비교해 보여줍니다.
 *
 * "잘했어", "부족해" 같은 평가하는 말은 넣지 않고 숫자만 보여줍니다. 색도 ▲▼ 줄에만 씁니다.
 *
 * <WeeklyFactCard plans={allPlans} sessions={sessions} initialPlan={initialPlan} />
 */
export function WeeklyFactCard({
  plans,
  sessions,
  initialPlan,
  mondayKey,
  isPastWeek = false,
  action,
  className,
}: WeeklyFactCardProps) {
  // 보고 있는 주와, 비교하는 그 전 주를 부르는 말
  const weekLabel = isPastWeek ? '이 주의' : '이번 주'
  const previousLabel = isPastWeek ? '그 전 주' : '지난주'

  const today = new Date()
  const { thisWeek, lastWeek, dailyAverageMinutes } = getWeeklyFacts(
    plans,
    sessions,
    mondayKey ?? getMondayKey(today),
    toDateKey(today),
  )

  /* ---------- 계획 대비 실제 ---------- */
  const planRateDelta = getFactDelta(thisWeek.planRate, lastWeek.planRate)

  /* ---------- 완주율 ---------- */
  const completionSamples = thisWeek.completionRate.sampleCount
  // 목표가 있는 타이머가 너무 적으면 숫자를 보여주지 않습니다. (한두 번으로 숫자가 크게 흔들립니다)
  const isCompletionReady = completionSamples >= MIN_COMPLETION_SAMPLES
  const completionDelta =
    isCompletionReady && lastWeek.completionRate.sampleCount >= MIN_COMPLETION_SAMPLES
      ? getFactDelta(thisWeek.completionRate, lastWeek.completionRate)
      : null

  /* ---------- 시작 지연 ---------- */
  const delayDelta = getFactDelta(thisWeek.startDelayMinutes, lastWeek.startDelayMinutes)

  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{weekLabel} 팩트</h3>
        {action}
      </div>

      {/* 모바일은 2칸(세 번째는 아랫줄), PC(sm 이상)는 3칸으로 나란히 놓습니다. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <FactStat
          label="계획 대비 실제"
          // 계산할 수 없는 숫자(null)는 0% 가 아니라 '-' 로 보여줍니다.
          value={thisWeek.planRate.value === null ? '-' : `${thisWeek.planRate.value}%`}
          detail={
            thisWeek.planRate.value === null
              ? '계획이 없었어요'
              : `계획 ${formatTotalMinutes(thisWeek.plannedMinutes)} 중 ${formatTotalMinutes(thisWeek.studyMinutes)}`
          }
          delta={
            planRateDelta === null
              ? null
              : `${planRateDelta > 0 ? '▲' : '▼'} ${previousLabel}보다 ${Math.abs(planRateDelta)}%p`
          }
        />

        {isCompletionReady ? (
          <FactStat
            label="완주율"
            value={`${thisWeek.completionRate.value}%`}
            detail={`${completionSamples}번 중 ${thisWeek.completedCount}번`}
            delta={
              completionDelta === null
                ? null
                : `${completionDelta > 0 ? '▲' : '▼'} ${previousLabel}보다 ${Math.abs(completionDelta)}%p`
            }
          />
        ) : (
          <FactStat
            label="완주율"
            value="-"
            detail={`목표를 정한 타이머 기록이 ${MIN_COMPLETION_SAMPLES - completionSamples}번 더 쌓이면 보여줄게요`}
            delta={null}
          />
        )}

        <FactStat
          label="시작 지연"
          value={
            thisWeek.startDelayMinutes.value === null
              ? '-'
              : `평균 ${thisWeek.startDelayMinutes.value}분`
          }
          detail={
            thisWeek.startDelayMinutes.value === null
              ? '시작 시각을 정한 계획을 시작하면 보여요'
              : `계획 ${thisWeek.startDelayMinutes.sampleCount}개 기준`
          }
          delta={
            delayDelta === null
              ? null
              : delayDelta > 0
                ? `▲ ${previousLabel}보다 ${delayDelta}분 늘었어`
                : `▼ ${previousLabel}보다 ${Math.abs(delayDelta)}분 줄었어`
          }
        />
      </dl>

      {/* 처음 계획(#240)이 있을 때만 보입니다. 비교 대상은 남이 아니라 "처음의 나" 입니다. */}
      {initialPlan !== null && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm break-keep text-slate-600">
          처음 계획{' '}
          <strong className="font-semibold text-slate-900">
            하루 {formatTotalMinutes(initialPlan.dailyMinutes)}
          </strong>{' '}
          · {weekLabel} 하루 평균{' '}
          <strong className="font-semibold text-slate-900">
            {formatTotalMinutes(dailyAverageMinutes)}
          </strong>
        </p>
      )}
    </Card>
  )
}

interface FactStatProps {
  /** 숫자의 이름 (예: '완주율') */
  label: string
  /** 크게 보여줄 값 (예: '55%', '-') */
  value: string
  /** 값 아래의 작은 설명 (예: '20번 중 11번') */
  detail: string
  /** 지난주와 비교한 한 줄 (예: '▲ 지난주보다 8%p'). 변화가 없거나 비교할 수 없으면 null */
  delta: string | null
}

/** 숫자 하나(이름 · 값 · 설명 · 지난주와 비교)를 보여줍니다. */
function FactStat({ label, value, detail, delta }: FactStatProps) {
  return (
    // min-w-0: 좁은 칸에서 긴 글자가 칸을 밀어내지 않고 줄바꿈되게 합니다.
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1">
        <span className="block text-2xl font-bold tracking-tight text-slate-900">{value}</span>
        <span className="mt-1 block text-xs break-keep text-slate-500">{detail}</span>
        {/* 색은 이 줄에만 씁니다. 오르든 내리든 같은 색이라 겁주지 않습니다. */}
        {delta !== null && (
          <span className="text-brand mt-1 block text-xs font-semibold break-keep">{delta}</span>
        )}
      </dd>
    </div>
  )
}
