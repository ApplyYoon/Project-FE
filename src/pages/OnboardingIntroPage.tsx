import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { OnboardingExitButton } from '@/components/ui/OnboardingExitButton'
import { OnboardingStepper } from '@/components/ui/OnboardingStepper'
import { StickyActionBar } from '@/components/ui/StickyActionBar'
import {
  getOnboardingResumePath,
  markOnboardingIntroSeen,
  markResumeAsked,
} from '@/lib/onboardingProgress'
import { useNavigate } from 'react-router-dom'

/** 온보딩에서 하는 일. 화면에 이 순서로 보입니다. (기획서 4.1) */
const ONBOARDING_ITEMS = [
  '학년 하나 고르기',
  '나에 대한 문장 35개에 1 ~ 7 로 답하기',
  '관리 세기 확인하기 (검사 결과로 미리 채워 둬요)',
]

/**
 * 온보딩 맨 처음의 앱 소개 한 장입니다. (기획서 4.1 1번, #388)
 * [시작하기] 를 누르면 봤다고 적어 두고 온보딩의 다음 단계(학년)로 갑니다. (순서: lib/onboardingProgress.ts)
 */
export function OnboardingIntroPage() {
  const navigate = useNavigate()

  function handleStart() {
    markOnboardingIntroSeen()
    // 이번 접속에서 온보딩을 시작했다고 적어 둡니다. 그래야 같은 접속 안에서 로고·홈을 눌렀을 때
    // "이어하기 / 처음부터 다시" 를 묻지 않고 하던 자리로 바로 갑니다. (RequireAuth)
    markResumeAsked()
    navigate(getOnboardingResumePath() ?? '/')
  }

  return (
    <PlainLayout headerAction={<OnboardingExitButton />}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <OnboardingStepper current={1} />
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight break-keep">
            이 앱은 너를 분석하는 앱이야.
          </h1>
          <p className="mt-3 max-w-prose text-[15px] break-keep text-slate-600">
            사실과 다른 기록은 네 분석만 틀어지게 해. 잘한 날도 못한 날도 있는 그대로 남겨 줘.
          </p>
        </div>

        <Card title="3분이면 끝나요">
          <ol className="flex flex-col gap-2 text-[15px] break-keep text-slate-700">
            {ONBOARDING_ITEMS.map((item, index) => (
              <li key={item} className="flex gap-2">
                <span className="font-semibold text-slate-900 tabular-nums">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[13px] break-keep text-slate-500">
            답을 보고 알림 · 타이머 · 관리 강도의 처음 설정을 맞춰 둘게요.
          </p>
        </Card>

        {/* 1순위 버튼은 엄지가 닿는 화면 아래에 붙여 둡니다. */}
        <StickyActionBar>
          <Button size="lg" className="w-full sm:w-auto sm:self-start" onClick={handleStart}>
            시작하기
          </Button>
        </StickyActionBar>
      </div>
    </PlainLayout>
  )
}
