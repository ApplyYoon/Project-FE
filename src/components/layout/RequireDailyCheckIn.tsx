import { PlainLayout } from '@/components/layout/PlainLayout'
import { DailyCheckInScreen } from '@/components/ui/DailyCheckInScreen'
import { useAuth } from '@/hooks/useAuth'
import { isPublicPath } from '@/lib/authRedirect'
import { getTodayKey } from '@/lib/date'
import { hasCheckIn, saveQuickCheckIn } from '@/lib/quickCheckIn'
import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface RequireDailyCheckInProps {
  children: ReactNode
}

/**
 * 하루에 한 번, 체크인을 해야 앱에 들어가게 하는 문지기입니다. (#242 · router.tsx 에서 Layout 을 감쌉니다)
 *
 *   로그인 안 했다             -> 그대로 보여줍니다.
 *   로그인하러 가는 주소(/login 등) -> 그대로 보여줍니다. 로그인 화면이 로그인 뒤에 갈 곳으로 보내는 일을 막지 않으려는 것입니다.
 *   오늘 체크인을 이미 했다     -> 그대로 보여줍니다.
 *   오늘 체크인을 아직 안 했다   -> 메뉴 없이 "오늘 기분은 어때요?" 화면만 보여줍니다. 하나를 누르면 들어갑니다.
 *
 * 온보딩·전화·도움 안내처럼 Layout 밖에 있는 화면은 이 문지기를 거치지 않습니다.
 */
export function RequireDailyCheckIn({ children }: RequireDailyCheckInProps) {
  const { isLoggedIn } = useAuth()
  // useLocation 을 쓰면 주소가 바뀔 때마다 이 컴포넌트가 다시 그려집니다.
  // 앱을 켜 둔 채 날이 바뀌어도(새벽 4시), 다음에 화면을 옮길 때 "오늘 체크인" 을 다시 확인하게 됩니다.
  const { pathname } = useLocation()

  // 방금 이 화면에서 체크인한 날짜. 저장소(localStorage)가 바뀐 것은 React 가 몰라서,
  // 이 값을 바꿔 화면을 다시 그리게 합니다. (저장소를 쓸 수 없는 브라우저에서도 이 화면에 갇히지 않습니다)
  const [checkedDate, setCheckedDate] = useState<string | null>(null)

  // 오늘 날짜. 하루는 새벽 4시에 시작합니다. (lib/date.ts · 체크인 화면과 같은 기준이어야 같은 날로 저장됩니다)
  const todayKey = getTodayKey()
  // 체크인 화면(/check)에서 저장한 것도 바로 알 수 있게, 저장소를 그때그때 읽습니다.
  const isCheckedInToday = checkedDate === todayKey || hasCheckIn(todayKey)

  function handleSelectMood(mood: number) {
    saveQuickCheckIn(mood)
    setCheckedDate(todayKey)
  }

  if (!isLoggedIn || isPublicPath(pathname) || isCheckedInToday) {
    return <>{children}</>
  }

  return (
    <PlainLayout>
      <DailyCheckInScreen onSelect={handleSelectMood} />
    </PlainLayout>
  )
}
