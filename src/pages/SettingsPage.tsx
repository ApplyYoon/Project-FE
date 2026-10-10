import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  CALL_TIME_STORAGE_KEY,
  getNotificationState,
  isIosWithoutInstall,
  parseCallTime,
  requestNotificationPermission,
  type NotificationState,
} from '@/lib/callReminder'
import { cn } from '@/lib/cn'
import { deleteMyData, type DeleteKind } from '@/lib/myData'
import { loadData, removeData, saveData } from '@/lib/storage'
import { useEffect, useState } from 'react'

/* 지우기 종류별 안내 문구. 새 종류가 생기면 여기에 한 줄만 더하면 됩니다. */
const deleteTexts: Record<DeleteKind, { question: string; detail: string; done: string }> = {
  diary: {
    question: '일기를 모두 지울까요?',
    detail: '쓴 일기가 전부 사라져요.',
    done: '일기를 모두 지웠어요.',
  },
  all: {
    question: '모든 기록을 지울까요?',
    detail:
      '공부 계획, 공부 기록, 진행 중인 타이머, 일기가 전부 사라져요. 과목과 로그인 정보는 그대로 남아요.',
    done: '모든 기록을 지웠어요.',
  },
}

/** 지운 결과 안내. isSuccess 가 false 면 일부를 못 지운 것입니다. */
interface DeleteMessage {
  text: string
  isSuccess: boolean
}

export function SettingsPage() {
  // 지금 확인창으로 물어보고 있는 종류. null 이면 확인창이 닫혀 있습니다.
  const [pendingKind, setPendingKind] = useState<DeleteKind | null>(null)
  const [message, setMessage] = useState<DeleteMessage | null>(null)

  // 전화 받을 시간 ('HH:MM'). 아직 안 정했으면 빈 글자입니다. 올바른 시간만 불러옵니다.
  const [callTime, setCallTime] = useState(() => {
    const saved = loadData<unknown>(CALL_TIME_STORAGE_KEY, '')
    return typeof saved === 'string' && parseCallTime(saved) !== null ? saved : ''
  })
  // 브라우저 알림 허용 상태. 처음 한 번만 읽습니다.
  const [notificationState, setNotificationState] =
    useState<NotificationState>(getNotificationState)
  // 아이폰인데 홈 화면에 추가하지 않았는지. 이 경우에만 안내를 보여줍니다.
  const [showIosGuide] = useState(isIosWithoutInstall)

  // 주소창 자물쇠에서 알림을 허용/거부하고 돌아오면 이 화면도 바뀐 상태를 다시 읽습니다.
  useEffect(() => {
    function handleFocus() {
      setNotificationState(getNotificationState())
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  function handleChangeCallTime(nextTime: string) {
    setCallTime(nextTime)
    // 시간을 고르면 바로 저장합니다. 시간을 지우면(빈 글자) 저장해 둔 것도 지워서 전화가 울리지 않게 합니다.
    if (nextTime === '') {
      removeData(CALL_TIME_STORAGE_KEY)
    } else {
      saveData(CALL_TIME_STORAGE_KEY, nextTime)
    }
  }

  // 알림 허용 창은 사용자가 버튼을 직접 눌렀을 때만 띄울 수 있습니다.
  async function handleRequestNotification() {
    setNotificationState(await requestNotificationPermission())
  }

  function handleConfirm() {
    if (pendingKind === null) return

    // 지우고 나면 정말 사라졌는지 한 번 더 확인한 결과가 돌아옵니다.
    const { isSuccess } = deleteMyData(pendingKind)
    setMessage({
      isSuccess,
      text: isSuccess
        ? deleteTexts[pendingKind].done
        : '일부를 지우지 못했어요. 다시 시도해 주세요.',
    })
    setPendingKind(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">설정</h1>

      {/* 시안처럼 PC(lg)에서는 두 칸으로 나눕니다. 다른 설정 카드가 생기면 이 안에 이어서 넣으면 됩니다. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* 하루 메시지 횟수·연락 금지 시간(#60)은 시안처럼 이 카드에 이어서 넣으면 됩니다. */}
        <Card title="전화와 메시지">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Input
                id="call-time"
                type="time"
                label="전화 받을 시간"
                value={callTime}
                onChange={(event) => handleChangeCallTime(event.target.value)}
                className="h-12 text-base"
              />
              <p className="text-sm break-keep text-slate-500">
                {callTime === ''
                  ? '시간을 고르면 매일 그 시간에 AI 선생님이 전화를 걸어요.'
                  : `매일 ${callTime} 에 전화가 와요.`}{' '}
                앱이 열려 있을 때만 울려요.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700">브라우저 알림</p>

              {notificationState === 'granted' && (
                <p role="status" className="text-sm font-medium text-emerald-700">
                  알림이 켜져 있어요.
                </p>
              )}

              {notificationState === 'default' && (
                <>
                  <Button
                    variant="secondary"
                    className="h-11 w-full"
                    onClick={handleRequestNotification}
                  >
                    알림 켜기
                  </Button>
                  <p className="text-sm break-keep text-slate-500">
                    전화가 올 때 알림으로도 알려 드려요. 허용하지 않아도 앱이 열려 있으면 전화
                    화면은 떠요.
                  </p>
                </>
              )}

              {notificationState === 'denied' && (
                <p role="alert" className="text-sm break-keep text-red-600">
                  알림이 꺼져 있어요. 주소창 왼쪽 자물쇠 아이콘을 눌러 알림을 &apos;허용&apos;으로
                  바꿔 주세요.
                </p>
              )}

              {notificationState === 'unsupported' && (
                <p className="text-sm break-keep text-slate-500">
                  이 브라우저에서는 알림을 쓸 수 없어요. 앱이 열려 있을 때만 전화 화면으로 알려
                  드려요.
                </p>
              )}
            </div>

            {showIosGuide && (
              <p className="rounded-lg bg-slate-50 p-3 text-sm break-keep text-slate-600">
                아이폰은 Safari 의 공유 버튼 → &apos;홈 화면에 추가&apos;로 설치한 뒤에만 알림을
                받을 수 있어요.
              </p>
            )}
          </div>
        </Card>

        <Card title="내 데이터 관리">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">
              일기 원문은 나만 볼 수 있어요. 지우면 되돌릴 수 없어요.
            </p>

            {/* 모바일은 세로로 쌓고, sm 부터 가로로 나란히. 누르는 곳은 최소 40px(h-11 = 44px) */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="secondary"
                className="h-11 w-full sm:flex-1"
                onClick={() => setPendingKind('diary')}
              >
                일기만 지우기
              </Button>
              <Button
                variant="danger"
                className="h-11 w-full sm:flex-1"
                onClick={() => setPendingKind('all')}
              >
                모든 기록 지우기
              </Button>
            </div>

            {/* role="status": 지운 결과가 바뀌면 스크린리더가 읽어 줍니다. */}
            {message && (
              <p
                role="status"
                className={cn(
                  'text-sm font-medium',
                  message.isSuccess ? 'text-slate-900' : 'text-red-600',
                )}
              >
                {message.text}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* 지우기 전에 한 번 더 물어봅니다. 확인 버튼은 위험한 일이라는 걸 알리려고 빨간색입니다. */}
      <Modal
        isOpen={pendingKind !== null}
        onClose={() => setPendingKind(null)}
        title="되돌릴 수 없어요"
      >
        {pendingKind !== null && (
          <>
            <p className="font-medium text-slate-900">{deleteTexts[pendingKind].question}</p>
            <p className="mt-2 text-sm text-slate-600">{deleteTexts[pendingKind].detail}</p>
            <p className="mt-2 text-sm font-medium text-red-600">지운 뒤에는 되돌릴 수 없어요.</p>

            <div className="mt-5 flex gap-3">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setPendingKind(null)}
              >
                취소
              </Button>
              <Button variant="danger" size="lg" className="flex-1" onClick={handleConfirm}>
                {/* 무엇을 지우는지는 위 질문이 알려 주므로, 좁은 화면에서 글자가 꺾이지 않게 짧게 씁니다. */}
                지우기
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
