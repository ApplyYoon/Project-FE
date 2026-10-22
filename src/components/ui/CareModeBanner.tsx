import { cn } from '@/lib/cn'
import { careLevelInfos, getCareLevelInfo } from '@/lib/careLevelInfo'
import type { CareLevel } from '@/types'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

interface CareModeBannerProps {
  /** 오늘의 관리 강도 (0~4) */
  level: CareLevel
  /** 왜 지금 이 모드인지 한 줄로 알려 주는 이유 */
  reason: string
  /** 내가 정한 관리 강도 최대 한도 (#59). 이 단계보다 센 강도는 쓰이지 않습니다. */
  maxLevel: CareLevel
  className?: string
}

/**
 * 홈 위쪽에 "지금 관리 모드" 와 그 이유를 한 줄로 보여줍니다. (#94, 기획서 v2 5장)
 * 원칙: 왜 지금 이 모드인지 항상 말해준다. (이유 없이 혼나면 앱을 지웁니다)
 *
 * "내 한도 보기" 를 누르면 0~4 단계 설명과, 지금 단계·내가 정한 최대 한도가 펼쳐집니다.
 *
 * <CareModeBanner level={2} reason="최근 3일 중 2일을 폰 때문에 놓쳤어." maxLevel={3} />
 */
export function CareModeBanner({ level, reason, maxLevel, className }: CareModeBannerProps) {
  const detailId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const info = getCareLevelInfo(level)

  return (
    <section
      aria-label="지금 관리 모드"
      // 바탕색이 곧 관리 단계(회복 초록 ~ 강제 빨강)를 알려 주는 정보라 그대로 둡니다. 모서리만 다른 묶음과 맞춥니다. (2026-10-22)
      className={cn('rounded-2xl border p-4 sm:p-5', info.panelClass, className)}
    >
      {/* 모바일은 이름표 → 이유 순서로 쌓고, PC(sm 이상)는 한 줄로 나란히 놓습니다. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span
          className={cn(
            'inline-flex w-fit shrink-0 rounded-full px-3 py-1 text-sm font-bold',
            info.badgeClass,
          )}
        >
          {info.name} 모드 · {info.level}단계
        </span>
        <p className="min-w-0 text-sm break-words text-slate-700">{reason}</p>
      </div>

      {/* h-11 = 44px: 손가락으로 누르기 쉬운 높이 */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={detailId}
        onClick={() => setIsOpen((prev) => !prev)}
        className="mt-1 inline-flex h-11 cursor-pointer items-center text-sm font-medium text-slate-600 underline underline-offset-4"
      >
        {isOpen ? '내 한도 닫기' : '내 한도 보기'}
      </button>

      {isOpen && (
        <div id={detailId} className="mt-1 flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {careLevelInfos.map((item) => {
              const isCurrent = item.level === level
              // 내가 정한 최대 한도보다 센 단계는 "쓰이지 않는 단계" 라서 흐리게 보여줍니다.
              const isOverLimit = item.level > maxLevel
              return (
                <li
                  key={item.level}
                  className={cn(
                    'rounded-xl border bg-white px-3 py-2',
                    isCurrent ? 'border-brand ring-brand/30 ring-2' : 'border-slate-200',
                    isOverLimit && 'opacity-50',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-slate-900">
                      {item.level} {item.name}
                    </span>
                    {isCurrent && (
                      <span className="bg-now rounded-full px-2 py-0.5 text-xs font-bold text-slate-900">
                        지금
                      </span>
                    )}
                    {item.level === maxLevel && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        내 최대 한도
                      </span>
                    )}
                    {isOverLimit && (
                      <span className="text-xs text-slate-500">한도 밖이라 쓰이지 않아요</span>
                    )}
                  </div>
                  <p className="text-sm break-words text-slate-600">{item.description}</p>
                </li>
              )
            })}
          </ul>

          <p className="text-sm text-slate-600">
            내가 정한 최대 한도는 {maxLevel}단계예요. 정한 한도는 AI 가 절대 넘지 않아요.{' '}
            <Link to="/settings" className="text-brand font-medium underline">
              설정에서 바꾸기
            </Link>
          </p>
        </div>
      )}
    </section>
  )
}
