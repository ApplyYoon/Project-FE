import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useStopwatch } from '@/hooks/useStopwatch'

// 초 단위 숫자를 '01:23:45' 형태로 바꿔줍니다.
function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (value: number) => value.toString().padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function TimerPage() {
  const { seconds, isRunning, start, pause, stop } = useStopwatch()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">타이머</h1>
        <p className="mt-2 text-slate-600">시작하면 1초마다 시간이 올라가요.</p>
      </div>

      <Card className="flex flex-col items-center gap-6 py-10">
        {isRunning && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            공부 중
          </span>
        )}

        {/* tabular-nums: 숫자가 바뀌어도 폭이 흔들리지 않게 고정 폭으로 보여줍니다. */}
        <p className="font-mono text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
          {formatTime(seconds)}
        </p>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {isRunning ? (
            <Button variant="secondary" size="lg" className="w-full sm:w-40" onClick={pause}>
              일시정지
            </Button>
          ) : (
            <Button size="lg" className="w-full sm:w-40" onClick={start}>
              시작
            </Button>
          )}
          <Button variant="danger" size="lg" className="w-full sm:w-40" onClick={stop}>
            정지
          </Button>
        </div>
      </Card>
    </div>
  )
}
