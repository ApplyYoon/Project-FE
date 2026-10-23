import { useSuspenseQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Card } from '@/components/ui/Card'
import { InsightCard } from '@/components/ui/InsightCard'
import { TalkButton } from '@/components/ui/TalkButton'
import { useAnalysisMaterial } from '@/hooks/useAnalysisMaterial'
import { aiAnalysisQuery, mergeAnalysis, type AnalysisView } from '@/lib/aiAnalysisApi'
import {
  ANALYSIS_DAYS,
  ANALYSIS_GROUPS,
  MIN_FACTS,
  buildCodeAnalysis,
  type AnalysisMaterial,
  type AnalysisSection,
} from '@/lib/analysisFacts'
import { cn } from '@/lib/cn'
import { getTodayKey } from '@/lib/date'
import { analysisLines } from '@/lib/talkLines'
import type { Insight, StudySession } from '@/types'

/**
 * AI 자기 분석을 보여 주는 조각들입니다. (#419 표 14번, 최종 기획서 「2 자기분석의 목표」 · 「4.6 분석」)
 *
 * - AiAnalysisCard              분석 › 기록 맨 위. 요약 + 묶음 5개(성향 · 생각과 실제 · 약속 지키기 · 공부 효율 · 실패 원인) + 다음 실험 제안
 * - AnalysisInsight             기록 › AI 분석 아래 '이번 발견' 1개 + 반응 버튼 (생각과 실제를 먼저)
 *   (주간 리포트에 있던 것을 리포트를 뺀 2026-10-23 에 옮겼습니다. 리포트의 '다음 실험 제안' 은 AiAnalysisCard 에도 있어서 지웠습니다)
 *
 * 숫자는 코드가 계산하고(lib/analysisFacts.ts), 서버의 AI 가 그 숫자를 말로 풉니다(lib/aiAnalysisApi.ts).
 * AI 를 기다리는 동안이나 못 받으면 코드가 만든 기본 문장이 보입니다. 화면이 비지 않습니다.
 */

const GROUP_LABELS = new Map(ANALYSIS_GROUPS.map((item) => [item.group, item.label]))

interface WithAnalysisProps {
  material: AnalysisMaterial
  /** 분석 한 벌을 받아 그릴 것. 기본 문장일 때도, AI 문장일 때도 이 함수로 그립니다 */
  children: (view: AnalysisView) => ReactNode
}

/**
 * AI 분석을 받아서 children 함수에 넘겨 그립니다.
 *   받는 중  -> 기본 문장으로 그림 (source: 'loading')
 *   실패     -> 안내 + 기본 문장으로 그림 (source: 'code')
 *   받음     -> AI 문장으로 그림 (source: 'ai'. AI 가 못 썼으면 'code')
 * 세 곳이 같은 일을 해서 한 곳에 모았습니다. children 을 함수로 받는 것은 "그리는 방법" 을 쓰는 쪽이 정하게 하려는 것입니다.
 */
function WithAnalysis({ material, children }: WithAnalysisProps) {
  const todayKey = getTodayKey()
  const code = buildCodeAnalysis(material)
  const codeView: AnalysisView = { analysis: code, source: 'code', facts: material.facts }

  return (
    <AsyncBoundary
      pendingFallback={children({ ...codeView, source: 'loading' })}
      errorMessage="AI 분석을 받아오지 못했어요. 아래는 숫자로만 정리한 거예요."
      errorExtra={children(codeView)}
      resetKeys={[todayKey]}
    >
      <AiAnalysisLoader material={material} todayKey={todayKey}>
        {children}
      </AiAnalysisLoader>
    </AsyncBoundary>
  )
}

interface AiAnalysisLoaderProps extends WithAnalysisProps {
  todayKey: string
}

/** 서버에 AI 분석을 물어봅니다. useSuspenseQuery 가 기다리는 동안에는 바깥의 AsyncBoundary 가 기본 문장을 보여 줍니다. */
function AiAnalysisLoader({ material, todayKey, children }: AiAnalysisLoaderProps) {
  const { data } = useSuspenseQuery(aiAnalysisQuery(material.facts, todayKey))
  return children(mergeAnalysis(buildCodeAnalysis(material), material.facts, data))
}

interface SourceBadgeProps {
  source: AnalysisView['source']
}

/** 누가 쓴 글인지 표시합니다. AI 가 쓴 글은 틀릴 수 있어서 꼭 밝힙니다. */
function SourceBadge({ source }: SourceBadgeProps) {
  if (source === 'ai') {
    return (
      <span className="bg-brand-light text-brand rounded-full px-2 py-0.5 text-xs font-semibold">
        AI 가 쓴 글
      </span>
    )
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      {source === 'loading' ? 'AI 가 읽는 중…' : '숫자로 정리'}
    </span>
  )
}

interface AiAnalysisCardProps {
  className?: string
}

/**
 * 분석 › 기록 맨 위의 "AI 분석" 카드입니다.
 *
 * <AiAnalysisCard />
 */
export function AiAnalysisCard({ className }: AiAnalysisCardProps) {
  const material = useAnalysisMaterial()

  if (material.facts.length < MIN_FACTS) {
    return (
      <Card title="AI 분석" className={className}>
        <p className="text-sm break-keep text-slate-600">
          카드를 며칠 더 하면 AI 가 기록을 읽고 언제 잘 되는지, 내 생각과 실제가 어떻게 다른지
          정리해 줘요.
        </p>
      </Card>
    )
  }

  return (
    <WithAnalysis material={material}>
      {(view) => <AnalysisCardView view={view} className={className} />}
    </WithAnalysis>
  )
}

interface AnalysisCardViewProps {
  view: AnalysisView
  className?: string
}

function AnalysisCardView({ view, className }: AnalysisCardViewProps) {
  const { analysis, source } = view
  return (
    <Card className={className} aria-busy={source === 'loading'}>
      {/* flex-wrap: 375px 에서 표시가 제목 아래로 내려갑니다. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold tracking-tight text-slate-900">AI 분석</h2>
        <SourceBadge source={source} />
      </div>
      <p className="mt-1 text-sm break-keep text-slate-500">
        최근 {ANALYSIS_DAYS}일 기록을 읽고 나를 정리했어요.
      </p>

      {/* 요약 한 줄이 이 카드의 결론이라 가장 크게, 줄 사이는 넉넉하게 둡니다. */}
      <p className="mt-4 text-[17px] leading-relaxed font-semibold break-keep text-slate-900 sm:text-lg">
        {analysis.summary}
      </p>

      {/* 묶음 다섯 개를 선(divide-y)으로만 나눕니다. (근접성) 처음에는 제목만 보이고 누르면 펼쳐집니다. */}
      <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        {analysis.sections.map((section) => (
          <li key={section.group} className="py-1">
            <AnalysisSectionView section={section} view={view} />
          </li>
        ))}
      </ul>

      {analysis.nextExperiment && (
        <div className="bg-brand-light mt-5 rounded-xl p-4">
          <p className="text-brand text-xs font-semibold">다음 2주 실험 제안</p>
          <p className="mt-1 leading-relaxed font-semibold break-keep text-slate-900">
            {analysis.nextExperiment.ifText} → {analysis.nextExperiment.thenText}
          </p>
          <p className="mt-1 text-sm leading-relaxed break-keep text-slate-600">
            {analysis.nextExperiment.why}
          </p>
        </div>
      )}

      {source === 'ai' && (
        <p className="mt-4 text-xs break-keep text-slate-500">
          AI 가 쓴 글은 틀릴 수 있어요. 묶음을 펼쳐 근거 숫자를 같이 확인해 주세요.
        </p>
      )}

      {/* 분석을 들고 대화방에서 다음에 바꿀 것 하나를 같이 정합니다. (#582) */}
      <TalkButton
        about={{ kind: 'WEEKLY_REPORT', lines: analysisLines(analysis, ANALYSIS_DAYS) }}
        label="📅 AI 분석 같이 볼래"
        className="mt-4"
      />
    </Card>
  )
}

interface AnalysisSectionViewProps {
  section: AnalysisSection
  view: AnalysisView
}

/** 묶음 하나: 이름표 · 한 줄 제목만 먼저 보이고, 누르면 본문 · 근거 숫자가 펼쳐집니다. (점진적 공개) */
function AnalysisSectionView({ section, view }: AnalysisSectionViewProps) {
  const evidence = view.facts.filter((fact) => section.evidenceKeys.includes(fact.key))
  return (
    // group: 펼쳤을 때(open) 오른쪽 ⌄ 표시를 뒤집으려고 붙입니다.
    <details className="group">
      {/* 제목 줄 전체가 누르는 곳입니다. min-h-11 = 44px. 기본 ▶ 표시는 숨기고 오른쪽에 ⌄ 를 둡니다. */}
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-slate-500">
            {GROUP_LABELS.get(section.group)}
          </span>
          <span className="mt-0.5 block text-[15px] leading-snug font-semibold break-keep text-slate-900">
            {section.headline}
          </span>
        </span>
        <span
          aria-hidden
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>
      <p className="max-w-prose pb-1 text-sm leading-relaxed break-keep text-slate-600">
        {section.body}
      </p>
      {evidence.length > 0 && (
        <details className="mt-1 text-sm">
          {/* min-h-11: 누르는 영역을 44px 로 둡니다. */}
          <summary className="text-brand flex min-h-11 cursor-pointer items-center font-medium">
            근거 숫자 {evidence.length}개
          </summary>
          <ul className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3">
            {evidence.map((fact) => (
              <li key={fact.key} className="break-keep text-slate-600 tabular-nums">
                <span className="font-medium text-slate-700">{fact.label}</span>{' '}
                <span className="font-semibold text-slate-900">{fact.value}</span>{' '}
                <span className="text-slate-500">({fact.basis})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </details>
  )
}

interface AnalysisInsightProps {
  /** 근거 보기에서 날짜별 순공시간을 계산하는 데 쓰는 공부 기록 */
  sessions: StudySession[]
  className?: string
}

/**
 * 기록 화면의 '이번 발견' 1개입니다. 생각과 실제가 있으면 그것을, 없으면 첫 묶음을 보여 줍니다. (「4.6」 인사이트 1개)
 * 반응 버튼 · [틀렸어] → 실험 제안은 InsightCard 가 그대로 합니다.
 *
 * <AnalysisInsight sessions={sessions} />
 */
export function AnalysisInsight({ sessions, className }: AnalysisInsightProps) {
  const material = useAnalysisMaterial()

  if (material.facts.length < MIN_FACTS) {
    return (
      <p className={cn('text-sm text-slate-500', className)}>
        아직 데이터가 모자라요. 기록이 쌓이면 발견이 생겨요.
      </p>
    )
  }

  return (
    <WithAnalysis material={material}>
      {(view) => {
        const sections = view.analysis.sections
        const section = sections.find((item) => item.group === 'distortion') ?? sections[0]
        if (!section) return null
        // 반응 버튼은 인사이트 id 로 저장됩니다. 분석은 날마다 새로 쓰므로 날짜와 묶음으로 id 를 만듭니다.
        const insight: Insight = {
          id: `analysis-${getTodayKey()}-${section.group}`,
          sentence: section.headline,
          evidenceDates: material.evidenceDates,
          isHypothesis: false,
        }
        return (
          <InsightCard
            insight={insight}
            detail={section.body}
            isAiWritten={view.source === 'ai'}
            sessions={sessions}
            className={className}
          />
        )
      }}
    </WithAnalysis>
  )
}
