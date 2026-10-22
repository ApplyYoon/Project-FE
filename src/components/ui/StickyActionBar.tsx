import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface StickyActionBarProps {
  /** 화면 아래 하단 탭(모바일)이 있는 화면이면 true. 탭 바로 위에 붙습니다. */
  aboveTabBar?: boolean
  children: ReactNode
  className?: string
}

/**
 * 긴 화면에서 1순위 버튼([다음] · [저장])을 화면 아래(엄지가 닿는 곳)에 붙여 둡니다. (피츠의 법칙)
 * 스크롤해도 버튼이 늘 보여서, 다 읽고 위로 다시 올라갈 필요가 없습니다.
 * PC(sm 이상)에서는 붙이지 않고 내용 끝에 그냥 놓습니다.
 *
 * <StickyActionBar><Button size="lg" className="w-full">다음</Button></StickyActionBar>
 */
export function StickyActionBar({
  aboveTabBar = false,
  children,
  className,
}: StickyActionBarProps) {
  return (
    <div
      className={cn(
        // -mx-4 px-4: 화면 양 끝까지 바탕을 깔아서 뒤로 지나가는 글자가 비치지 않게 합니다.
        'sticky z-10 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-slate-100 px-4 pt-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0',
        aboveTabBar
          ? // 하단 탭(h-14 + 아이폰 홈 막대 안전 영역) 바로 위에 붙습니다.
            'bottom-[calc(3.5rem+env(safe-area-inset-bottom))] pb-3 sm:pb-0'
          : // 아이폰 홈 막대에 가리지 않게 안전 영역만큼 아래를 비웁니다.
            'bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
