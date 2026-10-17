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
import { loadInsightDisputes, saveInsightDispute } from '@/lib/insightDisputes'
import { getAnalysisTabPath } from '@/lib/tabMenu'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

interface InsightCardProps {
  insight: Insight
  /** 근거 보기에서 날짜별 순공시간을 계산하는 데 쓰는 공부 기록 */
  sessions: StudySession[]
  /** true 면 내 기록으로 만든 발견이 아니라 미리 보기용 예시입니다. "예시" 표시가 붙습니다. */
  isExample?: boolean
  /** 한 문장 아래에 붙이는 풀이 (AI 분석의 본문 등). 없으면 한 문장만 */
  detail?: string
  /** true 면 AI 가 쓴 문장입니다. "AI 가 쓴 글" 표시가 붙습니다. (#419 AI 분석) */
  isAiWritten?: boolean
  className?: string
}

/**
 * "나를 잘 아는" 인사이트를 한 문장 카드로 보여줍니다. (#73)
 *
 * - 근거 보기 (#84): 누르면 이 결론이 나온 날짜마다 그날의 순공시간과 컨디션이 펼쳐집니다.
 * - 반응 버튼 3개 (#84): [몰랐는데 맞아] [이미 알던 거야] [틀렸어] 중 하나만 고를 수 있고,
 *   다시 눌러 바꿀 수 있습니다. 고른 반응은 저장됩니다.
 * - [틀렸어] 를 눌러도 **숨기지 않습니다** (#411). "그럼 2주 확인해볼래?" 로 자기 실험을 제안하고,
 *   실험 결과 사용자가 맞으면 "AI가 틀렸어요" 를 붙여 철회합니다. (lib/insightDisputes.ts)
 *
 * <InsightCard insight={insight} sessions={sessions} />
 * <InsightCard insight={insight} sessions={sessions} isExample />   // 예시일 때
 */
export function InsightCard({
  insight,
  sessions,
  isExample = false,
  detail,
  isAiWritten = false,
  className,
}: InsightCardProps) {
  const evidenceId = useId()
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false)
  // 처음에는 저장해 둔 반응을 불러옵니다. 저장된 게 없으면 인사이트가 들고 온 반응, 그것도 없으면 아직 안 고른 상태입니다.
  const [response, setResponse] = useState<InsightResponse | null>(
    () => getInsightResponses()[insight.id] ?? insight.response ?? null,
  )
  // 컨디션은 체크인에 저장돼 있어서 카드가 처음 그려질 때 한 번만 읽어 옵니다.
  const [checkIns] = useState(loadCheckInsByDate)
  // [틀렸어] 를 누른 뒤 실험으로 확인한 결과 (#411)
  const [dispute] = useState(() => loadInsightDisputes()[insight.id])

  const evidenceRows = buildEvidenceRows(insight.evidenceDates, sessions, checkIns)

  function handleSelectResponse(selected: InsightResponse) {
    setResponse(selected)
    saveInsightResponse(insight.id, selected)
    // [틀렸어] 면 이 문장을 실험의 가설로 쓸 수 있게 적어 둡니다. (실험을 시작해야 실제로 확인합니다)
    if (selected === 'wrong') saveInsightDispute(insight.id, { sentence: insight.sentence })
  }

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {/* 예시는 내 기록으로 만든 문장이 아니라는 것을 먼저 알려줍니다. */}
        {isExample && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            예시
          </span>
        )}
        {isAiWritten && (
          <span className="bg-brand-light text-brand rounded-full px-2 py-0.5 text-xs font-semibold">
            AI 가 쓴 글
          </span>
        )}
        {insight.isHypothesis && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            가설
          </span>
        )}
        <span className="text-sm font-medium text-slate-500">이번 주 발견</span>
      </div>

      <p
        className={cn(
          'mt-2 text-base font-semibold text-slate-900',
          dispute?.outcome === 'aiWrong' && 'text-slate-400 line-through',
        )}
      >
        {insight.sentence}
      </p>
      {detail && <p className="mt-1 text-sm break-keep text-slate-600">{detail}</p>}
      {dispute?.outcome === 'aiWrong' && (
        <p className="mt-1 text-sm font-medium text-violet-700">
          실험해 보니 AI가 틀렸어요. 이 발견은 철회했어요.
        </p>
      )}
      {dispute?.outcome === 'aiRight' && (
        <p className="mt-1 text-sm font-medium text-emerald-700">
          실험으로 확인했어요. 이 발견이 맞았어요.
        </p>
      )}

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

      {/* [틀렸어] → 숨기지 않고 2주 실험을 제안합니다. 이미 확인했으면 띄우지 않습니다. */}
      {response === 'wrong' && !dispute?.outcome && !isExample && (
        <div className="mt-3 rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
          <p className="break-keep">그럼 2주 확인해 볼래요? 기록으로 누가 맞는지 볼게요.</p>
          <Link
            to={`${getAnalysisTabPath('experiment')}&from=${encodeURIComponent(insight.id)}`}
            className="mt-2 inline-flex h-10 items-center rounded-lg bg-violet-600 px-3 font-medium text-white"
          >
            실험으로 확인하기
          </Link>
        </div>
      )}
    </Card>
  )
}
