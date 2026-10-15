import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SchoolField } from '@/components/ui/SchoolField'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import {
  changePassword,
  getAccountErrorMessage,
  profileQuery,
  updateProfile,
  withdraw,
  type Profile,
} from '@/lib/accountApi'
import type { School } from '@/lib/schoolSearch'
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  getNameError,
  getNicknameError,
  getPasswordConfirmError,
  getPasswordError,
  updateSavedSignupProfile,
} from '@/lib/signup'
import { removeAllData } from '@/lib/storage'
import { testUser } from '@/lib/testLogin'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

/**
 * 내 계정 화면입니다. 설정의 계정 카드에서 들어옵니다. (주소 /settings/account · #296)
 *   내 정보 고치기 · 비밀번호 바꾸기 · 탈퇴
 *
 * 내 정보는 서버에서 받아옵니다. 받아오는 동안에는 스켈레톤, 실패하면 안내를 AsyncBoundary 가 보여줍니다.
 * 테스트 로그인으로 들어온 사람은 서버에 계정이 없어서, 서버를 부르지 않고 안내만 보여줍니다.
 */
export function AccountPage() {
  const { user } = useAuth()
  // 테스트 로그인으로 들어온 사람인지. (lib/testLogin.ts)
  const isTestUser = user?.id === testUser.id

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* h-11 = 44px: 손가락으로 누르기 쉬운 높이 */}
        <Link
          to="/settings"
          className="text-brand mb-2 inline-flex h-11 items-center gap-1 text-sm font-medium hover:underline"
        >
          <span aria-hidden>‹</span> 설정
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">내 계정</h1>
        <p className="mt-2 break-keep text-slate-600">
          내 정보를 고치고, 비밀번호를 바꾸고, 탈퇴할 수 있어요.
        </p>
      </div>

      {isTestUser ? (
        <Card title="테스트 계정이에요">
          <p className="text-sm break-keep text-slate-600">
            테스트 계정은 서버에 계정이 없어서 고칠 정보가 없어요. 구글로 가입하면 내 정보를 고치고
            탈퇴할 수 있어요.
          </p>
        </Card>
      ) : (
        <AsyncBoundary
          pendingFallback={<AccountSkeleton />}
          errorMessage="내 정보를 받아오지 못했어요. 잠시 후 다시 시도해 주세요."
        >
          <AccountSections />
        </AsyncBoundary>
      )}
    </div>
  )
}

/** 내 정보를 받아오는 동안 보여주는 자리 표시입니다. 카드 세 장의 대략적인 높이로 그립니다. */
function AccountSkeleton() {
  return (
    // role="status": "받아오는 중" 이라는 것을 스크린리더에도 알려 줍니다. (회색 상자는 읽지 않습니다)
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">내 정보를 받아오는 중이에요</span>
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  )
}

/**
 * 서버에서 내 정보를 받아와서 카드 세 장을 보여줍니다.
 * useSuspenseQuery 는 받아오는 동안 이 컴포넌트를 "잠깐 멈춰" 둡니다. 그래서 여기서는 data 가 있을 때만 그리면 됩니다.
 */
function AccountSections() {
  const { data: profile } = useSuspenseQuery(profileQuery())

  return (
    <>
      <ProfileCard profile={profile} />
      <PasswordCard />
      <WithdrawCard />
    </>
  )
}

interface ProfileCardProps {
  /** 서버에서 받아온 지금의 내 정보. 입력 칸의 처음 값으로 씁니다. */
  profile: Profile
}

/** 내 정보(이름 · 닉네임 · 학교 · 일기 분석 동의)를 고치는 카드입니다. 이메일은 보여주기만 합니다. */
function ProfileCard({ profile }: ProfileCardProps) {
  const queryClient = useQueryClient()
  const { user, token, login } = useAuth()

  // 고치는 중인 값입니다. 받아온 값을 그대로 보여주는 것이 아니라 "입력 칸의 상태" 라서 따로 둡니다.
  const [name, setName] = useState(profile.name)
  const [nickname, setNickname] = useState(profile.nickname)
  const [school, setSchool] = useState<School | null>(
    // 서버는 학교의 번호와 이름만 가지고 있습니다. 주소는 없어서 빈 글자로 둡니다.
    profile.schoolCode !== null && profile.schoolName !== null
      ? { code: profile.schoolCode, name: profile.schoolName, region: '', address: '' }
      : null,
  )
  const [diaryAnalysis, setDiaryAnalysis] = useState(profile.diaryAnalysis)
  // 저장에 성공했는지. 성공 안내를 보여주고, 값을 다시 고치기 시작하면 지웁니다.
  const [isSaved, setIsSaved] = useState(false)

  const nameError = getNameError(name)
  const nicknameError = getNicknameError(nickname)

  // useMutation: 서버의 값을 "바꾸는" 요청에 씁니다. isPending(보내는 중)과 error(실패)를 대신 관리해 줍니다. (docs/DATA-FETCHING.md 5장)
  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      // 보관해 둔 내 정보를 "낡았다" 고 표시해서 다시 받아오게 합니다.
      void queryClient.invalidateQueries({ queryKey: profileQuery().queryKey })
      // 이 기기에 저장해 둔 가입 정보와 로그인한 사람의 이름도 맞춥니다. (설정의 계정 카드가 이 값을 보여줍니다)
      updateSavedSignupProfile({ name: updated.name, nickname: updated.nickname, school })
      if (user !== null && token !== null) login({ ...user, name: updated.nickname }, token)
      setIsSaved(true)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // form 이 기본으로 하는 "페이지 새로고침" 을 막습니다.
    event.preventDefault()
    if (nameError !== null || nicknameError !== null || mutation.isPending) return
    setIsSaved(false)
    mutation.mutate({
      name: name.trim(),
      nickname: nickname.trim(),
      schoolCode: school?.code ?? null,
      schoolName: school?.name ?? null,
      diaryAnalysis,
    })
  }

  return (
    <Card title="내 정보">
      {/* noValidate: 브라우저의 기본 안내 풍선 대신, 아래의 우리 안내 문구를 씁니다. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-slate-700">이메일</p>
          {/* break-all: 긴 이메일이 화면 밖으로 나가지 않게 줄바꿈합니다. */}
          <p className="text-base break-all text-slate-900">{profile.email}</p>
          <p className="text-sm break-keep text-slate-500">
            로그인에 쓰는 주소라서 지금은 바꿀 수 없어요.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Input
            id="account-name"
            label="이름"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="name"
            error={nameError ?? undefined}
            onChange={(event) => {
              setName(event.target.value)
              setIsSaved(false)
            }}
            className="h-12 text-base"
          />
          <p className="text-sm text-slate-500">
            실제 이름이에요. ({NAME_MIN_LENGTH}~{NAME_MAX_LENGTH}자)
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Input
            id="account-nickname"
            label="닉네임"
            value={nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            error={nicknameError ?? undefined}
            onChange={(event) => {
              setNickname(event.target.value)
              setIsSaved(false)
            }}
            className="h-12 text-base"
          />
          <p className="text-sm text-slate-500">
            앱에서 부르는 이름이에요. ({NICKNAME_MIN_LENGTH}~{NICKNAME_MAX_LENGTH}자)
          </p>
        </div>

        <SchoolField
          school={school}
          onChange={(next) => {
            setSchool(next)
            setIsSaved(false)
          }}
        />

        {/* 선택 동의는 언제든 켜고 끌 수 있어야 합니다. min-h-12: 줄 전체가 누르는 영역입니다. */}
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">
              일기·감정 기록을 분석에 쓰기 (선택)
            </span>
            <span className="text-sm break-keep text-slate-500">
              끄면 일기와 기분은 나만 보고, 분석에는 쓰지 않아요.
            </span>
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={diaryAnalysis}
              onChange={(event) => {
                setDiaryAnalysis(event.target.checked)
                setIsSaved(false)
              }}
              aria-label="일기·감정 기록을 분석에 쓰기"
              className="accent-brand h-5 w-5 cursor-pointer"
            />
          </span>
        </label>

        {/* role="alert": 안내가 뜨면 스크린리더가 바로 읽어 줍니다. */}
        {mutation.isError && (
          <p role="alert" className="text-sm break-keep text-red-600">
            {getAccountErrorMessage(mutation.error)}
          </p>
        )}
        {isSaved && (
          <p role="status" className="text-sm font-medium break-keep text-emerald-700">
            저장했어요.
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto sm:self-end"
          disabled={nameError !== null || nicknameError !== null || mutation.isPending}
        >
          {mutation.isPending ? '저장하는 중…' : '저장'}
        </Button>
      </form>
    </Card>
  )
}

/** 비밀번호를 바꾸는 카드입니다. 적은 비밀번호는 서버로 보내기만 하고 어디에도 저장하지 않습니다. */
function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  // "바꾸기" 를 한 번이라도 눌렀는지. 누르기 전에는 빈 칸에 빨간 글씨를 보여주지 않습니다.
  const [isTried, setIsTried] = useState(false)
  const [isChanged, setIsChanged] = useState(false)

  const currentError = currentPassword === '' ? '지금 비밀번호를 입력해 주세요.' : null
  const newError = getPasswordError(newPassword)
  const confirmError = getPasswordConfirmError(newPassword, confirm)

  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      // 바꾼 뒤에는 칸을 비웁니다. 비밀번호가 화면에 남아 있지 않게 합니다.
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      setIsTried(false)
      setIsChanged(true)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsTried(true)
    setIsChanged(false)
    if (currentError !== null || newError !== null || confirmError !== null) return
    if (mutation.isPending) return
    mutation.mutate()
  }

  return (
    <Card title="비밀번호 바꾸기">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm break-keep text-slate-500">
          바꾸면 이 기기는 그대로 로그인돼 있고, 다른 기기에서는 로그아웃돼요.
        </p>
        <Input
          id="account-current-password"
          // type="password": 적은 글자가 점(●)으로 가려집니다.
          type="password"
          label="지금 비밀번호"
          value={currentPassword}
          autoComplete="current-password"
          error={isTried ? (currentError ?? undefined) : undefined}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="h-12 text-base"
        />
        <div className="flex flex-col gap-2">
          <Input
            id="account-new-password"
            type="password"
            label="새 비밀번호"
            value={newPassword}
            // new-password: 브라우저가 "새 비밀번호" 로 알고 저장을 물어봅니다.
            autoComplete="new-password"
            error={isTried ? (newError ?? undefined) : undefined}
            onChange={(event) => setNewPassword(event.target.value)}
            className="h-12 text-base"
          />
          <p className="text-sm text-slate-500">
            {PASSWORD_MIN_LENGTH}자 이상, 영문과 숫자를 모두 넣어 주세요.
          </p>
        </div>
        <Input
          id="account-new-password-confirm"
          type="password"
          label="새 비밀번호 확인"
          value={confirm}
          autoComplete="new-password"
          error={isTried ? (confirmError ?? undefined) : undefined}
          onChange={(event) => setConfirm(event.target.value)}
          className="h-12 text-base"
        />

        {mutation.isError && (
          <p role="alert" className="text-sm break-keep text-red-600">
            {getAccountErrorMessage(mutation.error)}
          </p>
        )}
        {isChanged && (
          <p role="status" className="text-sm font-medium break-keep text-emerald-700">
            비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요.
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          variant="secondary"
          className="w-full sm:w-auto sm:self-end"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </Button>
      </form>
    </Card>
  )
}

/** 탈퇴 카드입니다. 되돌릴 수 없는 일이라, 확인 창에서 비밀번호를 한 번 더 받습니다. */
function WithdrawCard() {
  const [isOpen, setIsOpen] = useState(false)
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => withdraw(password),
    onSuccess: () => {
      // 서버의 계정이 지워졌으니, 이 기기에 저장된 것도 전부 지웁니다. (로그인 정보 · 기록 · 설정 · 다짐 녹음)
      removeAllData()
      // 화면을 통째로 새로 엽니다. 그냥 주소만 옮기면, 화면이 기억하고 있던 값이 저장소에 다시 적힐 수 있기 때문입니다.
      // replace: 뒤로 가기로 이 화면에 돌아오지 못하게 합니다.
      window.location.replace('/login')
    },
  })

  function handleClose() {
    if (mutation.isPending) return
    setIsOpen(false)
    setPassword('')
    mutation.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password === '' || mutation.isPending) return
    mutation.mutate()
  }

  return (
    <Card title="탈퇴">
      <p className="text-sm break-keep text-slate-600">
        탈퇴하면 서버의 계정과 기록, 이 기기에 저장된 기록이 모두 지워져요. 되돌릴 수 없어요.
      </p>
      <Button
        variant="danger"
        size="lg"
        className="mt-4 w-full sm:w-auto"
        onClick={() => setIsOpen(true)}
      >
        탈퇴하기
      </Button>

      <Modal isOpen={isOpen} onClose={handleClose} title="정말 탈퇴할까요?">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-sm break-keep text-slate-600">
            계정과 모든 기록이 지워지고 되돌릴 수 없어요. 같은 이메일로 다시 가입할 수는 있어요.
          </p>
          <Input
            id="account-withdraw-password"
            type="password"
            label="비밀번호를 한 번 더 입력해 주세요"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 text-base"
          />
          {mutation.isError && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {getAccountErrorMessage(mutation.error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={password === '' || mutation.isPending}
            >
              {mutation.isPending ? '탈퇴하는 중…' : '탈퇴하기'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}
