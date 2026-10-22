import { PlainLayout } from '@/components/layout/PlainLayout'
import { StickyActionBar } from '@/components/ui/StickyActionBar'
import { Button } from '@/components/ui/Button'
import { OnboardingExitButton } from '@/components/ui/OnboardingExitButton'
import { cn } from '@/lib/cn'
import {
  getOnboardingResumePath,
  getOnboardingStages,
  markResumeAsked,
  resetOnboarding,
} from '@/lib/onboardingProgress'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

/**
 * 온보딩을 하다 만 사람이 다음에 들어왔을 때 "이어하기 / 처음부터 다시" 를 고르는 화면입니다. (주소: /onboarding/resume)
 *
 * - RequireAuth 가 보냅니다. 하다 만 게 있고, 이번 접속에서 아직 안 물었을 때만 옵니다.
 * - 고르면 이번 접속에서는 다시 묻지 않습니다. 로고를 눌러도 하던 자리로 바로 갑니다.
 * - 시안이 없어서 "준비 끝" 화면의 모양(가운데 제목 · 단계 카드 · 아래 큰 버튼)을 따랐습니다.
 */
export function OnboardingResumePage() {
  const navigate = useNavigate()
  // 화면을 여는 순간의 값으로 고정합니다. (고르는 동안 바뀌지 않습니다)
  const [resumePath] = useState(getOnboardingResumePath)
  const [stages] = useState(getOnboardingStages)

  // 이미 다 끝낸 사람은 고를 것이 없으니 홈으로 보냅니다.
  if (resumePath === null) return <Navigate to="/" replace />

  // 끝나지 않은 첫 단계 = 멈춘 곳
  const stoppedIndex = stages.findIndex((stage) => !stage.isDone)

  function handleContinue() {
    markResumeAsked()
    // resumePath 는 위에서 null 이 아닌 것을 확인했습니다.
    if (resumePath !== null) navigate(resumePath)
  }

  function handleRestart() {
    // window.confirm 은 브라우저 기본 확인창입니다. "확인" 을 누르면 true, "취소" 면 false 를 돌려줍니다.
    if (!window.confirm('지금까지 고른 답을 지우고 처음부터 다시 할까요?')) return
    resetOnboarding()
    markResumeAsked()
    // 지운 뒤의 첫 단계(앱 소개)로 갑니다. 순서는 lib/onboardingProgress.ts 의 STAGES 가 정합니다.
    navigate(getOnboardingResumePath() ?? '/')
  }

  return (
    <PlainLayout headerAction={<OnboardingExitButton />}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="text-center">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight break-keep">
            지난번에 하던 곳이 있어요
          </h1>
          <p className="mt-2 text-[15px] break-keep text-slate-600">
            이어서 하면 멈춘 곳부터 시작해요. 처음부터 다시 해도 돼요.
          </p>
        </div>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-[17px] font-semibold text-slate-900">어디까지 했나요</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {stages.map((stage, index) => (
              <li key={stage.label} className="flex items-center gap-3">
                {/* 멈춘 단계만 테두리를 둘러 "여기서부터" 임을 보여줍니다. 끝낸 단계는 ✓ 로 바꿉니다.
                    brand 로 꽉 채우는 것은 [이어하기] 버튼만입니다. (2차 규칙 1) */}
                <span
                  aria-hidden
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                    index === stoppedIndex
                      ? 'bg-brand-light text-brand ring-brand ring-2'
                      : stage.isDone
                        ? 'bg-brand-light text-brand'
                        : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {stage.isDone ? '✓' : index + 1}
                </span>
                <p className="text-[15px] break-keep text-slate-700">
                  <strong className="font-semibold text-slate-900">{stage.label}</strong>
                  {stage.isDone && <span className="text-slate-500"> — 했어요</span>}
                  {index === stoppedIndex && (
                    <span className="text-brand font-semibold"> — 여기서 멈췄어요</span>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* 1순위 [이어하기] 는 엄지 자리에 크게, 답을 지우는 [처음부터 다시] 는 아래에 작은 빨간 글자로 둡니다.
            (되돌리기 어려운 행동은 실수로 누르기 어렵게, 2차 규칙 3) */}
        <StickyActionBar className="gap-3">
          <Button size="lg" className="w-full" onClick={handleContinue}>
            이어하기
          </Button>
          <Button
            variant="ghost"
            className="w-full text-red-700 hover:bg-red-50"
            onClick={handleRestart}
          >
            처음부터 다시
          </Button>
        </StickyActionBar>
      </div>
    </PlainLayout>
  )
}
