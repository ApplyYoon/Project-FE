import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { mockPlans, mockSubjects } from '@/lib/mock'
import type { StudyPlan, SubjectColor } from '@/types'
import { useState } from 'react'

/* 과목 색 → 태그 색. (#11 SubjectBadge 가 생기면 그걸로 바꾸면 됩니다) */
const subjectColorStyles: Record<SubjectColor, string> = {
  red: 'bg-red-50 text-red-600',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-green-50 text-green-600',
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
}

export function PlannerPage() {
  const [plans, setPlans] = useState<StudyPlan[]>(mockPlans)

  // 체크박스를 누르면 그 계획의 done 만 뒤집습니다. (나머지는 그대로)
  function handleToggleDone(planId: string) {
    setPlans((prev) =>
      prev.map((plan) => (plan.id === planId ? { ...plan, done: !plan.done } : plan)),
    )
  }

  // window.confirm 은 브라우저 기본 확인창입니다. "확인" 을 누르면 true, "취소" 면 false 를 돌려줍니다.
  function handleDelete(target: StudyPlan) {
    const isConfirmed = window.confirm(`"${target.content}" 계획을 정말 지울까요?`)
    if (!isConfirmed) return
    // filter: 지울 계획만 빼고 나머지로 새 배열을 만듭니다.
    setPlans((prev) => prev.filter((plan) => plan.id !== target.id))
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">공부 계획</h1>

      <Card title="오늘 계획">
        {plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">오늘 계획을 세워 보세요</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {plans.map((plan) => {
              const subject = mockSubjects.find((item) => item.id === plan.subjectId)

              return (
                <li key={plan.id} className="flex items-center gap-2 py-1">
                  {/* label 로 감싸서 체크박스 주변 40px 전체를 눌러도 체크됩니다. */}
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={plan.done}
                      onChange={() => handleToggleDone(plan.id)}
                      aria-label={`${plan.content} 완료`}
                      className="accent-brand h-5 w-5 cursor-pointer"
                    />
                  </label>

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

                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(plan)}
                    aria-label={`${plan.content} 삭제`}
                    className="shrink-0 px-3 text-slate-500 hover:text-red-600"
                  >
                    삭제
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
