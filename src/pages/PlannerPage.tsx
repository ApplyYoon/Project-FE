import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { mockPlans, mockSubjects } from '@/lib/mock'
import type { SubjectColor } from '@/types'

/* 과목 색 → 태그 색. (#11 SubjectBadge 가 생기면 그걸로 바꾸면 됩니다) */
const subjectColorStyles: Record<SubjectColor, string> = {
  red: 'bg-red-50 text-red-600',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-green-50 text-green-600',
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
}

/** 오늘 날짜를 계획 데이터와 같은 'YYYY-MM-DD' 모양으로 만듭니다. */
function getTodayKey(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function PlannerPage() {
  // 가짜 데이터 중에서 날짜가 오늘인 계획만 고릅니다.
  const todayPlans = mockPlans.filter((plan) => plan.date === getTodayKey())

  // 'ko-KR' 로 바꾸면 "10월 5일 일요일" 처럼 한국어 날짜가 됩니다.
  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-slate-500">{todayLabel}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">공부 계획</h1>
      </div>

      <Card title="오늘 계획">
        {todayPlans.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">오늘 계획을 세워 보세요</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todayPlans.map((plan) => {
              const subject = mockSubjects.find((item) => item.id === plan.subjectId)

              return (
                <li key={plan.id} className="flex items-center gap-2 py-3">
                  {/* 완료 여부만 보여주는 표시입니다. (누르는 체크박스는 #14 에서 만듭니다) */}
                  <span
                    aria-label={plan.done ? '완료' : '미완료'}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold',
                      plan.done ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white',
                    )}
                  >
                    {plan.done && '✓'}
                  </span>

                  {subject && (
                    <span
                      className={cn(
                        'shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
                        subjectColorStyles[subject.color],
                      )}
                    >
                      {subject.name}
                    </span>
                  )}

                  {/* min-w-0 + break-words: 긴 내용이 가로 스크롤을 만들지 않게 합니다. */}
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-sm break-words text-slate-900',
                      plan.done && 'text-slate-400 line-through',
                    )}
                  >
                    {plan.content}
                  </span>

                  <span className="shrink-0 text-sm text-slate-500">{plan.targetMinutes}분</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
