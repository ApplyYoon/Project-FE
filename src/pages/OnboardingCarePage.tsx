import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CareLevelPicker, HarshnessPicker } from '@/components/ui/CareLimitPickers'
import { Input } from '@/components/ui/Input'
import { MessageSettingsFields } from '@/components/ui/MessageSettingsFields'
import { OnboardingExitButton } from '@/components/ui/OnboardingExitButton'
import { CALL_TIME_STORAGE_KEY, isCallTimeInQuietHours, parseCallTime } from '@/lib/callReminder'
import { setInitialCareLimits } from '@/lib/careLimits'
import { getMessageSettings, saveMessageSettings } from '@/lib/messageSettings'
import { toQuietHours } from '@/lib/notifications'
import {
  DEFAULT_BED_TIME,
  DEFAULT_WAKE_TIME,
  MIN_SLEEP_HOURS,
  getSleepMinutes,
  hasCareConsent,
  isSleepLongEnough,
  loadScaleLevels,
  saveCareConsent,
} from '@/lib/onboardingCare'
import { getOnboardingResumePath } from '@/lib/onboardingProgress'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import {
  applyProposals,
  loadAutoSettings,
  proposeCareLimits,
  proposeFromTest,
  saveAutoSettings,
} from '@/lib/settingsMapping'
import { loadData, removeData, saveData } from '@/lib/storage'
import type { CareLevel } from '@/types'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

/** 저장된 전화 시각 ('HH:MM'). 안 정했거나 모양이 틀리면 빈 글자 */
function loadCallTime(): string {
  const saved = loadData<unknown>(CALL_TIME_STORAGE_KEY, '')
  return typeof saved === 'string' && parseCallTime(saved) !== null ? saved : ''
}

/** 분을 '7시간 30분' 처럼 바꿉니다. */
function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`
}

/**
 * 온보딩 5번 "관리 설정" 화면입니다. (주소: /onboarding/care, 기획서 4.1, #389)
 * 통화 시각 · 연락 금지 시간 · 수면 보호 시간 · 제재 최대 한도 · 말투 수위를 정합니다.
 *
 * - 한도와 수위는 심리검사 결과로 미리 채웁니다. (lib/settingsMapping.ts 의 proposeCareLimits)
 * - [이대로 할게요] 를 눌러야 다음으로 갑니다. 채찍의 세기는 본인이 동의해야 해서입니다. (명시적 동의)
 * - 수면 보호 시간이 6시간보다 짧으면 [이대로 할게요] 가 눌리지 않습니다.
 * - 동의하는 순간, 심리검사로 고른 설정(5초 카운트다운 등)도 같이 맞춥니다. (proposeFromTest → 결과 화면에 이유와 함께 보여 줌)
 */
export function OnboardingCarePage() {
  const navigate = useNavigate()
  // 이미 동의한 사람은 아래에서 다음 단계로 보냅니다. 화면이 처음 그려질 때 한 번만 봅니다.
  const [isDone] = useState(hasCareConsent)
  const [levels] = useState(loadScaleLevels)
  const [proposal] = useState(() => proposeCareLimits(levels))
  const [savedAnswers] = useState(loadOnboardingAnswers)

  const [callTime, setCallTime] = useState(loadCallTime)
  const [messageSettings, setMessageSettings] = useState(getMessageSettings)
  // 수면 보호 시간은 온보딩 답의 취침·기상 시각 칸(wakeUpTime · sleepTime)에 저장합니다. 카드 폼 · 고정 일정이 이 칸을 읽습니다.
  const [bedTime, setBedTime] = useState(savedAnswers?.sleepTime || DEFAULT_BED_TIME)
  const [wakeTime, setWakeTime] = useState(savedAnswers?.wakeUpTime || DEFAULT_WAKE_TIME)
  const [maxCareLevel, setMaxCareLevel] = useState<CareLevel>(proposal.maxCareLevel)
  const [maxHarshness, setMaxHarshness] = useState(proposal.maxHarshness)

  if (isDone) return <Navigate to={getOnboardingResumePath() ?? '/'} replace />

  const sleepMinutes = getSleepMinutes(bedTime, wakeTime)
  const isSleepOk = isSleepLongEnough(bedTime, wakeTime)
  const isCallInQuiet =
    callTime !== '' && isCallTimeInQuietHours(callTime, toQuietHours(messageSettings))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (!isSleepOk) return

    // 전화 시각: 비워 두면 전화가 울리지 않습니다. (설정에서 언제든 정할 수 있습니다)
    if (callTime === '') removeData(CALL_TIME_STORAGE_KEY)
    else saveData(CALL_TIME_STORAGE_KEY, callTime)
    saveMessageSettings(messageSettings)
    saveData('onboarding-answers', {
      ...(savedAnswers ?? {}),
      sleepTime: bedTime,
      wakeUpTime: wakeTime,
    })
    setInitialCareLimits(maxCareLevel, maxHarshness)

    // 심리검사로 고른 설정을 맞춥니다. 사용자가 이미 바꾼(잠긴) 설정은 건드리지 않습니다.
    const { next, changes } = applyProposals(loadAutoSettings(), proposeFromTest(levels), 'test')
    saveAutoSettings(next, changes)

    saveCareConsent(Date.now())
    // 다음 단계(결과 화면)로 갑니다. (순서: lib/onboardingProgress.ts)
    navigate(getOnboardingResumePath() ?? '/')
  }

  return (
    <PlainLayout headerAction={<OnboardingExitButton />}>
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div>
          <p className="text-brand text-sm font-semibold">관리 설정</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            어떻게 관리해 줄지 같이 정하자
          </h1>
          <p className="mt-2 text-sm break-keep text-slate-600 sm:text-base">
            검사 결과로 미리 채워 뒀어요. 보고 바꾸고 싶은 것만 바꿔 줘. 전부 설정에서 다시 바꿀 수
            있어요.
          </p>
        </div>

        <Card title="AI 선생님 전화 시각">
          <Input
            type="time"
            aria-label="AI 선생님 전화 시각"
            value={callTime}
            onChange={(event) => setCallTime(event.target.value)}
            className="h-12 text-base"
          />
          <p className="mt-2 text-sm break-keep text-slate-500">
            {callTime === ''
              ? '비워 두면 전화가 오지 않아요. 나중에 설정에서 정해도 돼요.'
              : `매일 ${callTime} 에 전화가 와요.`}
          </p>
          {isCallInQuiet && (
            <p className="mt-1 text-sm break-keep text-amber-700">
              이 시각은 연락 금지 시간 안이라 전화가 오지 않아요.
            </p>
          )}
        </Card>

        <Card title="메시지와 연락 금지 시간">
          <MessageSettingsFields value={messageSettings} onChange={setMessageSettings} />
        </Card>

        <Card title="수면 보호 시간">
          <p className="text-sm break-keep text-slate-500">
            잠자는 시간을 알려 줘. 공부 계획이 잠을 줄이지 않게 지켜 줄게요. 최소 {MIN_SLEEP_HOURS}
            시간이에요.
          </p>
          {/* 375px 에서도 두 칸이 한 줄에 들어가게 반씩 나눕니다. min-w-0: 칸이 줄어들 수 있게 해서 가로 스크롤을 막습니다. */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">잠드는 시각</span>
              <Input
                type="time"
                aria-label="잠드는 시각"
                value={bedTime}
                onChange={(event) => event.target.value !== '' && setBedTime(event.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">일어나는 시각</span>
              <Input
                type="time"
                aria-label="일어나는 시각"
                value={wakeTime}
                onChange={(event) => event.target.value !== '' && setWakeTime(event.target.value)}
                className="h-12 text-base"
              />
            </div>
          </div>
          <p
            role="status"
            className={isSleepOk ? 'mt-2 text-sm text-slate-500' : 'mt-2 text-sm text-red-700'}
          >
            {sleepMinutes === null
              ? '시각을 골라 주세요.'
              : isSleepOk
                ? `${formatHours(sleepMinutes)} 동안 지켜 줄게요.`
                : `${formatHours(sleepMinutes)}이에요. 수면 보호 시간은 ${MIN_SLEEP_HOURS}시간 이상이어야 해요.`}
          </p>
        </Card>

        <Card title="관리 세기">
          <div className="bg-brand/10 rounded-lg px-3 py-3">
            <p className="text-brand-dark text-sm font-semibold">검사 결과로 미리 골랐어요</p>
            <p className="mt-1 text-sm break-keep text-slate-900">{proposal.reason}</p>
          </div>
          <h4 className="mt-5 text-sm font-semibold text-slate-900">제재 최대 한도</h4>
          <p className="mt-1 text-sm break-keep text-slate-500">
            아무리 미뤄도 이 단계보다 세게 관리하지 않아요.
          </p>
          <CareLevelPicker value={maxCareLevel} onChange={setMaxCareLevel} className="mt-3" />
          <h4 className="mt-6 text-sm font-semibold text-slate-900">말투 수위</h4>
          <HarshnessPicker value={maxHarshness} onChange={setMaxHarshness} className="mt-3" />
        </Card>

        <div className="flex flex-col gap-2">
          {/* 이 버튼이 동의입니다. 수면 보호 시간이 짧으면 눌리지 않습니다. */}
          <Button type="submit" size="lg" className="w-full" disabled={!isSleepOk}>
            이대로 할게요
          </Button>
          <p className="text-center text-sm break-keep text-slate-500">
            누르면 이 세기로 관리하는 데 동의하는 거예요.
          </p>
        </div>
      </form>
    </PlainLayout>
  )
}
