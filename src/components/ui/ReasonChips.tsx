import { cn } from '@/lib/cn'

interface ReasonChipsProps<K extends string> {
  /** 보여 줄 이유들 (순서대로 보입니다) */
  options: { key: K; label: string }[]
  /** 지금 고른 것들 */
  selected: K[]
  /** 칩 하나를 눌렀을 때. 고르기 · 빼기는 쓰는 쪽에서 정합니다 (보통 lib/reasons.ts 의 toggleReason) */
  onToggle: (key: K) => void
  /** 화면 읽기 프로그램이 읽을 묶음 이름 (예: '못 한 원인') */
  label: string
  className?: string
}

/**
 * 이유를 **여러 개** 고르는 칩 묶음입니다. 고른 칩은 색이 들어옵니다. (2026-10-18 "이유 복수 선택")
 * 일시정지 이유 · 다 못 한 이유 · 잘 된 이유 · 카드 실패 원인에서 같이 씁니다.
 * 모바일에서도 두 줄로 나란히 놓이고, 누르는 곳은 40px(h-10) 입니다.
 *
 *   <ReasonChips options={CARD_FAIL_CAUSES} selected={causes} onToggle={handleToggle} label="못 한 원인" />
 */
export function ReasonChips<K extends string>({
  options,
  selected,
  onToggle,
  label,
  className,
}: ReasonChipsProps<K>) {
  return (
    <div role="group" aria-label={label} className={cn('grid grid-cols-2 gap-2', className)}>
      {options.map((item) => {
        const isOn = selected.includes(item.key)
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(item.key)}
            className={cn(
              'h-10 cursor-pointer rounded-lg border px-2 text-sm break-keep',
              isOn
                ? 'border-brand bg-brand/10 text-brand font-semibold'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {isOn ? `✓ ${item.label}` : item.label}
          </button>
        )
      })}
    </div>
  )
}
