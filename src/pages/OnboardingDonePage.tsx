import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { CALL_TIME_STORAGE_KEY } from '@/lib/callReminder'
import { getCareLimits } from '@/lib/careLimits'
import { cn } from '@/lib/cn'
import { getMessageSettings } from '@/lib/messageSettings'
import { loadData } from '@/lib/storage'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

// 온보딩 설문 답을 저장한 이름. OnboardingPage 와 같은 값이어야 합니다. (답이 있으면 = 온보딩을 마친 사람)
const ANSWERS_KEY = 'onboarding-answers'

/** 관리 강도 단계 이름. 배열 번호 = 단계 (0~4). lib/careLevel.ts 의 설명과 같습니다. */
const careLevelNames = ['회복', '당근', '넛지', '심리적 채찍', '강제적 채찍']

const NOT_SET = '아직 안 정했어요'

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
  // 설정 화면과 같은 함수로 읽어서, 설정 화면에 보이는 값과 똑같이 나오게 합니다.
  const [limits] = useState(getCareLimits) // 관리 강도·독설 수위 (#59)
  const [messageSettings] = useState(getMessageSettings) // 연락 금지 시간 (#60)
  const [callTime] = useState(() => loadData<unknown>(CALL_TIME_STORAGE_KEY, '')) // 전화 시간 (#39)

  if (answers === null) return <Navigate to="/onboarding" replace />

  // 전화 시간은 설정 화면에서 정합니다. 아직 안 정했으면 null 입니다.
  const callTimeText = typeof callTime === 'string' ? formatKoreanTime(callTime) : null
  const quietStart = formatKoreanTime(messageSettings.quietStart)
  const quietEnd = formatKoreanTime(messageSettings.quietEnd)

  /** 앞으로 진행되는 3단계 */
  const nextSteps = [
    { when: '오늘', what: '타이머로 공부를 기록해요' },
    // 전화 시간을 안 정했으면 전화가 오지 않으니, 정하라고 알려줍니다.
    callTimeText
      ? { when: `내일 ${callTimeText}`, what: 'AI 선생님이 첫 체크인 전화를 걸어요' }
      : { when: '전화 시간을 정하면', what: 'AI 선생님이 매일 체크인 전화를 걸어요' },
    { when: '14일 뒤', what: '첫 리포트에서 나만의 패턴을 알려줘요' },
  ]

  const settings = [
    {
      label: '최대 관리 강도',
      value: `${limits.maxCareLevel}단계 · ${careLevelNames[limits.maxCareLevel]}까지`,
    },
    { label: '독설 수위', value: `${limits.maxHarshness} / 5` },
    { label: '전화 시간', value: callTimeText ? `매일 ${callTimeText}` : NOT_SET },
    {
      label: '연락 금지',
      value: quietStart && quietEnd ? `${quietStart} ~ ${quietEnd}` : NOT_SET,
    },
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
