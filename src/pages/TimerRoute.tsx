import { lazy, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadData } from '@/lib/storage'

const TimerPage = lazy(() => import('@/pages/TimerPage').then((m) => ({ default: m.TimerPage })))
const CardTimerPage = lazy(() =>
  import('@/pages/CardTimerPage').then((m) => ({ default: m.CardTimerPage })),
)

/** 옛 타이머(useStopwatch)가 아직 흐르고 있는지. 저장 키 'study-timer' 의 startedAt 으로 봅니다 */
function isLegacyTimerStarted(): boolean {
  const saved = loadData<{ startedAt?: unknown } | null>('timer', null)
  return typeof saved?.startedAt === 'number'
}

/**
 * /timer 주소에 어느 타이머를 보여 줄지 고릅니다. (#395)
 * - 카드 타이머(CardTimerPage)가 기본입니다. (최종 기획서 「4.4 타이머」)
 * - 옛 홈·계획 화면이 `?plan=계획id` 로 여는 타이머와, 이미 흐르고 있는 옛 타이머는 옛 화면(TimerPage)으로 엽니다.
 *   홈(#405)·카드 탭(#394)이 카드로 바뀌면 옛 타이머와 이 파일을 지웁니다.
 * 어느 쪽인지는 화면을 처음 열 때 한 번만 정합니다. 옛 타이머는 시작하면서 주소의 ?plan= 을 지우는데,
 * 그때마다 다시 고르면 하던 옛 타이머가 새 타이머로 바뀌어 버리기 때문입니다.
 */
export function TimerRoute() {
  const [searchParams] = useSearchParams()
  const [isLegacy] = useState(() => searchParams.has('plan') || isLegacyTimerStarted())
  return isLegacy ? <TimerPage /> : <CardTimerPage />
}
