import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToggle } from '@/hooks/useToggle'
import { cn } from '@/lib/cn'
import { formatMinutes, groupSessionsByDate, isStudySession, toDateKey } from '@/lib/dailyRecords'
import { loadData } from '@/lib/storage'
import { getTodayCareLevel } from '@/lib/todayCare'
import { getTreeState, type TreeState } from '@/lib/tree'
import type { StudySession } from '@/types'
import { useState } from 'react'

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
  const [name, setName] = useState('')
  const [isDetailOpen, toggleDetail] = useToggle()
  const [tree] = useState(calculateTree)

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">프로젝트 시작하기</h1>
        <p className="mt-2 text-slate-600">
          이 페이지는 예시입니다. <code className="rounded bg-slate-100 px-1">src/pages</code> 에
          여러분의 페이지를 만들어 보세요.
        </p>
      </section>

      {/* 아직 실제 홈 화면이 만들어지기 전이라 나무 카드만 먼저 둡니다. PC 에서는 시안처럼 절반 너비입니다. (#68) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TreeCard tree={tree} />
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
