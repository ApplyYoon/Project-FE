import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { FIRST_CHECK_DAYS, MIN_CONFIRM_DAYS, type HypothesisCheck } from '@/lib/hypothesisCheck'

interface MyHypothesesCardProps {
  checks: HypothesisCheck[]
  /** 가설을 적은 지 며칠째인지 (적은 날 = 1일째) */
  day: number
  className?: string
}

/**
 * 내 가설 확인 카드 (최종 기획서 「4.6 분석」 내 가설, #411)
 * 온보딩에 적은 '나에 대한 생각' 4개를 기록과 나란히 보여 줍니다. 판정하지 않고 "예상은 ○○였지?" 로 사실만 보여 줍니다.
 * 3일째부터 보이고, 3일째 · 7일째에는 '첫 확인' 표시가 붙습니다. 분석 탭과 홈(#405)에서 같이 씁니다.
 *
 * <MyHypothesesCard checks={checkHypotheses(hypotheses, input)} day={getHypothesisDay(hypotheses, todayKey)} />
 */
export function MyHypothesesCard({ checks, day, className }: MyHypothesesCardProps) {
  const firstCheck = FIRST_CHECK_DAYS[0]
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">내 가설 확인</h3>
        <span className="text-sm text-slate-500">{day}일째</span>
        {FIRST_CHECK_DAYS.includes(day) && (
          <span className="bg-brand-light text-brand rounded-full px-2 py-0.5 text-xs font-semibold">
            첫 확인
          </span>
        )}
      </div>
      {day < firstCheck ? (
        <p className="mt-2 text-sm text-slate-600">
          {firstCheck}일째에 첫 확인을 보여 줄게요. 그동안 카드대로 해 봐요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {checks.map((check) => {
            const isTentative = check.sampleDays < MIN_CONFIRM_DAYS
            return (
              <li key={check.key} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{check.title}</p>
                  {isTentative && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      가설 (확인 중)
                    </span>
                  )}
                  {check.isMatch !== null && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        check.isMatch
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-violet-50 text-violet-700',
                      )}
                    >
                      {check.isMatch ? '예상과 비슷해요' : '예상과 달라요'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">내 답: {check.guess}</p>
                <p className="mt-1 text-sm break-keep text-slate-700">
                  {check.message ?? '아직 비교할 기록이 없어요.'}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
