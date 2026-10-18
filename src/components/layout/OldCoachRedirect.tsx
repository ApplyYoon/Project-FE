import { RedirectWithQuery } from '@/components/layout/RedirectWithQuery'
import { COACH_PATH, PLAN_CHAT_PATH } from '@/lib/chatRooms'
import { useLocation } from 'react-router-dom'

/**
 * 예전 코치 주소(/coach · /counsel · /counsel/chat)로 오면 새 대화방으로 넘깁니다. (2026-10-18 대화방 3개, #582)
 * 이미 예약된 휴대폰 알림 · 즐겨찾기가 예전 주소를 열 수 있어서 남겨 둡니다. 주소 뒤의 값(?nudge= 등)은 그대로 가져갑니다.
 *
 *   /coach?plan=today      -> /chat/plan?plan=today   (계획 이야기는 계획 방)
 *   /coach?nudge=evening   -> /chat/counsel?nudge=evening   (알림 첫 말은 상담 방. 그 안의 [내일 계획 짜 줘] 가 계획 방으로 넘김)
 *   /counsel               -> /chat/counsel
 */
export function OldCoachRedirect() {
  const { search } = useLocation()
  const to = new URLSearchParams(search).has('plan') ? PLAN_CHAT_PATH : COACH_PATH
  return <RedirectWithQuery to={to} />
}
