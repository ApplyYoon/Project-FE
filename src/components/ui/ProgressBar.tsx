import { cn } from '@/lib/cn'

interface ProgressBarProps {
  /** 0~100 사이 숫자. 범위를 벗어나면 0 또는 100 으로 맞춥니다. */
  value: number
  /** true 면 막대 오른쪽에 "75%" 처럼 퍼센트 글자를 보여줍니다. */
  showLabel?: boolean
  className?: string
}

/**
 * 0~100 숫자를 가로 막대로 보여줍니다. (계획 달성률, 공부 시간 등)
 *
 * <ProgressBar value={75} />
 * <ProgressBar value={rate} showLabel />
 */
export function ProgressBar({ value, showLabel = false, className }: ProgressBarProps) {
  // 숫자가 아닌 값(NaN, 예: 0 / 0)이 오면 0 으로 봅니다.
  const safeValue = Number.isNaN(value) ? 0 : value
  // 0 보다 작으면 0, 100 보다 크면 100 으로 맞춰서 막대가 삐져나오지 않게 합니다.
  const percent = Math.round(Math.min(100, Math.max(0, safeValue)))

  return (
    <div className={cn('flex w-full items-center gap-3', className)}>
      {/* 회색 바탕 막대. overflow-hidden 으로 안쪽 막대가 둥근 모서리 밖으로 안 나가게 합니다. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="bg-brand h-full rounded-full transition-[width] duration-300"
          // 너비가 숫자에 따라 계속 바뀌어서 Tailwind 클래스로 만들 수 없어 인라인 style 을 씁니다.
          style={{ width: `${percent}%` }}
        />
      </div>

      {showLabel && (
        <span className="w-10 shrink-0 text-right text-sm font-medium text-slate-600">
          {percent}%
        </span>
      )}
    </div>
  )
}
