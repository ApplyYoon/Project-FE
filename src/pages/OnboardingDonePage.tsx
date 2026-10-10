import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { loadData } from '@/lib/storage'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

// 온보딩 설문 답을 저장한 이름. OnboardingPage 와 같은 값이어야 합니다. (답이 있으면 = 온보딩을 마친 사람)
const ANSWERS_KEY = 'onboarding-answers'
// 관리 한도를 저장하는 이름. 설정 화면 PR #127 의 lib/careLimits.ts 와 같은 값입니다.
const CARE_LIMITS_KEY = 'care-limits'

// 아직 한 번도 설정하지 않았을 때의 처음 값. PR #127 의 defaultLimits 와 같게 맞췄습니다.
const DEFAULT_MAX_CARE_LEVEL = 2
const DEFAULT_MAX_HARSHNESS = 3

/** 관리 강도 단계 이름. 배열 번호 = 단계 (0~4). lib/careLevel.ts 의 설명과 같습니다. */
const careLevelNames = ['회복', '당근', '넛지', '심리적 채찍', '강제적 채찍']

/** 앞으로 진행되는 3단계 */
const nextSteps = [
  { when: '오늘', what: '타이머로 공부를 기록해요' },
  { when: '내일 아침', what: 'AI 선생님이 첫 체크인 전화를 걸어요' },
  { when: '14일 뒤', what: '첫 리포트에서 나만의 패턴을 알려줘요' },
]

const NOT_SET = '아직 안 정했어요'

/**
 * 저장된 관리 한도를 읽습니다. 없거나 모양이 틀리면 처음 값을 씁니다.
 * TODO(#59): PR #127 이 merge 되면 getCareLimits() 로 바꾸기
 *   (getCareLimits 는 예약해 둔 한도 상향까지 반영해 줍니다)
 */
function loadCareLimits(): { maxCareLevel: number; maxHarshness: number } {
  const saved = loadData<unknown>(CARE_LIMITS_KEY, null)
  const limits = { maxCareLevel: DEFAULT_MAX_CARE_LEVEL, maxHarshness: DEFAULT_MAX_HARSHNESS }
  if (typeof saved !== 'object' || saved === null) return limits

  const item = saved as Record<string, unknown>
  // 0~4, 1~5 사이 정수일 때만 저장된 값을 씁니다.
  if (Number.isInteger(item.maxCareLevel) && Number(item.maxCareLevel) >= 0) {
    limits.maxCareLevel = Math.min(4, Number(item.maxCareLevel))
  }
  if (Number.isInteger(item.maxHarshness) && Number(item.maxHarshness) >= 1) {
    limits.maxHarshness = Math.min(5, Number(item.maxHarshness))
  }
  return limits
}

/**
 * 'HH:MM' 을 '밤 11시', '아침 7시 30분' 처럼 바꿉니다. 시각 모양이 아니면 null.
 *   '23:00' -> '밤 11시' · '07:30' -> '아침 7시 30분' · '00:00' -> '새벽 12시'
 */
function formatKoreanTime(time: string | undefined): string | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null
  const [hour, minute] = time.split(':').map(Number)

  let period = '밤'
  if (hour < 6) period = '새벽'
  else if (hour < 12) period = '아침'
  else if (hour < 18) period = '오후'
  else if (hour < 21) period = '저녁'

  // 13시 → 1시, 0시 → 12시
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return minute === 0 ? `${period} ${hour12}시` : `${period} ${hour12}시 ${minute}분`
}

/**
 * 온보딩 마지막 "준비 끝!" 화면입니다. (주소: /onboarding/done)
 * 앞으로 무엇을 기다리면 되는지와, 내가 정한 관리 설정을 한눈에 보여줍니다.
 *
 * 온보딩 답은 설문의 "완료" 를 누를 때 이미 저장됐습니다. (그래서 여기서 창을 닫아도 다시 설문이 나오지 않습니다)
 * 답이 없는 사람(설문을 안 한 사람)이 주소로 바로 들어오면 설문으로 보냅니다.
 */
export function OnboardingDonePage() {
  const navigate = useNavigate()
  const [answers] = useState(() => loadData<Record<string, string> | null>(ANSWERS_KEY, null))
  const [limits] = useState(loadCareLimits)

  if (answers === null) return <Navigate to="/onboarding" replace />

  // 연락 금지 시간은 #60(조용한 시간)이 생기기 전까지 "자는 시간 ~ 일어나는 시간" 으로 보여줍니다.
  const sleepTime = formatKoreanTime(answers.sleepTime)
  const wakeUpTime = formatKoreanTime(answers.wakeUpTime)
  const quietTime = sleepTime && wakeUpTime ? `${sleepTime} ~ ${wakeUpTime}` : NOT_SET

  const settings = [
    {
      label: '최대 관리 강도',
      value: `${limits.maxCareLevel}단계 · ${careLevelNames[limits.maxCareLevel]}까지`,
    },
    { label: '독설 수위', value: `${limits.maxHarshness} / 5` },
    // 전화 시간을 묻는 곳이 아직 없습니다. 생기면 여기에 연결하세요.
    { label: '전화 시간', value: NOT_SET },
    { label: '연락 금지', value: quietTime },
  ]

  function handleGoHome() {
    // replace: 뒤로 가기를 눌러도 이 화면으로 돌아오지 않게 합니다.
    navigate('/', { replace: true })
  }

  return (
    <PlainLayout>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col items-center text-center">
          <div
            aria-hidden
            className="bg-brand-light text-brand flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold"
          >
            ✓
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            준비 끝! 오늘부터 같이 해 볼게요
          </h1>
          <p className="mt-2 text-sm break-keep text-slate-600">
            온보딩 답은 설정에서 언제든 바꿀 수 있어요.
          </p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">앞으로 이렇게 진행돼요</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {nextSteps.map((step, index) => (
              <li key={step.when} className="flex items-start gap-3">
                {/* 첫 단계(오늘)만 진하게 칠해서 "지금 할 일" 임을 보여줍니다. */}
                <span
                  aria-hidden
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    index === 0 ? 'bg-brand text-white' : 'bg-brand-light text-brand',
                  )}
                >
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm break-keep text-slate-700 sm:text-base">
                  <strong className="font-semibold text-slate-900">{step.when}</strong> —{' '}
                  {step.what}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">내가 정한 관리 설정</h2>
            {/* h-10: 글자는 작아도 누르는 영역은 40px 로 둡니다. */}
            <Link
              to="/settings"
              className="text-brand inline-flex h-10 shrink-0 items-center text-sm font-medium underline"
            >
              설정에서 바꾸기
            </Link>
          </div>
          <dl className="mt-2 flex flex-col gap-2">
            {settings.map((setting) => (
              <div key={setting.label} className="flex gap-4 text-sm">
                <dt className="w-24 shrink-0 text-slate-500">{setting.label}</dt>
                <dd
                  className={cn(
                    'min-w-0 font-semibold break-keep text-slate-900',
                    setting.value === NOT_SET && 'font-normal text-slate-400',
                  )}
                >
                  {setting.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <Button size="lg" className="w-full" onClick={handleGoHome}>
          홈으로 가기
        </Button>
      </div>
    </PlainLayout>
  )
}
