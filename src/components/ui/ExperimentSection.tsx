import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useManualItems } from '@/hooks/useManualItems'
import { useSuggestionChecks } from '@/hooks/useSuggestionChecks'
import { useSuggestions } from '@/hooks/useSuggestions'
import type { DatedSuggestion } from '@/lib/careInputs'
import { cn } from '@/lib/cn'
import { formatMinutes } from '@/lib/dailyRecords'
import type { ExperimentResult } from '@/lib/experimentJudge'
import {
  buildManualItem,
  formatClockMinutes,
  getExperimentProgress,
  splitActiveExperiments,
  summarizeExperiment,
} from '@/lib/experimentResult'
import type { SuggestionGrade } from '@/lib/suggestionRate'
import type { StudyPlan, StudySession } from '@/types'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/** "1주 더 해보기" 로 늘리는 일수 */
const EXTEND_DAYS = 7

/** 효과 판정을 사람이 읽는 말로: 이름표 글자와 색 */
const resultBadges: Record<ExperimentResult, { label: string; className: string }> = {
  effective: { label: '효과 있음', className: 'bg-emerald-50 text-emerald-700' },
  noEffect: { label: '효과 없음', className: 'bg-slate-100 text-slate-700' },
  unclear: { label: '애매', className: 'bg-amber-50 text-amber-700' },
}

/** 판정별로 결과를 풀어 주는 한 줄 */
const resultMessages: Record<ExperimentResult, string> = {
  effective: '순공시간이나 달성률이 올랐어요. 이 방법이 나한테 맞는다고 말할 수 있어요.',
  noEffect: '눈에 띄는 변화가 없었어요. 다른 방법을 골라 볼까요?',
  unclear: '기록이 모자라거나 결과가 엇갈려서 단정하기 어려워요. 1주 더 지켜볼게요.',
}

/** 이행 판정을 사람이 읽는 말로 */
const gradeLabels: Record<SuggestionGrade, string> = {
  good: '잘 시행',
  partial: '부분 시행',
  poor: '못 시행',
}

/** 'YYYY-MM-DD' 를 '10월 13일' 처럼 바꿉니다. */
function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}

/** 시작 시각 평균을 '19:25' 로, 없으면 '-' 로 보여줍니다. */
function formatStart(minutesOfDay: number | null): string {
  return minutesOfDay === null ? '-' : formatClockMinutes(minutesOfDay)
}

/** 하루 평균 순공을 '3시간 20분' 으로, 없으면 '-' 로 보여줍니다. */
function formatStudy(minutes: number | null): string {
  return minutes === null ? '-' : formatMinutes(Math.round(minutes))
}

/** 개선안 문장 한 줄: "만약 ~하면 → ~한다" */
function SuggestionSentence({ suggestion }: { suggestion: DatedSuggestion }) {
  return (
    <p className="text-base font-semibold break-words text-slate-900">
      <span className="text-brand">만약</span> {suggestion.ifText} → {suggestion.thenText}
    </p>
  )
}

interface ExperimentSectionProps {
  /** 효과 판정에 쓰는 모든 날짜의 계획 */
  plans: StudyPlan[]
  /** 효과 판정에 쓰는 공부 기록 */
  sessions: StudySession[]
  className?: string
}

/**
 * 개선안 실험의 진행 상황과 끝난 뒤 결과를 보여줍니다. (#93, 기획서 v2 4장)
 *
 * - 진행 중: "14일 중 5일째" 진행 막대와 지금까지 이행률. "바꾸기" 버튼은 없습니다. (기간 중에는 바꾸지 않습니다)
 * - 끝난 뒤: 실험 전 2주와 실험 중을 비교한 표와 판정(#92), 그리고 판정에 따른 버튼
 *     효과 있음 → 나 사용설명서에 올리기 / 효과 없음 → 다른 방법 고르기 / 애매 → 1주 더 해보기 또는 그만하기
 *
 * <ExperimentSection plans={allPlans} sessions={sessions} />
 */
export function ExperimentSection({ plans, sessions, className }: ExperimentSectionProps) {
  const navigate = useNavigate()
  const { suggestions, extendChallenge, finishChallenge } = useSuggestions()
  const { checks } = useSuggestionChecks()
  const { addItem } = useManualItems()
  // 버튼을 누른 뒤 무슨 일이 있었는지 알려 주는 한 줄 (카드가 사라져도 남아 있게 따로 둡니다)
  const [notice, setNotice] = useState<{ text: string; hasManualLink: boolean } | null>(null)

  const { ongoing, finished } = splitActiveExperiments(suggestions)

  /** 효과 있음: 나 사용설명서에 올리고 실험을 마무리합니다. */
  function handleRegister(suggestion: DatedSuggestion) {
    const summary = summarizeExperiment(suggestion, plans, sessions, checks)
    addItem(buildManualItem(suggestion, summary))
    finishChallenge(suggestion.id, 'done')
    setNotice({ text: '나 사용설명서에 올렸어요. 내 나무의 열매가 되었어요.', hasManualLink: true })
  }

  /** 효과 없음: 실험을 마무리하고 새 개선안을 고르러 갑니다. */
  function handleChooseAnother(suggestion: DatedSuggestion) {
    finishChallenge(suggestion.id, 'dropped')
    navigate('/suggestions')
  }

  /** 애매: 기간을 1주 늘립니다. */
  function handleExtend(suggestion: DatedSuggestion) {
    extendChallenge(suggestion.id, EXTEND_DAYS)
    setNotice({
      text: `1주 더 해보기로 했어요. 결과는 ${EXTEND_DAYS}일 뒤에 다시 알려줄게요.`,
      hasManualLink: false,
    })
  }

  /** 애매한데 더 하고 싶지 않을 때: 실험을 그만둡니다. 자리가 비어서 새 개선안을 고를 수 있습니다. */
  function handleStop(suggestion: DatedSuggestion) {
    finishChallenge(suggestion.id, 'dropped')
    setNotice({ text: '실험을 그만뒀어요. 새 개선안을 고를 수 있어요.', hasManualLink: false })
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium break-words text-emerald-700"
        >
          {notice.text}{' '}
          {notice.hasManualLink && (
            <Link to="/manual" className="underline">
              사용설명서 보기
            </Link>
          )}
        </p>
      )}

      {ongoing.length === 0 && finished.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            도전 중인 실험이 없어요. 개선안을 고르면 여기에 보여요.
          </p>
          <Link
            to="/suggestions"
            className="text-brand mt-1 inline-flex h-11 items-center text-sm font-medium underline"
          >
            개선안 고르러 가기
          </Link>
        </Card>
      )}

      {/* 모바일은 한 줄에 하나, PC(lg)는 두 칸. 카드마다 자기 높이만큼만 차지합니다. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {finished.map((suggestion) => {
          const summary = summarizeExperiment(suggestion, plans, sessions, checks)
          const badge = resultBadges[summary.result]
          return (
            <Card key={suggestion.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-500">
                  지난 실험 결과 · {suggestion.days}일
                </p>
                <span
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold', badge.className)}
                >
                  {badge.label}
                </span>
              </div>

              <div className="mt-2">
                <SuggestionSentence suggestion={suggestion} />
              </div>
              <p className="mt-2 text-sm text-slate-600">{resultMessages[summary.result]}</p>

              {/* 실험 전 2주 · 실험 중 비교표 */}
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-right text-slate-500">
                    <th scope="col" className="pb-2 text-left font-medium">
                      <span className="sr-only">항목</span>
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      실험 전 2주
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      실험 중
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <th scope="row" className="py-2 text-left font-medium text-slate-600">
                      첫 시작 평균
                    </th>
                    <td className="py-2 text-right text-slate-700">
                      {formatStart(summary.baseline.averageFirstStartMinutes)}
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {formatStart(summary.experiment.averageFirstStartMinutes)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-left font-medium text-slate-600">
                      하루 순공
                    </th>
                    <td className="py-2 text-right text-slate-700">
                      {formatStudy(summary.baseline.averageStudyMinutes)}
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {formatStudy(summary.experiment.averageStudyMinutes)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-left font-medium text-slate-600">
                      이행률
                    </th>
                    <td className="py-2 text-right text-slate-400">-</td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {summary.fulfillment === null
                        ? '기록 없음'
                        : `${summary.fulfillment.rate}% ${gradeLabels[summary.fulfillment.grade]}`}
                    </td>
                  </tr>
                </tbody>
              </table>

              {summary.result === 'effective' && (
                <Button className="mt-4 h-11 w-full" onClick={() => handleRegister(suggestion)}>
                  나 사용설명서에 올리기
                </Button>
              )}
              {summary.result === 'noEffect' && (
                <Button
                  variant="secondary"
                  className="mt-4 h-11 w-full"
                  onClick={() => handleChooseAnother(suggestion)}
                >
                  다른 방법 고르기
                </Button>
              )}
              {summary.result === 'unclear' && (
                // 기록이 모자라면 계속 "애매" 가 나올 수 있어서, 더 하지 않고 그만두는 길도 둡니다.
                // (그만두지 못하면 도전 자리가 영영 비지 않아서 새 개선안을 못 고릅니다)
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    className="h-11 w-full"
                    onClick={() => handleExtend(suggestion)}
                  >
                    1주 더 해보기
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 w-full"
                    onClick={() => handleStop(suggestion)}
                  >
                    그만하기
                  </Button>
                </div>
              )}
            </Card>
          )
        })}

        {ongoing.map((suggestion) => {
          const progress = getExperimentProgress(suggestion, checks)
          return (
            <Card key={suggestion.id}>
              <p className="text-sm font-medium text-slate-500">도전 중인 실험</p>
              <div className="mt-2">
                <SuggestionSentence suggestion={suggestion} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700">
                  {progress.totalDays}일 중 {progress.dayIndex}일째
                </span>
                <span className="text-slate-600">
                  {progress.rate === null ? (
                    '이행률은 내일부터 보여요'
                  ) : (
                    <>
                      이행률 <strong className="text-slate-900">{progress.rate}%</strong> (
                      {progress.keptDays} / {progress.elapsedDays}일)
                    </>
                  )}
                </span>
              </div>
              <ProgressBar
                value={(progress.dayIndex / progress.totalDays) * 100}
                className="mt-2"
              />
              {/* 진행 중에는 "바꾸기" 버튼을 두지 않습니다. 끝까지 해야 효과를 알 수 있습니다. */}
              <p className="mt-3 text-sm break-words text-slate-500">
                {formatMonthDay(progress.resultDate)}에 결과가 나와요. 끝까지 해야 효과를 알 수
                있어서, 기간 중에는 바꿀 수 없어요.
              </p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
