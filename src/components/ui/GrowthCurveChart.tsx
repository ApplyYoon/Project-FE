import { EXTRA_MINUTES_PER_DAY, type GrowthCurve } from '@/lib/growthCurve'

interface GrowthCurveChartProps {
  /** getGrowthCurve() 의 결과. hasEnoughData 가 true 일 때만 그립니다. */
  curve: GrowthCurve
  /** 시험일 자리에 보여줄 이름 (예: '수능') */
  examLabel: string
  className?: string
}

// SVG 좌표계 크기. viewBox 로 정해서, 실제 화면 크기는 CSS(w-full)가 정합니다.
const VIEW_WIDTH = 600
const VIEW_HEIGHT = 220
const PADDING_X = 8
const PADDING_TOP = 12
const PADDING_BOTTOM = 28

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

/**
 * "예상 성장 곡선"을 SVG 선 그래프로 그립니다. 차트 라이브러리를 쓰지 않습니다. (#71)
 *
 * viewBox 와 w-full 을 같이 써서, 화면이 좁아져도 그래프가 줄어들 뿐 가로 스크롤이 생기지 않습니다.
 */
export function GrowthCurveChart({ curve, examLabel, className }: GrowthCurveChartProps) {
  const firstDateKey = curve.actual[0].date
  const examDateKey = curve.currentPace[curve.currentPace.length - 1].date
  // 그래프 가로축 전체 길이(일). 0이 되면 나눗셈이 깨지니 최소 1로 둡니다.
  const totalSpanDays = Math.max(1, countDays(firstDateKey, examDateKey) - 1)

  function xFor(dateKey: string): number {
    const dayOffset = countDays(firstDateKey, dateKey) - 1
    return PADDING_X + (dayOffset / totalSpanDays) * (VIEW_WIDTH - PADDING_X * 2)
  }

  const maxMinutes = Math.max(curve.currentPaceTotalMinutes, curve.withExtraTotalMinutes, 1)

  function yFor(minutes: number): number {
    const usableHeight = VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM
    return VIEW_HEIGHT - PADDING_BOTTOM - (minutes / maxMinutes) * usableHeight
  }

  const actualPoints = curve.actual
    .map((point) => `${xFor(point.date)},${yFor(point.cumulativeMinutes)}`)
    .join(' ')
  const paceToday = curve.currentPace[0]
  const paceEnd = curve.currentPace[1]
  const extraEnd = curve.withExtra[1]

  // x축 글자("오늘", 시험 이름)는 그래프 밖에 보통 글자로 둡니다.
  // SVG 안에 넣으면 휴대폰에서 그래프와 같이 줄어들어서 글자가 절반 크기가 됩니다.
  // "오늘" 글자를 놓을 자리: 그래프 왼쪽 끝에서 몇 % 인지
  const todayPercent = (xFor(paceToday.date) / VIEW_WIDTH) * 100
  // 오늘이 시험 날에 가까우면(오른쪽 20% 안) 두 글자가 겹쳐서, "오늘 · 시험 이름" 하나로 합칩니다.
  const isTodayNearExam = todayPercent > 80

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`지금까지 누적 ${curve.actual[curve.actual.length - 1].cumulativeMinutes}분, 지금 페이스면 ${examLabel}까지 ${curve.currentPaceTotalMinutes}분, 하루 ${EXTRA_MINUTES_PER_DAY}분 더하면 ${curve.withExtraTotalMinutes}분`}
      >
        {/* 지금까지 (실선) */}
        <polyline points={actualPoints} fill="none" className="stroke-brand" strokeWidth={3} />

        {/* 지금 페이스 (점선, 지금까지와 같은 색) */}
        <line
          x1={xFor(paceToday.date)}
          y1={yFor(paceToday.cumulativeMinutes)}
          x2={xFor(paceEnd.date)}
          y2={yFor(paceEnd.cumulativeMinutes)}
          className="stroke-brand"
          strokeWidth={2.5}
          strokeDasharray="6 5"
        />

        {/* 하루 20분 더 (점선, 다른 색) */}
        <line
          x1={xFor(paceToday.date)}
          y1={yFor(paceToday.cumulativeMinutes)}
          x2={xFor(extraEnd.date)}
          y2={yFor(extraEnd.cumulativeMinutes)}
          className="stroke-amber-500"
          strokeWidth={2.5}
          strokeDasharray="6 5"
        />

        {/* 오늘 지점 표시 */}
        <circle
          cx={xFor(paceToday.date)}
          cy={yFor(paceToday.cumulativeMinutes)}
          r={5}
          className="fill-brand"
        />

        {/* x축 기준선 (글자는 그래프 아래에 따로 둡니다) */}
        <line
          x1={PADDING_X}
          y1={VIEW_HEIGHT - PADDING_BOTTOM}
          x2={VIEW_WIDTH - PADDING_X}
          y2={VIEW_HEIGHT - PADDING_BOTTOM}
          className="stroke-slate-200"
          strokeWidth={1}
        />
      </svg>

      {/* x축 글자. relative + absolute 로 "오늘" 을 그래프의 오늘 자리 아래에 맞춥니다. */}
      <div className="relative h-5 text-xs text-slate-500">
        {!isTodayNearExam && (
          // 놓을 자리(left)가 날짜에 따라 바뀌는 숫자라 Tailwind 클래스로 만들 수 없어서 style 을 씁니다.
          <span className="absolute -translate-x-1/2" style={{ left: `${todayPercent}%` }}>
            오늘
          </span>
        )}
        {/* max-w-[60%] + truncate: 시험 이름이 길어도 "오늘" 글자를 덮지 않게 합니다. */}
        <span className="absolute right-0 max-w-[60%] truncate">
          {isTodayNearExam ? `오늘 · ${examLabel}` : examLabel}
        </span>
      </div>

      {/* 범례 */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="bg-brand h-0.5 w-4" aria-hidden /> 지금까지
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-brand h-0 w-4 border-t-2 border-dashed" aria-hidden />
          지금 페이스
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-amber-500" aria-hidden /> 하루{' '}
          {EXTRA_MINUTES_PER_DAY}분 더
        </span>
      </div>
    </div>
  )
}
