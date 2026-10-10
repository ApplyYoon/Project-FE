import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { InsightCard } from '@/components/ui/InsightCard'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { usePlans } from '@/hooks/usePlans'
import { useToggle } from '@/hooks/useToggle'
import { getDaySummary } from '@/lib/daySummary'
import { mockInsights, mockSessions } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import type { StudySession } from '@/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// 며칠 동안 기록이 쌓여야 첫 리포트를 보여줄지 (#85)
const FIRST_REPORT_DAYS = 14

/** Date 를 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString() 은 영국 시간 기준이라 쓰지 않습니다) */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' 날짜에서 days 일 만큼 이동한 날짜를 돌려줍니다. */
function moveDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return toDateKey(new Date(year, month - 1, day + days))
}

/** fromKey 부터 toKey 까지 며칠째인지 셉니다. (같은 날이면 1일째) */
function countDays(fromKey: string, toKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromKey.split('-').map(Number)
  const [toYear, toMonth, toDay] = toKey.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  const diffMs =
    new Date(toYear, toMonth - 1, toDay).getTime() -
    new Date(fromYear, fromMonth - 1, fromDay).getTime()
  return Math.round(diffMs / msPerDay) + 1
}

/** 분을 "3시간 10분" 처럼 보여줍니다. 60분 미만이면 "분"만 보여줍니다. */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

export function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [isDetailOpen, toggleDetail] = useToggle()

  const { allPlans } = usePlans()
  // 타이머가 저장해 둔 공부 기록을 불러옵니다. 없으면 가짜 데이터를 씁니다. (#20 이 아직 머지 전입니다)
  const [sessions] = useState<StudySession[]>(() => loadData('sessions', mockSessions))

  const todayKey = toDateKey(new Date())
  const yesterdayKey = moveDateKey(todayKey, -1)

  // 첫 기록 날짜 = 계획과 공부 기록을 통틀어 가장 이른 날짜. 기록이 하나도 없으면 null 입니다.
  const recordDates = [
    ...allPlans.map((plan) => plan.date),
    ...sessions.map((session) => toDateKey(new Date(session.startedAt))),
  ]
  const firstRecordKey = recordDates.length === 0 ? null : [...recordDates].sort()[0]
  const daysSinceFirstRecord = firstRecordKey === null ? 0 : countDays(firstRecordKey, todayKey)
  const isFirstReportReady = firstRecordKey !== null && daysSinceFirstRecord >= FIRST_REPORT_DAYS

  const yesterdaySummary = getDaySummary(yesterdayKey, allPlans, sessions)
  const hasYesterdayRecord = yesterdaySummary.studyMinutes > 0

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">프로젝트 시작하기</h1>
        <p className="mt-2 text-slate-600">
          이 페이지는 예시입니다. <code className="rounded bg-slate-100 px-1">src/pages</code> 에
          여러분의 페이지를 만들어 보세요.
        </p>
      </section>

      {/* 아직 실제 홈 화면(#94 #68 #102 등)은 만들어지기 전이라, 어제 한 줄·카운트다운(#85)만 먼저 둡니다. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="어제 한 줄">
          {hasYesterdayRecord ? (
            <p className="text-base font-semibold text-slate-900">
              어제 순공 {formatMinutes(yesterdaySummary.studyMinutes)}, 계획의{' '}
              {yesterdaySummary.achievementRate}%야.
            </p>
          ) : (
            <p className="text-base font-semibold text-slate-900">오늘부터 시작해 볼까?</p>
          )}
        </Card>

        <Card title="첫 리포트까지">
          {firstRecordKey === null ? (
            <p className="text-sm text-slate-500">
              기록을 시작하면 첫 리포트까지 며칠 남았는지 세어줄게요.
            </p>
          ) : isFirstReportReady ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-600">{FIRST_REPORT_DAYS}일치 기록이 다 쌓였어요!</p>
              <Button onClick={() => navigate('/report')}>첫 리포트 보기</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-slate-900">
                  첫 리포트까지 D-{FIRST_REPORT_DAYS - daysSinceFirstRecord}
                </p>
                <p className="shrink-0 text-sm text-slate-500">
                  {daysSinceFirstRecord} / {FIRST_REPORT_DAYS}일
                </p>
              </div>
              <ProgressBar value={(daysSinceFirstRecord / FIRST_REPORT_DAYS) * 100} />
              <p className="text-sm text-slate-500">
                {FIRST_REPORT_DAYS}일 동안 기록이 쌓이면 나만의 패턴을 알려줄게.
              </p>
            </div>
          )}
        </Card>
      </section>

      {/* 아직 실제 홈 화면(#94 #68 #102 등)은 만들어지기 전이라, 인사이트 카드만 먼저 둡니다. (#73) */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">이번 주 발견</h2>
        {mockInsights.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            아직 데이터가 모자라요. 기록이 쌓이면 발견이 생겨요.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mockInsights.slice(0, 2).map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="버튼 컴포넌트">
          <div className="flex flex-wrap gap-2">
            <Button>기본</Button>
            <Button variant="secondary">보조</Button>
            <Button variant="ghost">고스트</Button>
            <Button variant="danger" size="sm">
              삭제
            </Button>
            <Button disabled>비활성</Button>
          </div>
        </Card>

        <Card title="입력 컴포넌트">
          <div className="flex flex-col gap-3">
            <Input
              name="nickname"
              label="닉네임"
              placeholder="닉네임을 입력하세요"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={name.length > 8 ? '8자 이하로 입력해 주세요.' : undefined}
            />
            <p className="text-sm text-slate-500">
              입력한 값: <span className="font-medium text-slate-900">{name || '(없음)'}</span>
            </p>
          </div>
        </Card>
      </section>

      <section>
        <Button variant="secondary" onClick={toggleDetail}>
          {isDetailOpen ? '접기' : '커스텀 훅 예시 펼치기'}
        </Button>

        {isDetailOpen && (
          <Card className="mt-3" title="useToggle">
            <p className="text-sm text-slate-600">
              반복되는 로직은 <code className="rounded bg-slate-100 px-1">src/hooks</code> 에 커스텀
              훅으로 빼두면 여러 컴포넌트에서 재사용할 수 있습니다.
            </p>
          </Card>
        )}
      </section>
    </div>
  )
}
