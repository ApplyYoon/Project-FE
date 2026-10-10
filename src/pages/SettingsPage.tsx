import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import {
  getCareLimits,
  setAllowFocusMode,
  setAllowOffHoursCall,
  setMaxCareLevel,
  setMaxHarshness,
} from '@/lib/careLimits'
import type { CareLevel } from '@/types'

/** 관리 강도 단계별 이름과 한 줄 설명. (#28 의 단계 표와 같은 문구) */
const careLevelOptions: { level: CareLevel; label: string; description: string }[] = [
  { level: 0, label: '0 회복', description: '위로만. "오늘은 10분만"' },
  { level: 1, label: '1 당근', description: '구체적 칭찬, 나무 성장' },
  { level: 2, label: '2 넛지', description: '담백한 알림. "계획 시간 10분 지났어"' },
  { level: 3, label: '3 심리적 채찍', description: '팩폭 말투, 독촉 메시지, 나무 시듦' },
  { level: 4, label: '4 강제적 채찍', description: '공부 시간에 집중 모드 잠금' },
]

/** 독설 허용 수위(1~5)별 한 줄 설명 */
const harshnessDescriptions: Record<number, string> = {
  1: '부드럽게만 말해줘',
  2: '담백하게 짚어줘',
  3: '따끔하게 말해도 돼',
  4: '세게 말해도 돼',
  5: '제일 세게 말해도 돼',
}

/** 'YYYY-MM-DD' 를 'M월 D일' 로 바꿔줍니다. */
function formatDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}

export function SettingsPage() {
  // 처음 열 때 한 번 불러옵니다. (불러오면서 예약된 한도 상향이 있으면 날짜가 지났는지도 같이 확인합니다)
  const [limits, setLimits] = useState(() => getCareLimits())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">설정</h1>
        <p className="mt-2 text-slate-600">
          AI 가 나를 얼마나 세게 챙길지 내가 정해요. 정한 한도는 절대 넘지 않아요.
        </p>
      </div>

      <Card title="관리 강도 최대 한도">
        <p className="text-sm text-slate-500">한도를 낮추면 바로, 높이면 내일부터 적용돼요.</p>

        {limits.pendingMaxCareLevel !== null && limits.pendingEffectiveDate !== null && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {formatDateLabel(limits.pendingEffectiveDate)}부터 {limits.pendingMaxCareLevel}단계로
            올라가요. 그때까지는 지금 한도({limits.maxCareLevel}단계)가 유지돼요.
          </p>
        )}

        <div
          role="radiogroup"
          aria-label="관리 강도 최대 한도"
          className="mt-4 flex flex-col gap-2"
        >
          {careLevelOptions.map((option) => {
            const isSelected = option.level === limits.maxCareLevel
            return (
              <label
                key={option.level}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3',
                  isSelected ? 'border-brand bg-brand-light' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="maxCareLevel"
                  checked={isSelected}
                  onChange={() => setLimits(setMaxCareLevel(option.level))}
                  className="accent-brand mt-1 h-5 w-5 shrink-0 cursor-pointer"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                  <span className="text-sm text-slate-500">{option.description}</span>
                </span>
              </label>
            )
          })}
        </div>
      </Card>

      <Card title="독설 허용 수위">
        <p className="text-sm text-slate-500">
          지적은 행동에만 해요. 외모·성적·능력 비하와 남과 비교는 절대 안 해요.
        </p>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((value) => {
            const isSelected = value === limits.maxHarshness
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setLimits(setMaxHarshness(value))}
                className={cn(
                  'h-10 cursor-pointer rounded-lg border text-sm font-medium transition-colors',
                  isSelected
                    ? 'border-brand bg-brand-light text-brand'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {value}
              </button>
            )
          })}
        </div>

        <p className="mt-2 text-sm text-slate-500">
          {limits.maxHarshness} · {harshnessDescriptions[limits.maxHarshness]}
        </p>
      </Card>

      <Card title="잠금과 독촉">
        <div className="flex flex-col divide-y divide-slate-100">
          <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900">집중 모드 잠금 허용</span>
              <span className="text-sm text-slate-500">풀려면 10초 기다리고 이유를 적어요</span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={limits.allowFocusMode}
                onChange={(event) => setLimits(setAllowFocusMode(event.target.checked))}
                aria-label="집중 모드 잠금 허용"
                className="accent-brand h-5 w-5 cursor-pointer"
              />
            </span>
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900">정해진 시간 외 독촉 전화</span>
              <span className="text-sm text-slate-500">허용해도 하루 1번까지만</span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={limits.allowOffHoursCall}
                onChange={(event) => setLimits(setAllowOffHoursCall(event.target.checked))}
                aria-label="정해진 시간 외 독촉 전화"
                className="accent-brand h-5 w-5 cursor-pointer"
              />
            </span>
          </label>
        </div>
      </Card>
    </div>
  )
}
