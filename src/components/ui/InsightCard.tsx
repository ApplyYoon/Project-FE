import { Card } from '@/components/ui/Card'
import type { Insight } from '@/types'

interface InsightCardProps {
  insight: Insight
  className?: string
}

/**
 * "나를 잘 아는" 인사이트를 한 문장 카드로 보여줍니다. (#73)
 *
 * 근거 보기(펼치기)와 반응 버튼 3개는 #84 에서 이 카드에 이어 붙입니다.
 *
 * <InsightCard insight={insight} />
 */
export function InsightCard({ insight, className }: InsightCardProps) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {insight.isHypothesis && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            가설
          </span>
        )}
        <span className="text-sm font-medium text-slate-500">이번 주 발견</span>
      </div>

      <p className="mt-2 text-base font-semibold text-slate-900">{insight.sentence}</p>

      <p className="mt-2 text-sm text-slate-500">근거 {insight.evidenceDates.length}일 기록</p>
    </Card>
  )
}
