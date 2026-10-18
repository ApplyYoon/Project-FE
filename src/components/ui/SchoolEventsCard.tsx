import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { useIsServerData } from '@/hooks/useIsServerData'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { getTodayKey } from '@/lib/date'
import { formatDday } from '@/lib/exams'
import {
  daysUntilKey,
  dismissReplan,
  filterForGrade,
  formatPeriodDates,
  getNextExamPeriod,
  getUpcomingPeriods,
  groupEventPeriods,
  loadDismissedReplans,
  shouldSuggestReplan,
} from '@/lib/schoolEvents'
import { refreshSchoolEvents, schoolEventsQuery } from '@/lib/schoolEventsApi'
import { getMyGrade } from '@/lib/schoolToday'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

/** 목록에 보여줄 다가오는 일정 수 */
const UPCOMING_LIMIT = 5

/**
 * 카드 탭의 "학교 일정" 칸입니다. (FE#508)
 * 가입 때 고른 학교의 학사일정(NEIS)을 서버가 받아 두고, 여기서는 내 학년 것만 보여줍니다.
 *   - 다음 시험이 14일 안이면 "계획 다시 짜기" 를 제안합니다. (닫으면 그 시험 동안은 다시 안 뜸)
 *   - [새로고침]: 학교가 일정을 바꿨을 때 바로 다시 받아옵니다. (서버는 하루에 한 번 알아서도 받음)
 * 진짜 로그인일 때만 보입니다. 테스트 로그인은 학교 정보가 서버에 없어서 그리지 않습니다.
 */
export function SchoolEventsCard() {
  const isServerData = useIsServerData()
  if (!isServerData) return null

  return (
    <AsyncBoundary
      pendingFallback={<Skeleton className="h-40 w-full" />}
      errorMessage="학교 일정을 불러오지 못했어요."
    >
      <SchoolEventsContent />
    </AsyncBoundary>
  )
}

/** 받아온 학사일정을 그립니다. 받아오는 부분이라 AsyncBoundary 안에서 씁니다. */
function SchoolEventsContent() {
  const { data } = useSuspenseQuery(schoolEventsQuery())
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState(loadDismissedReplans)

  const refresh = useMutation({
    mutationFn: refreshSchoolEvents,
    // 새로 받은 일정으로 화면의 쿼리 값을 바로 바꿉니다. (한 번 더 받아오지 않아도 됨)
    onSuccess: (result) => queryClient.setQueryData(schoolEventsQuery().queryKey, result),
  })

  // 학교를 고르지 않았으면 칸을 숨깁니다. (학교는 설정 > 내 정보에서 고를 수 있음)
  if (data.school === null) return null

  const todayKey = getTodayKey()
  const grade = getMyGrade()
  const periods = groupEventPeriods(filterForGrade(data.events, grade))
  const upcoming = getUpcomingPeriods(periods, todayKey, UPCOMING_LIMIT)
  const nextExam = getNextExamPeriod(periods, todayKey)
  const showReplan = shouldSuggestReplan(nextExam, todayKey, dismissed)

  const handleDismissReplan = () => {
    if (nextExam) setDismissed(dismissReplan(nextExam))
  }

  return (
    <Card>
      {/* 제목 줄: 학교 이름이 길면 줄여서 [새로고침] 이 밀려나지 않게 합니다. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">학교 일정</h3>
          <p className="truncate text-xs text-slate-500">{data.school.name}</p>
        </div>
        <Button
          variant="secondary"
          className="shrink-0"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? '받는 중…' : '새로고침'}
        </Button>
      </div>

      {refresh.isError && (
        <p role="alert" className="mb-3 text-sm break-keep text-red-600">
          {getApiErrorMessage(refresh.error)}
        </p>
      )}

      {nextExam && (
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">다음 시험</p>
          <p className="flex flex-wrap items-baseline gap-x-2 font-medium break-keep text-slate-900">
            <span className="text-brand font-semibold">
              {formatDday(daysUntilKey(nextExam.start, todayKey))}
            </span>
            <span>{nextExam.name}</span>
            <span className="text-sm font-normal text-slate-600">
              {formatPeriodDates(nextExam)}
            </span>
          </p>
        </div>
      )}

      {showReplan && nextExam && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm break-keep text-amber-900">
            시험까지 {Math.max(0, daysUntilKey(nextExam.start, todayKey))}일 남았어요. 시험 범위에
            맞춰 공부 카드를 다시 짜 볼까요?
          </p>
          {/* 모바일은 버튼 두 개를 꽉 채워 나란히, sm 부터는 왼쪽에 모읍니다. */}
          <div className="flex gap-2">
            <Link
              to="/cards/new"
              className="bg-brand hover:bg-brand-dark inline-flex h-10 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium text-white sm:flex-none"
            >
              계획 다시 짜기
            </Link>
            <Button variant="ghost" className="flex-1 sm:flex-none" onClick={handleDismissReplan}>
              괜찮아요
            </Button>
          </div>
        </div>
      )}

      {upcoming.length === 0 ? (
        <p className="text-sm break-keep text-slate-500">
          앞으로 4달 안의 학교 일정이 아직 없어요. 학교가 나이스(NEIS)에 올리면 여기에 보여요.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {upcoming.map((period) => (
            <li key={`${period.start}|${period.name}`} className="flex items-center gap-3 py-2">
              <span className="w-28 shrink-0 text-sm text-slate-500 sm:w-36">
                {formatPeriodDates(period)}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm text-slate-900',
                  period.exam && 'font-semibold',
                )}
              >
                {period.name}
              </span>
              {period.exam && (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  시험
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.fetchedAt !== null && (
        <p className="mt-3 text-xs text-slate-400">
          나이스(NEIS) 학사일정 · {formatFetchedAt(data.fetchedAt)} 에 받음
        </p>
      )}
    </Card>
  )
}

/** 받은 시각을 '10월 17일 15:20' 처럼 */
function formatFetchedAt(fetchedAt: number): string {
  const date = new Date(fetchedAt)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${hours}:${minutes}`
}
