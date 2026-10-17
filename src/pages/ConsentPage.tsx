import { PlainLayout } from '@/components/layout/PlainLayout'
import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { TermsView } from '@/components/ui/TermsView'
import { UnderFourteenView } from '@/components/ui/UnderFourteenView'
import { useAuth } from '@/hooks/useAuth'
import { useIsServerData } from '@/hooks/useIsServerData'
import { useQueryParam } from '@/hooks/useQueryParam'
import { ApiError, getApiErrorMessage } from '@/lib/api'
import {
  agreeConsent,
  consentStatusQuery,
  getConsentReturnPath,
  isSameConsentVersion,
} from '@/lib/consentApi'
import { toDayKey } from '@/lib/date'
import { privacyConsent, serviceTerms, type TermsDocument } from '@/lib/terms'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

/** 다시 동의할 때 체크하는 필수 세 가지. 서버에 보내는 칸 이름과 같습니다. */
interface ConsentChecks {
  terms: boolean
  privacy: boolean
  over14: boolean
}

type ConsentKey = keyof ConsentChecks

interface ConsentItem {
  key: ConsentKey
  label: string
  /** "보기" 로 여는 안내문 (lib/terms.ts). 만 14세 확인은 안내문이 없습니다. */
  terms?: TermsDocument
}

// 가입 화면(SignupPage)과 같은 문구입니다. 이 순서대로 보입니다.
const consentItems: ConsentItem[] = [
  { key: 'terms', label: '서비스 이용약관', terms: serviceTerms },
  { key: 'privacy', label: '개인정보 수집·이용', terms: privacyConsent },
  { key: 'over14', label: '만 14세 이상이에요' },
]

const noChecks: ConsentChecks = { terms: false, privacy: false, over14: false }

/**
 * 다시 동의 화면 (#512). 주소: /consent?from=돌아갈주소
 * 서버가 저장을 403 CONSENT_REQUIRED 로 막으면 여기로 옵니다. (components/layout/ConsentRequiredListener)
 * 최신 동의 문구에 동의하면 하던 화면으로 돌아갑니다. 막힌 저장은 다시 보내지 않고, 돌아가서 한 번 더 누르면 됩니다.
 * 동의하지 않아도 로그아웃 · 탈퇴(설정 › 내 계정)는 할 수 있습니다.
 */
export function ConsentPage() {
  const isServerData = useIsServerData()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [fromParam] = useQueryParam('from', '')
  const returnPath = getConsentReturnPath(fromParam === '' ? null : fromParam)
  // 만 14세 미만이라고 답했는지. 답하면 가입 때와 같은 안내 화면으로 바뀝니다.
  const [isUnderFourteen, setIsUnderFourteen] = useState(false)

  // 테스트 로그인은 서버에 동의 기록이 없어서 이 화면을 쓰지 않습니다.
  if (!isServerData) return <Navigate to={returnPath} replace />

  if (isUnderFourteen) {
    return (
      <UnderFourteenView note="계정과 기록은 그대로 있어요. 지우고 싶으면 다시 로그인해서 설정 › 내 계정에서 탈퇴할 수 있어요." />
    )
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <PlainLayout>
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 py-6 sm:py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            동의 문구를 다시 확인해 주세요
          </h1>
          <p className="break-keep text-slate-600">
            최신 동의 문구에 동의해야 기록을 저장할 수 있어요. 동의하면 하던 화면으로 돌아가요.
          </p>
        </header>

        <AsyncBoundary pendingFallback={<Skeleton className="h-72 w-full rounded-xl" />}>
          <ConsentForm returnPath={returnPath} onUnderFourteen={() => setIsUnderFourteen(true)} />
        </AsyncBoundary>

        {/* 동의하지 않아도 할 수 있는 것: 로그아웃 · 탈퇴 (보기 · 지우기는 서버가 막지 않습니다) */}
        <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <p className="text-sm break-keep text-slate-500">
            동의하지 않으면 로그아웃하거나, 내 계정에서 탈퇴할 수 있어요.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={handleLogout}>
              로그아웃
            </Button>
            <Link
              to="/settings/account"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              내 계정 · 탈퇴
            </Link>
          </div>
        </footer>
      </div>
    </PlainLayout>
  )
}

interface ConsentFormProps {
  /** 동의한 뒤에 돌아갈 주소 */
  returnPath: string
  /** "만 14세 미만이에요" 를 눌렀을 때 */
  onUnderFourteen: () => void
}

/** 내 동의 상태를 받아서, 필수 세 가지 체크와 [동의하고 계속하기] 를 보여 줍니다. */
function ConsentForm({ returnPath, onUnderFourteen }: ConsentFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: status } = useSuspenseQuery(consentStatusQuery())
  const [checks, setChecks] = useState<ConsentChecks>(noChecks)
  // "보기" 로 연 안내문
  const [openedKey, setOpenedKey] = useState<ConsentKey | null>(null)
  const openedItem = consentItems.find((item) => item.key === openedKey)
  const isAllChecked = checks.terms && checks.privacy && checks.over14

  // useMutation: 버튼을 눌렀을 때만 서버에 보내는 요청입니다. (docs/DATA-FETCHING.md 5장)
  const mutation = useMutation({
    mutationFn: agreeConsent,
    onSuccess: (next) => {
      queryClient.setQueryData(consentStatusQuery().queryKey, next)
      navigate(returnPath, { replace: true })
    },
    onError: (error) => {
      // 409 는 "문구가 바뀌었다" 또는 "이미 동의했다" 입니다. 상태를 다시 받아 보면 아래에서 알맞은 화면으로 바뀝니다.
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: consentStatusQuery().queryKey })
      }
    },
  })

  // 이미 최신 문구에 동의했으면(다른 기기에서 했거나 409 "이미 동의") 하던 화면으로 돌아갑니다.
  if (!status.needsConsent) return <Navigate to={returnPath} replace />

  // 이 앱에 든 문구가 옛 버전이면, 새로 고쳐서 최신 문구를 받아야 동의할 수 있습니다.
  if (!isSameConsentVersion(status)) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-amber-50 p-4">
        <p className="text-sm break-keep text-amber-800">
          동의 문구가 바뀌었어요. 화면을 새로 고쳐서 최신 문구를 확인해 주세요.
        </p>
        <Button variant="secondary" className="bg-white" onClick={() => window.location.reload()}>
          새로 고침
        </Button>
      </div>
    )
  }

  function handleChange(key: ConsentKey, isChecked: boolean) {
    setChecks((prev) => ({ ...prev, [key]: isChecked }))
  }

  function handleAgree() {
    if (!isAllChecked || mutation.isPending) return
    mutation.mutate()
  }

  // 409 는 위에서 화면이 바뀌므로, 그 밖의 실패만 안내합니다.
  const isConflict = mutation.error instanceof ApiError && mutation.error.status === 409
  const errorMessage =
    mutation.error !== null && !isConflict ? getApiErrorMessage(mutation.error) : null

  return (
    <div className="flex flex-col gap-4">
      {status.agreedAt !== null && (
        <p className="text-sm break-keep text-slate-500">
          마지막으로 동의한 날: {toDayKey(status.agreedAt)}
        </p>
      )}

      <fieldset className="overflow-hidden rounded-xl border border-slate-200">
        <legend className="sr-only">다시 동의하기</legend>

        <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 font-semibold">
          <input
            type="checkbox"
            checked={isAllChecked}
            onChange={(event) =>
              setChecks(
                event.target.checked ? { terms: true, privacy: true, over14: true } : noChecks,
              )
            }
            className="accent-brand h-5 w-5 shrink-0"
          />
          전체 동의
        </label>

        <ul className="divide-y divide-slate-100">
          {consentItems.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3 px-4 py-2">
              <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={checks[item.key]}
                  onChange={(event) => handleChange(item.key, event.target.checked)}
                  className="accent-brand h-5 w-5 shrink-0"
                />
                <span className="min-w-0 break-keep">
                  <span className="text-brand font-semibold">[필수]</span> {item.label}
                </span>
              </label>
              {item.terms && (
                // h-10 = 40px. 글자는 작아도 누르는 영역은 손가락으로 누를 만하게 합니다.
                <button
                  type="button"
                  onClick={() => setOpenedKey(item.key)}
                  aria-label={`${item.label} 보기`}
                  className="text-brand h-10 shrink-0 cursor-pointer px-1 text-sm underline"
                >
                  보기
                </button>
              )}
            </li>
          ))}
        </ul>
      </fieldset>

      <button
        type="button"
        onClick={onUnderFourteen}
        className="inline-flex h-10 items-center self-start text-sm text-slate-500 underline underline-offset-4"
      >
        만 14세 미만이에요
      </button>

      {errorMessage !== null && (
        <p role="alert" className="text-sm break-keep text-red-600">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button size="lg" disabled={!isAllChecked || mutation.isPending} onClick={handleAgree}>
          {mutation.isPending ? '저장하는 중…' : '동의하고 계속하기'}
        </Button>
        {!isAllChecked && (
          <p className="text-center text-sm break-keep text-slate-500">
            [필수] 세 가지에 모두 체크하면 눌러져요.
          </p>
        )}
      </div>

      <Modal
        isOpen={openedItem?.terms !== undefined}
        onClose={() => setOpenedKey(null)}
        title={openedItem?.label}
      >
        {openedItem?.terms && <TermsView terms={openedItem.terms} />}
        <Button className="mt-5 w-full" onClick={() => setOpenedKey(null)}>
          닫기
        </Button>
      </Modal>
    </div>
  )
}
