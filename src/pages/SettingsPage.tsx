import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { deleteMyData, type DeleteKind } from '@/lib/myData'
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '@/lib/notifications'
import { useState } from 'react'

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
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(getNotificationPermission)

  async function handleRequestNotification() {
    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)
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
        <Card title="AI 메시지 알림">
          <div className="flex flex-col gap-4">
            {isNotificationSupported() ? (
              <>
                <p className="text-sm text-slate-500">
                  {notificationPermission === 'granted' &&
                    '알림이 켜져 있어요. 안 읽은 메시지가 오면 브라우저 알림으로도 알려줄게요.'}
                  {notificationPermission === 'denied' &&
                    '알림이 거부되어 있어요. 메시지는 메시지함에 그대로 쌓이고, 알림만 안 떠요. 켜려면 브라우저 주소창 옆 설정에서 알림을 허용해 주세요.'}
                  {notificationPermission === 'default' &&
                    '알림을 켜면 앱을 안 보고 있어도 새 메시지를 브라우저 알림으로 알려줘요.'}
                </p>
                {notificationPermission === 'default' && (
                  <Button className="h-11 w-full sm:w-auto" onClick={handleRequestNotification}>
                    알림 켜기
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                이 브라우저는 알림 기능을 지원하지 않아요. 메시지는 메시지함에 그대로 쌓여요.
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
