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

/** Date 를 계획 데이터와 같은 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString 은 한국 시간이 아니라서 쓰지 않습니다)*/
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' 날짜에서 days 일 만큼 이동한 날짜를 돌려줍니다. (-1 = 어제, 1 = 내일) */
function moveDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  // new Date(년, 월, 일) 은 일이 범위를 넘어가면 달·해를 알아서 넘겨줍니다. (월은 0부터 시작)
  return toDateKey(new Date(year, month - 1, day + days))
}

export function PlannerPage() {
  const todayKey = toDateKey(new Date())

  // 모든 날짜의 계획을 들고 있고, 화면에는 고른 날짜의 계획만 보여 줍니다.
  const [allPlans, setAllPlans] = useState<StudyPlan[]>(mockPlans)
  const [selectedDate, setSelectedDate] = useState(todayKey)

  const plans = allPlans.filter((plan) => plan.date === selectedDate)
  const isToday = selectedDate === todayKey

  // 'ko-KR' 로 바꾸면 "10월 5일 일요일" 처럼 한국어 날짜가 됩니다.
  // 'YYYY-MM-DD' 문자열은 영국 시간으로 읽히므로, 년·월·일을 쪼개서 우리 시간대로 만듭니다.
  const [year, month, day] = selectedDate.split('-').map(Number)
  const dateLabel = new Date(year, month - 1, day).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  // 체크박스를 누르면 그 계획의 done 만 뒤집습니다. (나머지는 그대로)
  function handleToggleDone(planId: string) {
    setAllPlans((prev) =>
      prev.map((plan) => (plan.id === planId ? { ...plan, done: !plan.done } : plan)),
    )
  }

  // window.confirm 은 브라우저 기본 확인창입니다. "확인" 을 누르면 true, "취소" 면 false 를 돌려줍니다.
  function handleDelete(target: StudyPlan) {
    const isConfirmed = window.confirm(`"${target.content}" 계획을 정말 지울까요?`)
    if (!isConfirmed) return
    // filter: 지울 계획만 빼고 나머지로 새 배열을 만듭니다.
    setAllPlans((prev) => prev.filter((plan) => plan.id !== target.id))
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">공부 계획</h1>

        {/* 날짜 이동: ◀ 어제 / 날짜 / 내일 ▶ / 오늘로 돌아가기 */}
        <div className="mt-3 flex items-center gap-1">
          <Button
            variant="secondary"
            onClick={() => setSelectedDate(moveDateKey(selectedDate, -1))}
            aria-label="어제로 이동"
            className="w-10 shrink-0 px-0"
          >
            ◀
          </Button>
          <p className="min-w-0 flex-1 text-center text-sm font-semibold whitespace-nowrap text-slate-900 sm:text-base">
            {dateLabel}
          </p>
          <Button
            variant="secondary"
            onClick={() => setSelectedDate(moveDateKey(selectedDate, 1))}
            aria-label="내일로 이동"
            className="w-10 shrink-0 px-0"
          >
            ▶
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSelectedDate(todayKey)}
            disabled={isToday}
            className="text-brand shrink-0 px-3"
          >
            오늘
          </Button>
        </div>
      </div>

      <Card title={isToday ? '오늘 계획' : `${month}월 ${day}일 계획`}>
        {plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {isToday ? '오늘' : '이 날'} 계획을 세워 보세요
          </p>
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
