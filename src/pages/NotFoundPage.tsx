import { Button } from '@/components/ui/Button'
import { useNavigate } from 'react-router-dom'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-brand text-5xl font-bold sm:text-6xl">404</p>
      <h1 className="text-xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="text-slate-600">주소가 올바른지 확인해 주세요.</p>
      <Button onClick={() => navigate('/')}>홈으로 가기</Button>
    </div>
  )
}
