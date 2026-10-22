import { Button } from '@/components/ui/Button'
import { useNavigate } from 'react-router-dom'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-20 text-center">
      <p className="text-5xl font-bold text-slate-300 tabular-nums sm:text-6xl">404</p>
      <h1 className="text-[28px] leading-tight font-bold break-keep">페이지를 찾을 수 없어요</h1>
      <p className="text-[15px] break-keep text-slate-600">주소가 올바른지 확인해 주세요.</p>
      {/* 빈 화면은 행동으로: 갈 곳 하나를 크게 둡니다. */}
      <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate('/')}>
        홈으로 가기
      </Button>
    </div>
  )
}
