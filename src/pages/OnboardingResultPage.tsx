import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AUTO_SETTING_ROWS } from '@/lib/autoSettingOptions'
import { getCareLevelInfo } from '@/lib/careLevelInfo'
import { getCareLimits } from '@/lib/careLimits'
import { loadMyHypotheses, type MyHypotheses } from '@/lib/myHypotheses'
import {
  getTraitSummary,
  hasCareConsent,
  loadScaleLevels,
  markOnboardingResultSeen,
} from '@/lib/onboardingCare'
import { getOnboardingResumePath } from '@/lib/onboardingProgress'
import { loadPsychTest } from '@/lib/psychTest'
import { loadAutoSettings, proposeCareLimits } from '@/lib/settingsMapping'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

/** 결과 화면의 설정 한 줄 */
interface SettingLine {
  title: string
  value: string
  reason: string
}

/** 검사로 바뀐 설정들을 화면에 보여 줄 줄로 바꿉니다. (이유는 #385 가 남긴 reason 그대로) */
function getTestSettingLines(): SettingLine[] {
  const settings = loadAutoSettings()
  const lines: SettingLine[] = []
  for (const row of AUTO_SETTING_ROWS) {
    const setting = settings[row.key]
    if (setting.source !== 'test') continue
    const option = row.options.find((item) => item.value === setting.value)
    lines.push({
      title: row.title,
      value: option?.label ?? String(setting.value),
      reason: setting.reason,
    })
  }
  return lines
}

/** 하루 공부 시간(분)을 보기 글자처럼. 300분은 보기에서 "5시간 이상" 이었습니다. */
function formatDailyHours(minutes: number): string {
  const hours = minutes / 60
  return hours >= 5 ? '5시간 이상' : `${hours}시간`
}

/** 내 가설 4개를 "아침형 · 집중 50분 …" 같은 줄로. '잘 모르겠음' 은 "기록으로 알아볼게요" 로 */
function getHypothesisLines(hypotheses: MyHypotheses): string[] {
  const unknown = '잘 모르겠음 → 기록으로 알아볼게요'
  return [
    `아침형/밤형: ${hypotheses.chronotype === null ? unknown : hypotheses.chronotype === 'morning' ? '아침형' : '밤형'}`,
    `한 번에 집중: ${hypotheses.maxFocusMinutes === null ? unknown : `${hypotheses.maxFocusMinutes}분 안팎`}`,
    `가장 큰 방해: ${hypotheses.biggestDistraction ?? unknown}`,
    `평일 공부 시간: ${hypotheses.dailyAvailableMinutes === null ? unknown : formatDailyHours(hypotheses.dailyAvailableMinutes)}`,
  ]
}

/**
 * 온보딩 6번 "결과 화면" 입니다. (주소: /onboarding/result, 기획서 4.1, #389)
 * 성향 요약 3줄 + 검사로 맞춘 설정(설정마다 이유 한 줄) + "2주 동안 네 가설을 확인해볼게."
 *
 * - 성향 요약은 지금은 코드가 고른 문장입니다. (lib/onboardingCare.ts 의 getTraitSummary)
 *   서버 GPT 가 쓴 문장(BE#219)이 생기면 그 문장을 먼저 보여 주고, 못 받으면 이 문장을 씁니다. (2026-10-17 결정)
 * - 시안이 없어서 "준비 끝" 화면과 설정의 관리 강도 카드 모양을 따랐습니다.
 */
export function OnboardingResultPage() {
  const navigate = useNavigate()
  const [psychTest] = useState(loadPsychTest)
  const [hypotheses] = useState(loadMyHypotheses)
  const [settingLines] = useState(getTestSettingLines)
  const [limits] = useState(getCareLimits)
  const [proposal] = useState(() => proposeCareLimits(loadScaleLevels()))
  const [isConsented] = useState(hasCareConsent)

  // 앞 단계(심리검사 · 관리 설정)를 안 끝내고 주소로 들어왔으면 이어 할 자리로 보냅니다.
  if (psychTest === undefined || !isConsented) {
    return <Navigate to={getOnboardingResumePath() ?? '/'} replace />
  }

  const traitLines = getTraitSummary(psychTest.scores)
  // 미리 채운 값 그대로 동의했으면 검사 이유를, 바꿨으면 "내가 정했어요" 를 보여 줍니다.
  const isProposalKept =
    limits.maxCareLevel === proposal.maxCareLevel && limits.maxHarshness === proposal.maxHarshness
  const careLine: SettingLine = {
    title: '관리 세기',
    value: `최대 ${limits.maxCareLevel}단계 · ${getCareLevelInfo(limits.maxCareLevel).name}, 말투 ${limits.maxHarshness}`,
    reason: isProposalKept ? proposal.reason : '내가 직접 정했어요',
  }

  function handleStart() {
    markOnboardingResultSeen()
    // replace: 뒤로 가기를 눌러도 이 화면으로 돌아오지 않게 합니다.
    navigate(getOnboardingResumePath() ?? '/', { replace: true })
  }

  return (
    <PlainLayout>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div>
          <p className="text-brand text-sm font-semibold">결과</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            지금의 너는 이런 편이야
          </h1>
        </div>

        <Card title="성향 요약">
          <ul className="flex flex-col gap-2 text-sm break-keep text-slate-800 sm:text-base">
            {traitLines.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="text-brand">
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs break-keep text-slate-500">
            처음 검사로 본 첫 짐작이에요. 성격이 아니라 지금의 공부 습관이에요.
          </p>
        </Card>

        <Card title="그래서 이렇게 맞춰 뒀어요">
          <ul className="flex flex-col gap-4">
            {[careLine, ...settingLines].map((line) => (
              <li key={line.title}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-slate-900">{line.title}</p>
                  <p className="text-brand-dark text-sm font-semibold">{line.value}</p>
                </div>
                <p className="mt-0.5 text-sm break-keep text-slate-500">{line.reason}</p>
              </li>
            ))}
          </ul>
          {settingLines.length === 0 && (
            <p className="mt-4 text-sm break-keep text-slate-500">
              나머지는 검사 결과가 대부분 보통이라 기본 설정으로 시작해요.
            </p>
          )}
          <p className="mt-4 text-xs break-keep text-slate-500">
            설정에서 언제든 바꿀 수 있고, 바꾼 것은 AI 가 다시 건드리지 않아요.
          </p>
        </Card>

        {hypotheses !== undefined && (
          <Card title="2주 동안 네 가설을 확인해볼게">
            <ul className="flex flex-col gap-1.5 text-sm break-keep text-slate-700">
              {getHypothesisLines(hypotheses).map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </Card>
        )}

        <Button size="lg" className="w-full sm:w-auto sm:self-start" onClick={handleStart}>
          시작하기
        </Button>
      </div>
    </PlainLayout>
  )
}
