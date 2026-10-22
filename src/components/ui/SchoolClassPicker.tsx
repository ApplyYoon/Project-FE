import { cn } from '@/lib/cn'
import { getDefaultGrade, MAX_CLASS_NO, type SchoolClass } from '@/lib/schoolToday'
import { useState } from 'react'

interface SchoolClassPickerProps {
  /** 처음에 골라 둘 학년 · 반. 없으면 온보딩에서 고른 학년 · 1반 */
  initial: SchoolClass | null
  /** [저장] 을 누르면 고른 학년 · 반을 알려 줍니다. 저장(saveSchoolClass)은 쓰는 쪽에서 합니다. */
  onSave: (next: SchoolClass) => void
  /** 칸 위의 안내 한 줄 */
  description: string
  /** 버튼 글자. 예) '시간표 보기' · '저장' */
  saveLabel: string
  className?: string
}

/**
 * 학년 · 반을 고르는 작은 칸입니다. 고른 반은 서버에 저장하지 않고 이 기기에만 둡니다. (lib/schoolToday.ts)
 * 홈(시간표 보기)과 설정의 계정 묶음이 같이 씁니다. 두 곳 다 같은 저장소(study-school-class)를 씁니다.
 *
 *   <SchoolClassPicker initial={schoolClass} onSave={handleSave} description="몇 학년 몇 반이야?" saveLabel="저장" />
 */
export function SchoolClassPicker({
  initial,
  onSave,
  description,
  saveLabel,
  className,
}: SchoolClassPickerProps) {
  const [grade, setGrade] = useState(initial?.grade ?? getDefaultGrade())
  const [classNo, setClassNo] = useState(initial?.classNo ?? 1)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-[13px] break-keep text-slate-500">{description}</p>
      {/* 학년 · 반 · 저장을 한 줄에 둡니다. 저장은 자주 누르는 행동이 아니라서 꽉 찬 brand 버튼 대신 선만 있는 버튼입니다. (2026-10-22) */}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="school-grade">
          학년
        </label>
        <select
          id="school-grade"
          value={grade}
          onChange={(event) => setGrade(Number(event.target.value))}
          className="h-11 min-w-0 flex-1 rounded-xl bg-slate-100 px-3 text-base text-slate-900"
        >
          {[1, 2, 3].map((value) => (
            <option key={value} value={value}>
              {value}학년
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="school-class-no">
          반
        </label>
        <select
          id="school-class-no"
          value={classNo}
          onChange={(event) => setClassNo(Number(event.target.value))}
          className="h-11 min-w-0 flex-1 rounded-xl bg-slate-100 px-3 text-base text-slate-900"
        >
          {Array.from({ length: MAX_CLASS_NO }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value}반
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSave({ grade, classNo })}
          className="h-11 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 active:scale-[0.98]"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
