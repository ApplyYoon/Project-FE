import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { POSTPONE_REASON_MIN, isPostponeReasonLongEnough } from '@/lib/cardMarks'
import { cn } from '@/lib/cn'

interface PostponeCardModalProps {
  isOpen: boolean
  /** 미루는 카드 제목 */
  cardTitle: string
  /** 남은 미루기 횟수 (안내에 씀) */
  leftCount: number
  /** 새 날짜 · 시각의 처음 값 */
  defaultDate: string
  defaultTime: string
  onClose: () => void
  onPostpone: (reason: string, newDate: string, newStartTime: string) => void
}

/**
 * 미루기 창 (최종 기획서 「4.4 타이머」 미루기, #400)
 * '왜 미루는지 + 어떻게 할지' 를 100자 이상 쓰고 새 시각을 정해야 [미루기] 가 눌립니다.
 * 일부러 조금 번거롭게 만든 '의도된 마찰' 입니다. 카드 탭(#394)에서도 같이 씁니다.
 */
export function PostponeCardModal({
  isOpen,
  cardTitle,
  leftCount,
  defaultDate,
  defaultTime,
  onClose,
  onPostpone,
}: PostponeCardModalProps) {
  const [reason, setReason] = useState('')
  const [newDate, setNewDate] = useState(defaultDate)
  const [newTime, setNewTime] = useState(defaultTime)
  const length = reason.trim().length
  const canSave = isPostponeReasonLongEnough(reason) && newDate !== '' && newTime !== ''

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`'${cardTitle}' 미루기`}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-700">
          왜 미루는지, 그리고 언제 어떻게 할지 적어요. 이번 달 {leftCount}번 더 미룰 수 있어요.
        </p>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder="예: 학원이 늦게 끝나서 오늘은 못 해요. 내일 저녁 8시에 식사 끝나자마자 같은 분량을 할게요. …"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
        <p
          className={cn(
            'text-right text-xs',
            length >= POSTPONE_REASON_MIN ? 'text-emerald-700' : 'text-slate-500',
          )}
        >
          {length} / {POSTPONE_REASON_MIN}자
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            새 날짜
            <input
              type="date"
              value={newDate}
              onChange={(event) => setNewDate(event.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            새 시각
            <input
              type="time"
              value={newTime}
              onChange={(event) => setNewTime(event.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-2"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            그만두기
          </Button>
          <Button disabled={!canSave} onClick={() => onPostpone(reason.trim(), newDate, newTime)}>
            미루기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
