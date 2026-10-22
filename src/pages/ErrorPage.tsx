import { Button } from '@/components/ui/Button'

/**
 * 화면을 그리다가 에러가 났을 때 대신 보여주는 화면입니다. (router.tsx 의 errorElement)
 * 이 화면이 없으면 React Router 가 영어로 된 기본 에러 화면을 보여줍니다.
 *
 * 에러가 난 화면의 부품(헤더 · 하단 탭 등)을 여기서 다시 쓰면 같은 에러가 또 날 수 있습니다.
 * 그래서 버튼 말고는 아무것도 가져다 쓰지 않습니다.
 */
export function ErrorPage() {
  return (
    // min-h-screen: 모바일 주소창 높이가 바뀌어도 화면을 꽉 채웁니다.
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-[28px] font-bold tracking-tight">문제가 생겼어요</h1>
      <p className="max-w-prose text-[15px] break-keep text-slate-600">
        화면을 보여주다가 문제가 생겼어요. 새로고침하면 대부분 다시 돼요. 계속 그러면 선생님께 알려
        주세요.
      </p>
      {/* 1순위 [새로고침] 은 폭 전체 h-14, [홈으로] 는 낮은 버튼으로 둡니다. */}
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button size="lg" className="w-full sm:w-auto" onClick={() => window.location.reload()}>
          새로고침
        </Button>
        {/* assign: 주소를 바꾸면서 페이지를 새로 엽니다. (앱의 상태도 처음부터 다시 만들어집니다) */}
        <Button
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => window.location.assign('/')}
        >
          홈으로
        </Button>
      </div>
    </main>
  )
}
