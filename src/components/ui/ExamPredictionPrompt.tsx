import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { GRADE_OPTIONS, PREDICTION_MAX_LENGTH, isGradeGoal } from '@/lib/examGoal'
import { formatDday, getDaysUntil } from '@/lib/exams'
import type { Exam, Goal } from '@/types'
import { useState, type FormEvent } from 'react'

interface ExamPredictionPromptProps {
  exam: Exam
  /** 시험이 붙은 점수형 목표 */
  goal: Pick<Goal, 'title' | 'currentScore'>
  /** 예상을 골랐을 때. 고른 글자(예: '3등급')를 넘겨줍니다 */
  onPredict: (prediction: string) => void
  className?: string
}

/**
 * 시험 3일 전 "이번 시험 몇 등급 나올 것 같아?" 를 묻는 카드입니다. (기획서 「4.7」 시험 이벤트, #403)
 * 등급 목표면 1등급 ~ 9등급 버튼을 한 번 누르면 끝나고, 점수 목표면 한 줄로 적습니다.
 * 목표 상세 · 시험 화면에서 같이 씁니다.
 *
 * <ExamPredictionPrompt exam={exam} goal={goal} onPredict={(text) => ...} />
 */
export function ExamPredictionPrompt({
  exam,
  goal,
  onPredict,
  className,
}: ExamPredictionPromptProps) {
  const [text, setText] = useState('')
  const isGrade = isGradeGoal(goal)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (text.trim() !== '') onPredict(text)
  }

  return (
    <Card className={cn('border-amber-300 bg-amber-50', className)}>
      <p className="text-sm font-semibold text-amber-900">
        {exam.name} {formatDday(getDaysUntil(exam.date))}
      </p>
      <p className="mt-1 text-sm break-keep text-amber-900">
        '{goal.title}' 목표 기준으로, 이번 시험 {isGrade ? '몇 등급' : '몇 점'} 나올 것 같아?
      </p>
      {isGrade ? (
        // 375px 에서도 한 줄에 5개씩 들어가고, 누르는 곳은 40px(h-10) 입니다.
        <div role="group" aria-label="예상 등급" className="mt-3 grid grid-cols-5 gap-1.5">
          {GRADE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPredict(option)}
              className="h-10 cursor-pointer rounded-lg border border-amber-300 bg-white text-sm font-medium text-slate-800 hover:bg-amber-100"
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              id={`prediction-${exam.id}`}
              aria-label="예상 점수"
              value={text}
              maxLength={PREDICTION_MAX_LENGTH}
              placeholder="예) 72점"
              onChange={(event) => setText(event.target.value)}
              className="h-10 bg-white text-base"
            />
          </div>
          <Button type="submit" className="shrink-0" disabled={text.trim() === ''}>
            저장
          </Button>
        </form>
      )}
      <p className="mt-2 text-xs break-keep text-amber-800">
        시험이 끝나면 목표 화면에서 실제 결과 옆에 이 예상을 같이 보여 줄게요.
      </p>
    </Card>
  )
}
