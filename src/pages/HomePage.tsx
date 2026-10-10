import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useToggle } from '@/hooks/useToggle'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [isDetailOpen, toggleDetail] = useToggle()

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">프로젝트 시작하기</h1>
        <p className="mt-2 text-slate-600">
          이 페이지는 예시입니다. <code className="rounded bg-slate-100 px-1">src/pages</code> 에
          여러분의 페이지를 만들어 보세요.
        </p>
      </section>

      {/* 아직 실제 홈 화면(#94 #85 #68 등)은 만들어지기 전이라, 체크인으로 갈 수 있는 버튼만 먼저 둡니다. (#24) */}
      <Card title="오늘 체크인" className="rounded-2xl">
        <p className="text-sm text-slate-600">
          전화를 못 받은 날은 여기서 컨디션·기분·오늘 예상 공부시간을 체크인해 주세요.
        </p>
        <Button className="mt-4 w-full sm:w-auto" onClick={() => navigate('/check')}>
          매일 체크인하러 가기
        </Button>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="버튼 컴포넌트">
          <div className="flex flex-wrap gap-2">
            <Button>기본</Button>
            <Button variant="secondary">보조</Button>
            <Button variant="ghost">고스트</Button>
            <Button variant="danger" size="sm">
              삭제
            </Button>
            <Button disabled>비활성</Button>
          </div>
        </Card>

        <Card title="입력 컴포넌트">
          <div className="flex flex-col gap-3">
            <Input
              name="nickname"
              label="닉네임"
              placeholder="닉네임을 입력하세요"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={name.length > 8 ? '8자 이하로 입력해 주세요.' : undefined}
            />
            <p className="text-sm text-slate-500">
              입력한 값: <span className="font-medium text-slate-900">{name || '(없음)'}</span>
            </p>
          </div>
        </Card>
      </section>

      <section>
        <Button variant="secondary" onClick={toggleDetail}>
          {isDetailOpen ? '접기' : '커스텀 훅 예시 펼치기'}
        </Button>

        {isDetailOpen && (
          <Card className="mt-3" title="useToggle">
            <p className="text-sm text-slate-600">
              반복되는 로직은 <code className="rounded bg-slate-100 px-1">src/hooks</code> 에 커스텀
              훅으로 빼두면 여러 컴포넌트에서 재사용할 수 있습니다.
            </p>
          </Card>
        )}
      </section>
    </div>
  )
}
