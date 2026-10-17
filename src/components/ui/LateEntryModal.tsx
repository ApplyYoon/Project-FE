import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { ChecklistItem } from '@/types'

interface LateEntryModalProps {
  isOpen: boolean
  cardTitle: string
  checklist: ChecklistItem[]
  /** 적을 수 있는 가장 긴 시간 (분) — 카드 예정 시간 이하, 지난 시간까지만 */
  maxMinutes: number
  onClose: () => void
  /** 한 시간(분) · 체크한 항목 id · 증빙 글 (기록은 lib/lateEntry.ts 가 만듭니다) */
  onSave: (minutes: number, checkedIds: string[], proofText: string) => void
}

/**
 * 사후 입력 창 (최종 기획서 「4.4 타이머」 사후 입력, #402)
 * 폰을 내서 타이머를 못 켰을 때, 한 시간 · 한 것 · 증빙을 나중에 적습니다.
 * 증빙이 없으면 '나중에 적었어요(자기 보고)' 로 남고 분석에서 따로 셉니다.
 */
export function LateEntryModal({
  isOpen,
  cardTitle,
  checklist,
  maxMinutes,
  onClose,
  onSave,
}: LateEntryModalProps) {
  const [minutes, setMinutes] = useState(maxMinutes)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [proof, setProof] = useState('')
  const isValid = Number.isInteger(minutes) && minutes >= 1 && minutes <= maxMinutes

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`'${cardTitle}' 나중에 적기`}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          실제로 한 시간 (분, 최대 {maxMinutes}분)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={maxMinutes}
            value={Number.isNaN(minutes) ? '' : minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="h-10 rounded-lg border border-slate-300 px-3"
          />
        </label>
        {checklist.length > 0 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm text-slate-700">한 것</legend>
            {checklist.map((item) => (
              <label
                key={item.id}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="accent-brand size-5"
                  checked={checkedIds.includes(item.id)}
                  onChange={() =>
                    setCheckedIds((prev) =>
                      prev.includes(item.id)
                        ? prev.filter((id) => id !== item.id)
                        : [...prev, item.id],
                    )
                  }
                />
                <span className="text-slate-800">{item.text}</span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          증빙 (노트 사진 링크 · 인강 진도 · 2~3줄 요약)
          <textarea
            value={proof}
            onChange={(event) => setProof(event.target.value)}
            rows={3}
            maxLength={300}
            className="rounded-lg border border-slate-300 p-3 text-sm"
          />
        </label>
        <p className="text-xs text-slate-500">
          증빙이 없으면 '나중에 적었어요' 로 남아요. 잰 시간과 적은 시간은 분석에서 따로 보여 줘요.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            그만두기
          </Button>
          <Button disabled={!isValid} onClick={() => onSave(minutes, checkedIds, proof)}>
            적기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
