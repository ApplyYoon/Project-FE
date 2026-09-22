import { Card } from '@/components/ui/Card'

const stack = [
  { name: 'React 19', description: '화면을 컴포넌트 단위로 만드는 라이브러리' },
  { name: 'TypeScript', description: '자바스크립트에 타입을 더해 실수를 미리 잡아줍니다' },
  { name: 'Vite', description: '아주 빠른 개발 서버와 빌드 도구' },
  { name: 'Tailwind CSS v4', description: '클래스 이름으로 스타일을 입히는 CSS 프레임워크' },
  { name: 'React Router', description: '주소(URL)에 따라 다른 페이지를 보여줍니다' },
]

export function AboutPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">기술 스택</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stack.map((item) => (
          <Card key={item.name} title={item.name}>
            <p className="text-sm text-slate-600">{item.description}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
