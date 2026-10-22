import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StickyActionBar } from '@/components/ui/StickyActionBar'
import { useCards } from '@/hooks/useCards'
import { useIsServerData } from '@/hooks/useIsServerData'
import { ApiError, getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { getTodayKey } from '@/lib/date'
import { YOUTH_HELP_LINE } from '@/lib/helpLines'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import {
  draftToCard,
  getDemoPhotoCards,
  requestCardsFromPhoto,
  shrinkPhoto,
  type PhotoCardDraft,
  type PhotoCardsResult,
} from '@/lib/photoCards'
import { gradeNumberOf } from '@/lib/schoolEvents'
import { loadSchoolClass, schoolTodayOrNullQuery } from '@/lib/schoolToday'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

// AI 가 시각을 못 정한 카드에 처음 넣어 두는 시각 (학생이 바꿀 수 있음)
const DEFAULT_START_TIME = '19:00'
// 요일 이름 (0 = 일요일)
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** '2026-10-19' → '10/19 (월)' */
function formatDay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()]
  return `${month}/${day} (${weekday})`
}

/**
 * 사진 읽기가 실패했을 때 보여 줄 한 줄.
 * 서버에 이 기능(BE /ai/cards/from-photo)이 아직 배포되지 않았으면 404 라서 "곧 열려요" 로 알려 줍니다.
 */
function getReadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return '사진으로 만들기는 서버 준비가 끝나면 열려요. 지금은 [+ 카드 만들기] 로 만들어 주세요.'
  }
  return getApiErrorMessage(error)
}

/** 초안 한 장을 화면에서 고칠 수 있게 담는 모양 */
interface DraftRow extends PhotoCardDraft {
  /** 카드로 만들지 */
  picked: boolean
  /** 화면에서 고른 시작 시각 (AI 가 정했으면 그 값) */
  time: string
}

/**
 * 시험 범위 사진으로 카드 만들기 화면입니다. (주소: /cards/photo · 2026-10-18)
 *
 *   1. 시험 날짜(학교 학사일정에서 미리 채움) · 메모를 정하고 [📷 사진 찍기] 또는 [🖼 앨범에서] 를 누릅니다.
 *   2. 사진을 줄여서 AI 에 보냅니다. 테스트 로그인은 서버 대신 시연용 예시를 보여 줍니다.
 *   3. AI 가 시험 전날까지 나눈 카드 초안을 고르고(제목 · 시각을 고칠 수 있음) [카드 N장 만들기] 를 누릅니다.
 *
 * ⚠️ 사진은 저장하지 않습니다. 미리보기도 이 화면의 메모리에만 있고, 화면을 떠나면 사라집니다.
 *    그래서 "지금 몇 단계인지" 도 주소에 두지 않습니다. 새로고침하면 사진과 초안이 없어서 처음으로 돌아가는 게 맞습니다.
 */
export function CardsFromPhotoPage() {
  const navigate = useNavigate()
  const isServerData = useIsServerData()
  const { addCard } = useCards()
  const [todayKey] = useState(getTodayKey)

  // 시험 날짜 칸을 미리 채우려고 오늘 학교 정보(학사일정)를 읽습니다. 못 받으면 null 이라 빈칸으로 둡니다.
  const [schoolClass] = useState(loadSchoolClass)
  const { data: school } = useSuspenseQuery(
    schoolTodayOrNullQuery(schoolClass, isServerData, todayKey),
  )
  const grade = schoolClass?.grade ?? gradeNumberOf(loadOnboardingAnswers()?.grade)
  const nextExam = (school?.events ?? []).find(
    (event) =>
      event.exam &&
      event.dDay >= 1 &&
      (grade === null || event.grades.length === 0 || event.grades.includes(grade)),
  )

  const [examDate, setExamDate] = useState(nextExam?.date ?? '')
  const [note, setNote] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [rows, setRows] = useState<DraftRow[] | null>(null)
  const [scopeText, setScopeText] = useState<string | null>(null)
  const [isHelpShown, setIsHelpShown] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // 미리보기 주소는 다 쓰면 돌려줍니다. (메모리가 남지 않게)
  useEffect(() => {
    if (previewUrl === null) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  /** AI(또는 시연용 예시)의 답을 화면에 펼칩니다. */
  function showResult(result: PhotoCardsResult) {
    if (result.showHelp) {
      setIsHelpShown(true)
      return
    }
    if (result.drafts === null || result.drafts.length === 0) {
      setNotice(
        '사진에서 시험 범위를 읽지 못했어요. 범위표가 화면에 꽉 차게, 밝은 곳에서 다시 찍어 볼까요?',
      )
      return
    }
    setScopeText(result.scopeText)
    setRows(
      result.drafts.map((draft) => ({
        ...draft,
        picked: true,
        time: draft.startTime ?? DEFAULT_START_TIME,
      })),
    )
  }

  const read = useMutation({
    mutationFn: async (file: File) => {
      const image = await shrinkPhoto(file)
      if (!isServerData) return getDemoPhotoCards(todayKey)
      return requestCardsFromPhoto({
        image,
        date: todayKey,
        examDate: examDate !== '' && examDate >= todayKey ? examDate : null,
        note: note.trim() === '' ? null : note.trim().slice(0, 100),
      })
    },
    onSuccess: showResult,
  })

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 사진을 다시 골라도 다시 읽게 비워 둡니다.
    event.target.value = ''
    if (!file) return
    setNotice(null)
    setIsHelpShown(false)
    setRows(null)
    setPreviewUrl(URL.createObjectURL(file))
    read.mutate(file)
  }

  function updateRow(index: number, changes: Partial<DraftRow>) {
    setRows((current) =>
      current === null
        ? current
        : current.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    )
  }

  const pickedRows = (rows ?? []).filter((row) => row.picked && row.title.trim() !== '')

  function handleSave() {
    const now = Date.now()
    pickedRows.forEach((row, index) => {
      addCard(
        draftToCard(
          { ...row, title: row.title.trim() },
          { id: `card-${now}-${index}`, now, startTime: row.time },
        ),
      )
    })
    // 첫 카드의 날짜로 카드 탭을 엽니다.
    navigate(`/cards?date=${pickedRows[0]?.date ?? todayKey}`)
  }

  function handleRetake() {
    setRows(null)
    setScopeText(null)
    setNotice(null)
    setPreviewUrl(null)
    read.reset()
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        {/* 돌아가는 링크라 모바일 · PC 모두 둡니다. 이 화면은 헤더에 ‹ 뒤로를 두지 않습니다. (2026-10-22) */}
        <Link
          to="/cards"
          className="text-brand mb-1 inline-flex h-11 items-center gap-1 text-sm font-medium hover:underline"
        >
          <span aria-hidden>‹</span> 카드
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">사진으로 카드 만들기</h1>
        <p className="mt-2 max-w-prose text-[15px] break-keep text-slate-600">
          시험 범위표나 학습지를 찍으면, AI 가 시험 전날까지 공부 카드로 나눠 줘요.
        </p>
      </div>

      {rows === null && (
        <>
          <Card className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">시험 날짜 (있으면)</span>
              <input
                type="date"
                value={examDate}
                min={todayKey}
                onChange={(event) => setExamDate(event.target.value)}
                className="focus:ring-brand/30 h-12 w-full rounded-2xl bg-slate-100 px-4 text-base focus:ring-2 focus:outline-none"
              />
              {nextExam && (
                <span className="text-xs text-slate-500">
                  학사일정의 '{nextExam.name}' 날짜로 채워 뒀어요.
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">메모 (선택)</span>
              <input
                value={note}
                maxLength={100}
                onChange={(event) => setNote(event.target.value)}
                placeholder="예: 수학은 3단원부터"
                className="focus:ring-brand/30 h-12 w-full rounded-2xl bg-slate-100 px-4 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
              />
            </label>
          </Card>

          <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm break-keep text-slate-600">
            🔒 사진은 저장하지 않아요. AI 가 읽고 바로 버려요. 이름 · 학번이 보이면 가리고 찍어
            주세요.
          </p>

          {previewUrl !== null && read.isPending && (
            <div role="status" className="flex items-center gap-3 rounded-2xl bg-white p-4">
              <img
                src={previewUrl}
                alt="고른 사진"
                className="size-16 max-w-full shrink-0 rounded-xl object-cover"
              />
              <p className="text-sm font-medium text-slate-700">AI 가 시험 범위를 읽고 있어요…</p>
            </div>
          )}

          {read.isError && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {getReadErrorMessage(read.error)}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm break-keep text-amber-700">
              {notice}
            </p>
          )}
          {isHelpShown && (
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

          <div className="grid grid-cols-2 gap-3">
            {/* label 로 감싸서 버튼처럼 누르면 파일 고르기가 열립니다. capture 는 [사진 찍기] 에만 (바로 카메라) */}
            <label
              className={cn(
                'bg-brand flex h-14 cursor-pointer items-center justify-center rounded-2xl text-[17px] font-semibold text-white active:scale-[0.98]',
                read.isPending && 'pointer-events-none opacity-50',
              )}
            >
              📷 사진 찍기
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handlePick}
              />
            </label>
            <label
              className={cn(
                'flex h-14 cursor-pointer items-center justify-center rounded-2xl bg-white text-[17px] font-semibold text-slate-900 ring-1 ring-slate-200 active:scale-[0.98]',
                read.isPending && 'pointer-events-none opacity-50',
              )}
            >
              🖼 앨범에서
              <input type="file" accept="image/*" className="sr-only" onChange={handlePick} />
            </label>
          </div>
        </>
      )}

      {rows !== null && (
        <>
          {!isServerData && (
            <p className="rounded-2xl bg-amber-50 px-4 py-2 text-sm break-keep text-amber-800">
              시연용 예시 — 테스트 로그인이라 AI 대신 정해 둔 초안을 보여 줘요
            </p>
          )}
          {scopeText && (
            <Card>
              <p className="text-xs font-semibold text-slate-500">AI 가 읽은 범위</p>
              <p className="mt-1 text-sm break-keep text-slate-900">{scopeText}</p>
            </Card>
          )}
          <p className="text-sm text-slate-500">만들 카드를 고르고, 제목 · 시각을 고쳐도 돼요.</p>
          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li
                key={`${row.date}-${index}`}
                className={cn(
                  'flex flex-col gap-3 rounded-2xl bg-white p-4',
                  !row.picked && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={row.picked}
                    onChange={(event) => updateRow(index, { picked: event.target.checked })}
                    aria-label={`${row.title} 카드로 만들기`}
                    className="accent-brand size-6 shrink-0"
                  />
                  <span className="text-sm font-semibold text-slate-500 tabular-nums">
                    {formatDay(row.date)}
                  </span>
                  <span className="ml-auto text-sm text-slate-500 tabular-nums">
                    {row.durationMinutes}분
                  </span>
                </div>
                <input
                  value={row.title}
                  maxLength={40}
                  onChange={(event) => updateRow(index, { title: event.target.value })}
                  aria-label="카드 제목"
                  className="focus:ring-brand/30 h-12 w-full min-w-0 rounded-2xl bg-slate-100 px-4 text-base font-semibold focus:ring-2 focus:outline-none"
                />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  시작
                  <input
                    type="time"
                    value={row.time}
                    onChange={(event) => updateRow(index, { time: event.target.value })}
                    className={cn(
                      'h-11 rounded-xl bg-slate-100 px-3 text-base tabular-nums',
                      row.startTime === null && 'ring-2 ring-amber-300',
                    )}
                  />
                  {row.startTime === null && (
                    <span className="text-xs text-amber-700">시각을 골라 주세요</span>
                  )}
                </label>
                {row.checklist.length > 0 && (
                  <p className="text-sm break-keep text-slate-500">· {row.checklist.join(' · ')}</p>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleRetake}
            className="h-11 text-sm font-medium text-slate-500 underline-offset-4 hover:underline"
          >
            다른 사진으로 다시 하기
          </button>

          {/* 주 행동은 아래에 붙입니다. 모바일에서는 하단 탭 바로 위(엄지 자리) (다른 화면과 같은 StickyActionBar) */}
          <StickyActionBar aboveTabBar>
            <Button
              size="lg"
              className="w-full"
              disabled={pickedRows.length === 0}
              onClick={handleSave}
            >
              카드 {pickedRows.length}장 만들기
            </Button>
          </StickyActionBar>
        </>
      )}
    </div>
  )
}
