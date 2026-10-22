import { cn } from '@/lib/cn'
import { getOnboardingStages } from '@/lib/onboardingProgress'

interface OnboardingStepperProps {
  /** 지금 몇 번째 단계인지 (1 부터). 순서: 앱 소개 → 학년 → 심리검사 → 관리 설정 → 결과 */
  current: number
  className?: string
}

/**
 * 온보딩 화면 맨 위에 "2 / 5 · 학년" 과 칸 5개로 지금 어디쯤인지 보여 줍니다.
 * 끝이 보이면 끝까지 가고 싶어져서(목표 기울기 효과) 모든 온보딩 화면에 같은 모양으로 둡니다.
 * 단계 이름은 lib/onboardingProgress.ts 의 순서를 그대로 씁니다.
 *
 * <OnboardingStepper current={2} />
 */
export function OnboardingStepper({ current, className }: OnboardingStepperProps) {
  const labels = getOnboardingStages().map((stage) => stage.label)
  const total = labels.length
  // 범위 밖 숫자가 와도 1 ~ total 안으로 맞춥니다.
  const safeCurrent = Math.min(Math.max(1, current), total)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="flex items-baseline justify-between text-[13px]">
        <span className="font-semibold text-slate-900">{labels[safeCurrent - 1]}</span>
        <span className="text-slate-500 tabular-nums">
          {safeCurrent} / {total} 단계
        </span>
      </p>
      {/* 칸 하나 = 단계 하나. 지난 단계와 지금 단계는 brand 색으로 채웁니다. */}
      {/* flex-1: 단계 수가 바뀌어도 칸이 폭을 똑같이 나눠 가집니다. */}
      <ol aria-label="온보딩 단계" className="flex gap-1">
        {labels.map((label, index) => (
          <li
            key={label}
            aria-current={index + 1 === safeCurrent ? 'step' : undefined}
            aria-label={`${index + 1}단계 ${label}`}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              index + 1 <= safeCurrent ? 'bg-brand' : 'bg-slate-200',
            )}
          />
        ))}
      </ol>
    </div>
  )
}
