import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CareModeBanner } from '@/components/ui/CareModeBanner'
import { ExperimentSection } from '@/components/ui/ExperimentSection'
import { InsightCard } from '@/components/ui/InsightCard'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { usePlans } from '@/hooks/usePlans'
import { useToggle } from '@/hooks/useToggle'
import { cn } from '@/lib/cn'
import { groupSessionsByDate, isStudySession } from '@/lib/dailyRecords'
import { getDaySummary } from '@/lib/daySummary'
import { mockInsights, mockSessions } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import { getCareLimits } from '@/lib/careLimits'
import { getTodayCareLevel, getTodayCareReason } from '@/lib/todayCare'
import { getTreeState, type TreeState } from '@/lib/tree'
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

/** 저장해 둔 공부 기록을 불러옵니다. 없으면 빈 목록입니다. (기록 화면과 같은 방법) */
function loadSessions(): StudySession[] {
  const saved = loadData<unknown>('sessions', [])
  // 배열이 아니거나 모양이 틀린 기록은 걸러냅니다.
  return Array.isArray(saved) ? saved.filter(isStudySession) : []
}

/** 공부 기록으로 지금 나무 상태를 계산합니다. */
function calculateTree(): TreeState {
  const days = groupSessionsByDate(loadSessions())
  const totalStudyMinutes = days.reduce((sum, day) => sum + day.totalMinutes, 0)
  const today = days.find((day) => day.date === toDateKey(new Date()))

  return getTreeState({
    totalStudyMinutes,
    todayStudyMinutes: today?.totalMinutes ?? 0,
    careLevel: getTodayCareLevel(),
    // TODO(#82 #73 #87): 회고·인사이트·나 사용설명서가 아직 없어서 0 입니다. 생기면 실제 개수로 바꾸세요.
    reflectionCount: 0,
    insightCount: 0,
    manualItemCount: 0,
  })
}

export function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [isDetailOpen, toggleDetail] = useToggle()
  const [tree] = useState(calculateTree)
  // 오늘의 관리 강도와, 내가 정한 최대 한도입니다. 화면이 처음 그려질 때 한 번만 읽습니다. (#94)
  const [careLevel] = useState(getTodayCareLevel)
  const [maxCareLevel] = useState(() => getCareLimits().maxCareLevel)

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

      {/* 지금 관리 모드와 그 이유. 시안처럼 홈 맨 위에 둡니다. (#94) */}
      <CareModeBanner
        level={careLevel}
        reason={getTodayCareReason(careLevel)}
        maxLevel={maxCareLevel}
      />

      {/* 아직 실제 홈 화면이 만들어지기 전이라 나무 카드만 먼저 둡니다. PC 에서는 시안처럼 절반 너비입니다. (#68) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TreeCard tree={tree} />
      </section>

      {/* 아직 실제 홈 화면(#94 #68 #102 등)은 만들어지기 전이라, 체크인으로 가는 버튼만 먼저 둡니다. (#24) */}
      <Card title="오늘 체크인">
        <p className="text-sm text-slate-600">
          전화를 못 받은 날은 여기서 컨디션·기분·오늘 예상 공부시간을 체크인해 주세요.
        </p>
        <Button className="mt-4 w-full sm:w-auto" onClick={() => navigate('/check')}>
          매일 체크인하러 가기
        </Button>
      </Card>

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
              <InsightCard key={insight.id} insight={insight} sessions={sessions} />
            ))}
          </div>
        )}
      </section>

      {/* 도전 중인 실험의 진행 상황과, 끝난 실험의 결과·다음 행동 버튼 (#93) */}
      <section>
        <h2 className="text-lg font-bold text-slate-900">실험</h2>
        <ExperimentSection plans={allPlans} sessions={sessions} className="mt-3" />
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

interface TreeCardProps {
  tree: TreeState
}

/** "내 나무" 카드. 나무 그림 + 잎·열매 개수 + 다음 단계까지 남은 시간 */
function TreeCard({ tree }: TreeCardProps) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">내 나무</h3>
        <p className="text-sm text-slate-500">
          {tree.stageName} · {tree.stage + 1}단계
          {tree.isWilted && <span className="font-semibold text-amber-700"> · 시듦</span>}
        </p>
      </div>

      <div className="mt-3 flex justify-center rounded-lg bg-slate-50 px-4 py-3">
        <TreeDrawing tree={tree} />
      </div>

      {tree.isWilted && (
        <p className="mt-3 text-sm text-amber-700">
          나무가 조금 시들었어. 오늘 공부를 시작하면 바로 다시 살아나.
        </p>
      )}

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>
          <span className="font-semibold text-green-700">잎 {tree.leafCount}</span> · 회고·인사이트
        </span>
        <span>
          <span className="font-semibold text-orange-600">열매 {tree.fruitCount}</span> · 효과가
          확인된 방법
        </span>
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
          <span>다음 단계까지</span>
          <span>
            {tree.isFullGrown ? '다 자랐어!' : `${formatMinutes(tree.minutesToNextStage)} 남음`}
          </span>
        </div>
        <ProgressBar value={tree.progressPercent} />
      </div>
    </Card>
  )
}

// 큰 나무 위에 잎(작은 흰 점)과 열매(주황 동그라미)를 그릴 자리입니다. 개수가 많아도 이 자리까지만 그립니다.
const LEAF_SPOTS = [
  { x: 78, y: 52 },
  { x: 100, y: 34 },
  { x: 122, y: 50 },
  { x: 66, y: 68 },
  { x: 90, y: 60 },
  { x: 114, y: 66 },
  { x: 134, y: 70 },
  { x: 106, y: 44 },
]
const FRUIT_SPOTS = [
  { x: 118, y: 58 },
  { x: 84, y: 72 },
  { x: 100, y: 52 },
  { x: 130, y: 76 },
  { x: 70, y: 58 },
]

interface TreeDrawingProps {
  tree: TreeState
}

/** 나무 그림 (라이브러리 없이 SVG 를 직접 그립니다) */
function TreeDrawing({ tree }: TreeDrawingProps) {
  // 시들면 초록 잎이 누런 갈색으로 바뀝니다. transition-colors 로 색이 천천히 바뀝니다.
  const leafColor = tree.isWilted ? 'fill-amber-600' : 'fill-green-500'
  const darkLeafColor = tree.isWilted ? 'fill-amber-700' : 'fill-green-700'
  const label = `${tree.stageName}${tree.isWilted ? ', 시든 모습' : ''}`

  // 큰 나무가 되어야 잎·열매 점을 그립니다. (씨앗·새싹에는 붙일 자리가 없어서 개수 글자로만 보여줍니다)
  const leafSpots = tree.stage === 3 ? LEAF_SPOTS.slice(0, tree.leafCount) : []
  const fruitSpots = tree.stage === 3 ? FRUIT_SPOTS.slice(0, tree.fruitCount) : []

  return (
    <svg role="img" aria-label={label} viewBox="0 0 200 140" className="h-36 w-full max-w-full">
      {/* 땅 그림자 */}
      <ellipse cx="100" cy="128" rx="60" ry="6" className="fill-slate-200" />

      {/*
        key 가 단계마다 달라서, 단계가 바뀌면 이 묶음이 새로 그려집니다.
        starting: 는 "처음 나타날 때의 모습" 이라, 작고 투명한 상태에서 transition 으로 커지며 나타납니다.
      */}
      <g
        key={tree.stage}
        className="origin-bottom transition duration-700 ease-out [transform-box:fill-box] starting:scale-50 starting:opacity-0"
      >
        {tree.stage === 0 && <ellipse cx="100" cy="122" rx="9" ry="6" className="fill-amber-800" />}

        {tree.stage === 1 && (
          <>
            <rect x="98" y="96" width="4" height="30" rx="2" className="fill-green-800" />
            <ellipse
              cx="88"
              cy="96"
              rx="12"
              ry="6"
              className={cn('transition-colors duration-700', leafColor)}
            />
            <ellipse
              cx="112"
              cy="90"
              rx="12"
              ry="6"
              className={cn('transition-colors duration-700', darkLeafColor)}
            />
          </>
        )}

        {tree.stage === 2 && (
          <>
            <rect x="95" y="80" width="10" height="46" rx="3" className="fill-amber-800" />
            <circle
              cx="100"
              cy="64"
              r="30"
              className={cn('transition-colors duration-700', leafColor)}
            />
          </>
        )}

        {tree.stage === 3 && (
          <>
            <rect x="92" y="76" width="16" height="50" rx="4" className="fill-amber-800" />
            <circle
              cx="74"
              cy="64"
              r="26"
              className={cn('transition-colors duration-700', leafColor)}
            />
            <circle
              cx="126"
              cy="64"
              r="26"
              className={cn('transition-colors duration-700', darkLeafColor)}
            />
            <circle
              cx="100"
              cy="46"
              r="30"
              className={cn('transition-colors duration-700', leafColor)}
            />
            {leafSpots.map((spot) => (
              <ellipse
                key={`leaf-${spot.x}-${spot.y}`}
                cx={spot.x}
                cy={spot.y}
                rx="5"
                ry="3"
                className="fill-white/70"
              />
            ))}
            {fruitSpots.map((spot) => (
              <circle
                key={`fruit-${spot.x}-${spot.y}`}
                cx={spot.x}
                cy={spot.y}
                r="5"
                className="fill-orange-500"
              />
            ))}
          </>
        )}
      </g>
    </svg>
  )
}
