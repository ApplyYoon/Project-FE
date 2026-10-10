import { Button } from '@/components/ui/Button'
import { useNavigate } from 'react-router-dom'

/**
 * 통화 중 화면 자리입니다. (실제 화면은 #31 에서 만듭니다)
 * 지금은 전화 받기 버튼이 잘 넘어오는지 확인하는 용도입니다.
 */
export function CallActivePage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 px-4 text-white">
      <h1 className="text-2xl font-bold sm:text-3xl">통화 중</h1>
      <p className="text-indigo-100">통화 화면은 #31 에서 만들어요.</p>
      <Button variant="danger" onClick={() => navigate('/')}>
        끊기
      </Button>
    </div>
  )
}
