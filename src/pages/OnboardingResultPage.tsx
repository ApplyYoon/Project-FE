import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TalkButton } from '@/components/ui/TalkButton'
import { useIsServerData } from '@/hooks/useIsServerData'
import { AUTO_SETTING_ROWS } from '@/lib/autoSettingOptions'
import { getCareLevelInfo } from '@/lib/careLevelInfo'
import { getCareLimits } from '@/lib/careLimits'
import {
  getTraitSummary,
  hasCareConsent,
  loadScaleLevels,
  markOnboardingResultSeen,
} from '@/lib/onboardingCare'
import { getOnboardingResumePath } from '@/lib/onboardingProgress'
import { isPsychTestReliable, loadPsychTest } from '@/lib/psychTest'
import { profileLinesQuery, signatureOf } from '@/lib/psychTestApi'
import { psychResultLines } from '@/lib/talkLines'
import { loadAutoSettings, proposeCareLimits } from '@/lib/settingsMapping'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

/**
 * 심리검사 답이 거의 다 같을 때(lib/psychTest.ts 의 isPsychTestReliable) 쓰는 성향 요약입니다.
 * 성향을 단정하지 않습니다. 서버(BE ProfileLines.UNSURE_LINES)가 주는 문장과 같습니다.
 */
const UNSURE_TRAIT_LINES = [
  '답이 거의 다 같아서 아직 성향을 말하기 어려워',
  '시간 날 때 한 번 더 해 보면 더 잘 맞춰 볼게',
  '공부 기록이 쌓이면 기록으로도 같이 볼게',
]

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

/**
 * 온보딩 6번 "결과 화면" 입니다. (주소: /onboarding/result, 기획서 4.1, #389)
 * 성향 요약 3줄 + 검사로 맞춘 설정(설정마다 이유 한 줄).
 * (자기 인식 4문항 "내 가설" 줄은 2026-10-18 에 4문항과 같이 지웠습니다)
 *
 * - 성향 요약: 진짜 로그인이면 서버 AI 가 점수를 보고 쓴 문장(BE /ai/profile-lines)을 보여 줍니다.
 *   받는 동안 · 못 받으면 코드가 고른 문장(lib/onboardingCare.ts 의 getTraitSummary)을 씁니다. (2026-10-17 결정)
 * - 시안이 없어서 "준비 끝" 화면과 설정의 관리 강도 카드 모양을 따랐습니다.
 */
interface TraitListProps {
  lines: string[]
  /** 문장 아래에 붙이는 작은 안내 (예: AI 가 쓴 문장이라는 표시) */
  note?: string
}

/** 성향 요약 문장 목록 */
function TraitList({ lines, note }: TraitListProps) {
  return (
    <>
      <ul className="flex flex-col gap-2 text-sm break-keep text-slate-800 sm:text-base">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden className="text-brand">
              •
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-xs break-keep text-slate-400">{note}</p>}
    </>
  )
}

interface AiTraitListProps {
  /** 지금 검사 결과의 서명 (검사를 다시 하면 새로 받습니다) */
  signature: string
  /** AI 문장을 못 받았을 때 보여 줄 기본 문장 */
  fallbackLines: string[]
}

/**
 * 서버 AI(BE /ai/profile-lines)가 심리검사 점수를 보고 쓴 성향 요약입니다. (2026-10-17 결정: 점수는 코드, 문장은 AI)
 * 못 받으면(AI 꺼짐 · 서버 준비 전 · 실패) 에러 대신 기본 문장을 보여 줍니다. (lib/psychTestApi.ts 의 fetchProfileLines)
 */
function AiTraitList({ signature, fallbackLines }: AiTraitListProps) {
  const { data } = useSuspenseQuery(profileLinesQuery(signature))
  if (data.lines === null) return <TraitList lines={fallbackLines} />
  return <TraitList lines={data.lines} note="AI 가 내 답을 읽고 쓴 문장이에요." />
}

export function OnboardingResultPage() {
  const navigate = useNavigate()
  // 진짜 로그인일 때만 서버(AI)를 부릅니다. 테스트 로그인은 기본 문장만 보여 줍니다.
  const isServerData = useIsServerData()
  const [psychTest] = useState(loadPsychTest)
  const [settingLines] = useState(getTestSettingLines)
  const [limits] = useState(getCareLimits)
  const [proposal] = useState(() => proposeCareLimits(loadScaleLevels()))
  const [isConsented] = useState(hasCareConsent)

  // 앞 단계(심리검사 · 관리 설정)를 안 끝내고 주소로 들어왔으면 이어 할 자리로 보냅니다.
  if (psychTest === undefined || !isConsented) {
    return <Navigate to={getOnboardingResumePath() ?? '/'} replace />
  }

  // 답이 거의 다 같으면 점수로 성향을 말하지 않고, 서버 AI 도 부르지 않습니다. (서버도 이때는 같은 문장을 줍니다)
  const isReliable = isPsychTestReliable(psychTest.answers)
  const traitLines = isReliable ? getTraitSummary(psychTest.scores) : UNSURE_TRAIT_LINES
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
          {/* 진짜 로그인이면 서버 AI 가 쓴 문장을, 받는 동안 · 못 받으면 코드가 고른 기본 문장을 보여 줍니다 */}
          {isServerData && isReliable ? (
            <Suspense
              fallback={<TraitList lines={traitLines} note="AI 가 답을 더 자세히 읽는 중이에요…" />}
            >
              <AiTraitList signature={signatureOf(psychTest)} fallbackLines={traitLines} />
            </Suspense>
          ) : (
            <TraitList lines={traitLines} />
          )}
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" className="w-full sm:w-auto" onClick={handleStart}>
            시작하기
          </Button>
          {/* 결과를 들고 상담 방에서 "이건 진짜 나다 / 아닌데" 를 코치와 이야기합니다. (#582)
              온보딩이 아직 남았으면 남은 자리로 먼저 갑니다. (대화는 10분 안에 상담 방을 열면 이어짐) */}
          <TalkButton
            about={{
              kind: 'PSYCH_RESULT',
              lines: psychResultLines(psychTest.scores, isReliable),
            }}
            label="💬 검사 결과 이야기할래"
            onBeforeTalk={() => {
              markOnboardingResultSeen()
              return getOnboardingResumePath()
            }}
          />
        </div>
      </div>
    </PlainLayout>
  )
}
