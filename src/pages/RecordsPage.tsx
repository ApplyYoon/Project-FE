import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { loadData } from '@/lib/storage'
import { useNavigate } from 'react-router-dom'

export function RecordsPage() {
  const navigate = useNavigate()
  // 설정 화면에서 켠 사람에게만 일기 메뉴를 보여줍니다. (#63)
  const isDiaryEnabled = loadData('diary-enabled', false)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">기록·통계</h1>

      {isDiaryEnabled && (
        <Card title="일기">
          <p className="text-sm text-slate-600">원할 때만 쓰는 자유 일기예요.</p>
          <Button className="mt-4 w-full sm:w-auto" onClick={() => navigate('/diary')}>
            일기 쓰러 가기
          </Button>
        </Card>
      )}

      {/* 여기에 내용 */}
    </div>
  )
}
