import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { mockSessions } from '@/lib/mock'
import { loadData } from '@/lib/storage'
import { getStudyStreak, hasStudiedToday } from '@/lib/streak'
import type { StudySession } from '@/types'

export function RecordsPage() {
  // 타이머가 저장해 둔 공부 기록을 불러옵니다. 없으면 가짜 데이터를 씁니다.
  const [sessions] = useState<StudySession[]>(() => loadData('sessions', mockSessions))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">기록·통계</h1>
      {/* 모바일은 한 줄에 하나, PC 는 두 칸으로 카드를 놓습니다. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StreakCard sessions={sessions} />
      </div>
    </div>
  )
}

interface StreakCardProps {
  sessions: StudySession[]
}

/** "🔥 5일째 연속 공부 중" 을 보여주는 카드 */
function StreakCard({ sessions }: StreakCardProps) {
  const streak = getStudyStreak(sessions)
  const studiedToday = hasStudiedToday(sessions)

  // 상황에 따라 아래 작은 글씨를 바꿉니다.
  let message = '오늘 공부하면 1일째가 돼요'
  if (streak > 0 && studiedToday) {
    message = '오늘도 공부 완료! 내일도 이어가요'
  } else if (streak > 0) {
    message = `오늘도 하면 ${streak + 1}일째`
  }

  return (
    <Card className="flex items-center gap-4">
      <div
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-2xl"
      >
        🔥
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 sm:text-2xl">
          {streak > 0 ? `${streak}일째 연속 공부 중` : '아직 연속 기록이 없어요'}
        </p>
        <p className="mt-1 text-sm text-slate-500">{message}</p>
      </div>
    </Card>
  )
}
