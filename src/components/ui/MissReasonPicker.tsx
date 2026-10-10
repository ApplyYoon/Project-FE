import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

/** 어제 계획을 다 못 채운 이유. etc 는 '기타' 입니다. */
export type MissReasonKey = 'tired' | 'event' | 'phone' | 'overplan' | 'lazy' | 'sick' | 'etc'

/** 고른 이유. '기타' 를 골랐을 때만 note 에 한 줄을 적습니다. */
export interface MissReasonValue {
  reason: MissReasonKey
  /** '기타' 일 때 적는 한 줄 (최대 50자). 다른 이유를 골랐으면 빈 글자입니다. */
  note: string
}

// '기타' 에 적을 수 있는 최대 글자 수
const NOTE_MAX_LENGTH = 50

// 버튼은 이 순서대로 보입니다.
const reasonOptions: { key: MissReasonKey; label: string }[] = [
  { key: 'tired', label: '피곤·수면' },
  { key: 'event', label: '약속·행사' },
  { key: 'phone', label: '폰·SNS' },
  { key: 'overplan', label: '계획 과다' },
  { key: 'lazy', label: '하기 싫음' },
  { key: 'sick', label: '아픔' },
  { key: 'etc', label: '기타' },
]

interface MissReasonPickerProps {
  /** 어제 계획 달성률 (0 ~ 100). 100 이상이면 아무것도 보여주지 않습니다. */
  achievementRate: number
  /** 지금 고른 이유. 아직 안 골랐으면 null */
  value: MissReasonValue | null
  /** 이유를 고르거나 '기타' 글을 고칠 때마다 새 값을 알려줍니다. */
  onChange: (value: MissReasonValue) => void
  className?: string
}

/**
 * "어제 계획을 다 못 채웠어. 왜 그랬어?" 에 답하는 버튼 7개입니다.
 * 하나만 고를 수 있고, 다른 버튼을 누르면 선택이 바뀝니다.
 *
 * 어제 달성률이 100% 미만일 때만 보입니다.
 *
 * <MissReasonPicker achievementRate={80} value={missReason} onChange={setMissReason} />
 */
export function MissReasonPicker({
  achievementRate,
  value,
  onChange,
  className,
}: MissReasonPickerProps) {
  // 다 채웠거나(100% 이상), 계획이 없던 날(0 ÷ 0 = 숫자가 아님)에는 물어볼 게 없습니다.
  if (Number.isNaN(achievementRate) || achievementRate >= 100) return null

  function handleSelect(reason: MissReasonKey) {
    // 이미 고른 걸 또 눌러도 그대로 둡니다. ('기타' 에 적은 글이 지워지면 안 되기 때문입니다)
    if (value?.reason === reason) return
    onChange({ reason, note: '' })
  }

  function handleChangeNote(text: string) {
    // maxLength 로 막아 두지만, 한 번 더 잘라서 50자를 넘지 않게 합니다.
    onChange({ reason: 'etc', note: text.slice(0, NOTE_MAX_LENGTH) })
  }

  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          어제 계획을 다 못 채웠어. 왜 그랬어?
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          어제 달성률이 100% 미만이라 물어봐요. 하나만 골라요.
        </p>
      </div>

      {/* 글자 수가 제각각인 버튼이라 flex-wrap 으로 넘치면 다음 줄로 보냅니다. */}
      <div className="flex flex-wrap gap-2">
        {reasonOptions.map((option) => {
          const isSelected = value?.reason === option.key
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleSelect(option.key)}
              className={cn(
                // whitespace-nowrap: 좁은 화면에서 "피곤·수/면" 처럼 글자가 중간에 끊기지 않게 합니다.
                'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
                isSelected
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {/* '기타' 를 골랐을 때만 한 줄 입력칸이 나옵니다. */}
      {value?.reason === 'etc' && (
        <div className="flex flex-col gap-1">
          <Input
            aria-label="기타 이유"
            placeholder="한 줄로 적어 주세요"
            maxLength={NOTE_MAX_LENGTH}
            value={value.note}
            onChange={(event) => handleChangeNote(event.target.value)}
          />
          <p className="text-right text-xs text-slate-500">
            {value.note.length}/{NOTE_MAX_LENGTH}
          </p>
        </div>
      )}
    </Card>
  )
}
