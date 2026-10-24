import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { StickyActionBar } from '@/components/ui/StickyActionBar'
import { useQueryParam } from '@/hooks/useQueryParam'
import {
  answerChecksQuery,
  sendAnswerCheck,
  type AnswerCheckMode,
  type AnswerCheckSendResult,
} from '@/lib/answerChecksApi'
import { ApiError, getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { getTodayKey } from '@/lib/date'
import { YOUTH_HELP_LINE } from '@/lib/helpLines'
import { shrinkPhoto } from '@/lib/photoCards'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'

/** 주소의 ?mode= 값 → 서버에 보내는 값. 주소는 누구나 고칠 수 있어서, 이 두 값이 아니면 "아직 안 고름" 으로 봅니다. */
const MODE_BY_PARAM: Record<string, AnswerCheckMode> = {
  marked: 'MARKED',
  unmarked: 'UNMARKED',
}

/** 고르는 칸 두 개 */
const MODE_OPTIONS = [
  { param: 'marked', title: '채점했어요', detail: 'O · X 표시가 있는 페이지' },
  { param: 'unmarked', title: '아직 안 했어요', detail: '답만 적은 페이지, AI 가 풀어요' },
]

/** 찍기 화면의 안내 한 줄 */
const TAKE_GUIDE: Record<AnswerCheckMode, string> = {
  MARKED: '문제 번호와 O · X 표시가 한 장에 다 나오게 찍어 주세요.',
  UNMARKED: '문제와 내가 적은 답이 같이 보이게 찍어 주세요.',
}

/**
 * 사진을 보내다 실패했을 때 보여 줄 한 줄.
 * 서버에 이 기능이 아직 배포되지 않았으면 404 라서 "곧 열려요" 로 알려 줍니다.
 */
function getSendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return '사진 채점은 서버 준비가 끝나면 열려요. 조금만 기다려 주세요.'
  }
  return getApiErrorMessage(error)
}

/** 찍은 사진 (이 화면의 메모리에만 있습니다) */
interface Photo {
  file: File
  /** 미리보기 주소 (URL.createObjectURL) */
  url: string
}

/**
 * 폰에서 사진으로 채점하기 화면입니다. (주소: /records/answer-check · 2026-10-24)
 * PC 기록 탭의 QR 을 폰 카메라로 찍으면 이 주소가 열립니다. 로그인 안 했으면 로그인한 뒤 여기로 돌아옵니다. (RequireAuth)
 *
 *   1. 어떤 사진인지 고릅니다. (채점했어요 / 아직 안 했어요) → 주소에 ?mode= 로 둡니다.
 *   2. [사진 찍기] 또는 [앨범에서 고르기]
 *   3. 미리보기를 보고 [채점 보내기] → 끝나면 "PC 화면을 보세요"
 *
 * ⚠️ 사진은 저장하지 않습니다. 미리보기도 이 화면의 메모리에만 있고, 보내고 나면 바로 지웁니다.
 *    그래서 사진을 고른 뒤의 단계는 주소에 두지 않습니다. 새로고침하면 사진이 없어서 찍기부터 다시 하는 게 맞습니다.
 */
export function AnswerCheckPage() {
  const queryClient = useQueryClient()
  const [todayKey] = useState(getTodayKey)
  const [modeParam, setModeParam] = useQueryParam('mode', '')
  const mode: AnswerCheckMode | null = MODE_BY_PARAM[modeParam] ?? null

  // 1단계에서 누른 칸 (아직 [다음] 을 누르기 전)
  const [picked, setPicked] = useState<string | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)

  // 미리보기 주소는 다 쓰면 돌려줍니다. (메모리가 남지 않게)
  useEffect(() => {
    if (photo === null) return
    return () => URL.revokeObjectURL(photo.url)
  }, [photo])

  const send = useMutation({
    mutationFn: async (input: { file: File; mode: AnswerCheckMode }) => {
      const image = await shrinkPhoto(input.file)
      return sendAnswerCheck({ mode: input.mode, image, date: todayKey })
    },
    onSuccess: () => {
      // 사진은 채점 뒤 바로 버립니다.
      setPhoto(null)
      // 같은 폰에서 기록 탭을 열어도 새 결과가 보이게 합니다.
      void queryClient.invalidateQueries({ queryKey: answerChecksQuery(todayKey).queryKey })
    },
  })

  function handleNext() {
    if (picked !== null) setModeParam(picked)
  }

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 사진을 다시 골라도 다시 읽게 비워 둡니다.
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPickError('사진 파일만 고를 수 있어요.')
      return
    }
    setPickError(null)
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  function handleSend() {
    if (photo === null || mode === null) return
    send.mutate({ file: photo.file, mode })
  }

  /** [다시 찍기]: 사진을 지우고 찍기 단계로 */
  function handleRetake() {
    setPhoto(null)
    send.reset()
  }

  /** [한 장 더 올리기]: 처음(어떤 사진인지 고르기)으로 */
  function handleAnother() {
    setPhoto(null)
    setPicked(null)
    send.reset()
    setModeParam('')
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <Link
          to="/records"
          className="text-brand mb-1 inline-flex h-11 items-center gap-1 text-sm font-medium hover:underline"
        >
          <span aria-hidden>‹</span> 기록
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">사진 채점</h1>
      </div>

      {/* 1. 어떤 사진인지 고르기 */}
      {mode === null && (
        <>
          <h2 className="text-[20px] font-bold tracking-tight break-keep text-slate-900">
            어떤 사진을 올릴까요?
          </h2>
          <div role="radiogroup" aria-label="올릴 사진 종류" className="flex flex-col gap-3">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.param}
                type="button"
                role="radio"
                aria-checked={picked === option.param}
                onClick={() => setPicked(option.param)}
                className={cn(
                  'flex min-h-16 w-full cursor-pointer flex-col items-start gap-1 rounded-2xl bg-white px-5 py-4 text-left ring-1 ring-slate-200 transition',
                  picked === option.param && 'bg-brand-light ring-brand ring-2',
                )}
              >
                <span className="text-[17px] font-semibold break-keep text-slate-900">
                  {option.title}
                </span>
                <span className="text-sm break-keep text-slate-500">{option.detail}</span>
              </button>
            ))}
          </div>
          <StickyActionBar aboveTabBar>
            <Button size="lg" className="w-full" disabled={picked === null} onClick={handleNext}>
              다음
            </Button>
          </StickyActionBar>
        </>
      )}

      {/* 2. 찍기 */}
      {mode !== null && photo === null && !send.isSuccess && (
        <>
          <p className="rounded-2xl bg-white px-5 py-4 text-[17px] font-semibold break-keep text-slate-900">
            {TAKE_GUIDE[mode]}
          </p>
          <p className="rounded-2xl bg-slate-200/60 px-4 py-3 text-sm break-keep text-slate-600">
            🔒 사진은 채점 뒤 바로 버려요. 이름 · 학번이 보이면 가리고 찍어 주세요.
          </p>
          {pickError && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {pickError}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            {/* label 로 감싸서 버튼처럼 누르면 파일 고르기가 열립니다. capture 는 [사진 찍기] 에만 (바로 카메라) */}
            <label className="bg-brand flex h-14 cursor-pointer items-center justify-center rounded-2xl px-3 text-[17px] font-semibold whitespace-nowrap text-white active:scale-[0.98]">
              📷 사진 찍기
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handlePick}
              />
            </label>
            <label className="flex h-14 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-[17px] font-semibold whitespace-nowrap text-slate-900 active:scale-[0.98]">
              🖼 앨범에서 고르기
              <input type="file" accept="image/*" className="sr-only" onChange={handlePick} />
            </label>
          </div>
        </>
      )}

      {/* 3. 확인 · 보내기 */}
      {mode !== null && photo !== null && (
        <>
          <img
            src={photo.url}
            alt="찍은 사진 미리보기"
            className="max-h-[55dvh] w-full max-w-full rounded-2xl bg-white object-contain"
          />
          {send.isPending && (
            <p role="status" className="text-center text-[15px] font-medium text-slate-700">
              채점하는 중 (최대 25초)
            </p>
          )}
          {send.isError && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {getSendErrorMessage(send.error)}
            </p>
          )}
          <StickyActionBar aboveTabBar>
            <Button size="lg" className="w-full" disabled={send.isPending} onClick={handleSend}>
              채점 보내기
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={send.isPending}
              onClick={handleRetake}
            >
              다시 찍기
            </Button>
          </StickyActionBar>
        </>
      )}

      {/* 4. 보낸 뒤 */}
      {mode !== null && send.isSuccess && (
        <SendOutcome result={send.data} onRetake={handleRetake} onAnother={handleAnother} />
      )}
    </div>
  )
}

interface SendOutcomeProps {
  result: AnswerCheckSendResult
  onRetake: () => void
  onAnother: () => void
}

/** 보낸 뒤의 안내. 위기 표현이 있었으면 상담 전화 안내를 먼저 보여 줍니다. (사진으로 카드 만들기와 같은 한 줄) */
function SendOutcome({ result, onRetake, onAnother }: SendOutcomeProps) {
  const message =
    result.check !== null
      ? '끝났어요. PC 화면을 보세요'
      : result.reason === 'NOT_PROBLEM'
        ? '문제를 못 읽었어요. 다시 찍어 주세요'
        : '지금은 채점할 수 없어요. 나중에 다시 해 주세요'

  return (
    <>
      {result.showHelp && (
        <a
          href={`tel:${YOUTH_HELP_LINE.number}`}
          className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-2 text-sm"
        >
          <span className="break-keep text-slate-700">
            지금 이야기할 곳: {YOUTH_HELP_LINE.name} · {YOUTH_HELP_LINE.detail}
          </span>
          <span className="text-brand font-semibold">{YOUTH_HELP_LINE.number}</span>
        </a>
      )}
      <p
        role="status"
        className="rounded-2xl bg-white px-5 py-6 text-center text-[20px] font-bold break-keep text-slate-900"
      >
        {message}
      </p>
      <StickyActionBar aboveTabBar>
        {result.check === null && result.reason === 'NOT_PROBLEM' ? (
          <Button size="lg" className="w-full" onClick={onRetake}>
            다시 찍기
          </Button>
        ) : (
          <Button variant="outline" size="lg" className="w-full" onClick={onAnother}>
            한 장 더 올리기
          </Button>
        )}
      </StickyActionBar>
    </>
  )
}
