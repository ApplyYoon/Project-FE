import { cn } from '@/lib/cn'
import { groupPlanByDate, summarizePlan, type CoachPlan, type PlanStatus } from '@/lib/coachPlan'
import { useState } from 'react'

/** 계획 상태 글자 (고치는 중이면 없음) */
const PLAN_STATUS_LABELS: Record<PlanStatus, string | null> = {
  open: null,
  replaced: '고치기 전',
  saved: '✅ 저장함',
  closed: '닫음',
}

/** 처음에 펼쳐 보여 줄 날 수. 나머지는 [전체 보기] 로 펼칩니다. */
const PLAN_SHOWN_DAYS = 3

interface PlanCardProps {
  plan: CoachPlan
  /** 바깥에서 여백 · 너비를 덧붙일 때 (맨 마지막에 합쳐서 덮어쓸 수 있음) */
  className?: string
}

/**
 * 계획 카드. 요약 한 줄 · 날짜별 카드 목록을 보여 줍니다. (lib/coachPlan.ts 의 CoachPlan)
 * 코치 채팅의 계획 말풍선과 AI 통화 화면(통화 중 "계획 짜 줘")에서 씁니다.
 * 고친 계획이 새로 나오면 지난 계획은 흐리게 보입니다.
 *
 *   <PlanCard plan={plan} />
 */
export function PlanCard({ plan, className }: PlanCardProps) {
  const [isAllShown, setIsAllShown] = useState(false)
  const groups = groupPlanByDate(plan.drafts)
  const shownGroups = isAllShown ? groups : groups.slice(0, PLAN_SHOWN_DAYS)
  const statusLabel = PLAN_STATUS_LABELS[plan.status]
  const title = plan.kind === 'long' && plan.spec ? `📅 ${plan.spec.goal}` : '📋 오늘 계획'
  return (
    <div
      className={cn(
        'mt-2 w-full rounded-[20px] border border-slate-200 bg-white p-3 sm:max-w-md',
        plan.status === 'replaced' && 'opacity-50',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[15px] font-bold break-words text-slate-900">{title}</p>
        {statusLabel && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {statusLabel}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500">{summarizePlan(plan)}</p>
      {plan.overflow && (
        <p className="mt-1 text-sm break-keep text-amber-700">
          하루 {plan.spec?.dailyMinutes}분으론 다 안 들어가서 줄였어. 늘리고 싶으면 말해 줘.
        </p>
      )}
      {plan.evidence.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {plan.evidence.slice(0, 2).map((line) => (
            <li key={line} className="text-xs break-keep text-slate-400">
              · {line}
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {shownGroups.map((group) => (
          <li key={group.date}>
            {/* 오늘 계획은 날짜가 하나뿐이라 날짜 줄을 생략합니다. */}
            {plan.kind === 'long' && (
              <p className="text-xs font-semibold text-slate-500">{group.label}</p>
            )}
            <ul className="flex flex-col gap-1">
              {group.drafts.map((draft, index) => (
                <li key={`${draft.startTime}-${index}`} className="flex gap-2 text-[15px]">
                  <span className="w-12 shrink-0 text-slate-500 tabular-nums">
                    {draft.startTime ?? '--:--'}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    <span className="text-slate-900">{draft.title}</span>
                    <span className="text-slate-400"> · {draft.durationMinutes}분</span>
                    {draft.checklist.length > 0 && (
                      <span className="block text-xs break-words text-slate-400">
                        {draft.checklist.join(' · ')}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {groups.length > PLAN_SHOWN_DAYS && (
        <button
          type="button"
          onClick={() => setIsAllShown(!isAllShown)}
          className="text-brand mt-1 h-10 cursor-pointer text-sm font-semibold"
        >
          {isAllShown ? '접기' : `전체 보기 (${groups.length - PLAN_SHOWN_DAYS}일 더)`}
        </button>
      )}
      {plan.isDemo && <p className="mt-1 text-xs text-amber-700">시연용 예시 (AI 아님)</p>}
    </div>
  )
}
