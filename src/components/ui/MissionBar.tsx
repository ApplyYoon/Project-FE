import { cn } from '@/lib/cn'
import { countDoneMissions, nextMission, type Mission } from '@/lib/dailyMission'

interface MissionBarProps {
  missions: Mission[]
  /** 누르면 할 일. 코치 화면은 코치가 미션을 말풍선으로 보여 주고, 홈은 코치 화면으로 갑니다. */
  onOpen: () => void
  className?: string
}

/**
 * "오늘의 미션" 한 줄. 몇 개 끝냈는지와 다음 미션 이름을 보여 줍니다. (lib/dailyMission.ts)
 * 홈 맨 위와 코치 화면 맨 위가 같이 씁니다. (2026-10-18)
 * 자리를 덜 차지하려고 한 줄(높이 56px)로만 둡니다.
 */
export function MissionBar({ missions, onOpen, className }: MissionBarProps) {
  const done = countDoneMissions(missions)
  const next = nextMission(missions)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`오늘의 미션 ${missions.length}개 중 ${done}개 끝. 눌러서 코치에게 보기`}
      className={cn(
        'flex min-h-14 w-full shrink-0 cursor-pointer items-center gap-3 rounded-3xl bg-white px-4 py-2 text-left transition-transform active:scale-[0.99]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          next ? 'bg-brand-light text-brand' : 'bg-emerald-50 text-emerald-700',
        )}
      >
        {done}/{missions.length}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500">오늘의 미션</span>
        <span className="block truncate text-[15px] font-semibold text-slate-900">
          {next ? next.title : '오늘 미션 다 끝냈어요 👏'}
        </span>
      </span>
      <span aria-hidden className="text-slate-400">
        ›
      </span>
    </button>
  )
}
