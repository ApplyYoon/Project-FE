import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { formatMinutes } from '@/lib/dailyRecords'
import { buildEvidenceRows, formatShortDate, loadCheckInsByDate } from '@/lib/insightEvidence'
import {
  getInsightResponses,
  insightResponseOptions,
  saveInsightResponse,
} from '@/lib/insightResponses'
import type { Insight, InsightResponse, StudySession } from '@/types'
import { useId, useState } from 'react'

interface InsightCardProps {
  insight: Insight
  /** 근거 보기에서 날짜별 순공시간을 계산하는 데 쓰는 공부 기록 */
  sessions: StudySession[]
  className?: string
}

/**
 * "나를 잘 아는" 인사이트를 한 문장 카드로 보여줍니다. (#73)
 *
 * - 근거 보기 (#84): 누르면 이 결론이 나온 날짜마다 그날의 순공시간과 컨디션이 펼쳐집니다.
 * - 반응 버튼 3개 (#84): [몰랐는데 맞아] [이미 알던 거야] [틀렸어] 중 하나만 고를 수 있고,
 *   다시 눌러 바꿀 수 있습니다. 고른 반응은 저장됩니다.
 *
 * <InsightCard insight={insight} sessions={sessions} />
 */
export function InsightCard({ insight, sessions, className }: InsightCardProps) {
  const evidenceId = useId()
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false)
  // 처음에는 저장해 둔 반응을 불러옵니다. 저장된 게 없으면 인사이트가 들고 온 반응, 그것도 없으면 아직 안 고른 상태입니다.
  const [response, setResponse] = useState<InsightResponse | null>(
    () => getInsightResponses()[insight.id] ?? insight.response ?? null,
  )
  // 컨디션은 체크인에 저장돼 있어서 카드가 처음 그려질 때 한 번만 읽어 옵니다.
  const [checkIns] = useState(loadCheckInsByDate)

  const evidenceRows = buildEvidenceRows(insight.evidenceDates, sessions, checkIns)

  function handleSelectResponse(selected: InsightResponse) {
    setResponse(selected)
    saveInsightResponse(insight.id, selected)
  }

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

      {/* h-11 = 44px: 손가락으로 누르기 쉬운 높이 */}
      <button
        type="button"
        aria-expanded={isEvidenceOpen}
        aria-controls={evidenceId}
        onClick={() => setIsEvidenceOpen((prev) => !prev)}
        className="text-brand mt-1 inline-flex h-11 cursor-pointer items-center text-sm font-medium underline"
      >
        {isEvidenceOpen ? '근거 접기' : '근거 보기'} · {evidenceRows.length}일 기록
      </button>

      {isEvidenceOpen && (
        <ul id={evidenceId} className="mb-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
          {evidenceRows.map((row) => (
            <li
              key={row.date}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
            >
              <span className="font-medium text-slate-700">{formatShortDate(row.date)}</span>
              <span className="text-slate-600">
                {row.studyMinutes > 0 ? formatMinutes(row.studyMinutes) : '공부 기록 없음'}
                {' · '}
                {row.condition === null ? '체크인 없음' : `컨디션 ${row.condition}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 375px 에서 3개가 한 줄에 안 들어가면 줄이 바뀝니다. (flex-wrap) */}
      <div
        role="radiogroup"
        aria-label="이 발견에 대한 내 반응"
        className="mt-2 flex flex-wrap gap-2"
      >
        {insightResponseOptions.map((option) => {
          const isSelected = response === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelectResponse(option.value)}
              className={cn(
                'h-10 cursor-pointer rounded-lg border px-3 text-sm font-medium transition-colors',
                isSelected
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
