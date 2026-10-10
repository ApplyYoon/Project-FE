import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { DAILY_COUNT_OPTIONS, type MessageSettings } from '@/lib/messageSettings'

interface MessageSettingsFieldsProps {
  /** 지금 설정 값 */
  value: MessageSettings
  /** 값을 바꿀 때마다 새 설정 전체를 알려줍니다. 저장은 쓰는 쪽(설정 화면·온보딩)에서 합니다. */
  onChange: (value: MessageSettings) => void
  className?: string
}

/**
 * AI 메시지를 하루 몇 번 받을지, 언제는 연락하지 말지 고르는 입력칸 묶음입니다.
 * 설정 화면과 온보딩 "관리 설정" 단계에서 같이 씁니다.
 *
 * <MessageSettingsFields value={settings} onChange={handleChange} />
 */
export function MessageSettingsFields({ value, onChange, className }: MessageSettingsFieldsProps) {
  const isOff = value.dailyCount === 0

  function handleChangeTime(field: 'quietStart' | 'quietEnd', time: string) {
    // 시각 칸을 지우면 빈 글자가 옵니다. 연락 금지 시간은 비워 둘 수 없어서 바꾸지 않습니다.
    if (time === '') return
    onChange({ ...value, [field]: time })
  }

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">하루 메시지 횟수</span>
        {/* 375px 에서도 6개가 한 줄에 들어가고, 버튼 하나가 40px 보다 넓습니다. */}
        <div role="group" aria-label="하루 메시지 횟수" className="grid grid-cols-6 gap-2">
          {DAILY_COUNT_OPTIONS.map((count) => {
            const isSelected = count === value.dailyCount
            return (
              <button
                key={count}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onChange({ ...value, dailyCount: count })}
                className={cn(
                  'h-10 cursor-pointer rounded-lg border text-sm font-medium transition-colors',
                  isSelected
                    ? 'border-brand bg-brand-light text-brand'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {count === 0 ? '끔' : count}
              </button>
            )
          })}
        </div>
        {isOff && (
          <p className="text-sm text-amber-700">
            AI 메시지가 모두 꺼져요. 이벤트 메시지(예: 계획 시간 지남)도 오지 않아요.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">연락 금지 시간</span>
        <div className="flex items-center gap-2">
          {/* min-w-0: 좁은 화면에서 시각 칸이 줄어들 수 있게 해서 가로 스크롤을 막습니다. */}
          <div className="min-w-0 flex-1">
            <Input
              type="time"
              aria-label="연락 금지 시작 시각"
              value={value.quietStart}
              onChange={(event) => handleChangeTime('quietStart', event.target.value)}
            />
          </div>
          <span aria-hidden className="shrink-0 text-slate-400">
            ~
          </span>
          <div className="min-w-0 flex-1">
            <Input
              type="time"
              aria-label="연락 금지 끝 시각"
              value={value.quietEnd}
              onChange={(event) => handleChangeTime('quietEnd', event.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-slate-500">이 시간에는 메시지도 전화도 안 와요.</p>
      </div>
    </div>
  )
}
