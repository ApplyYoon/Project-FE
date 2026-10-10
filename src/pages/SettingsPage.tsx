import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { MessageSettingsFields } from '@/components/ui/MessageSettingsFields'
import { Modal } from '@/components/ui/Modal'
import { CALL_TIME_STORAGE_KEY, isIosWithoutInstall, parseCallTime } from '@/lib/callReminder'
import { cn } from '@/lib/cn'
import { helpLines, SUPPORT_PATH } from '@/lib/helpLines'
import {
  getCareLimits,
  setAllowFocusMode,
  setAllowOffHoursCall,
  setMaxCareLevel,
  setMaxHarshness,
} from '@/lib/careLimits'
import {
  getMessageSettings,
  saveMessageSettings,
  type MessageSettings,
} from '@/lib/messageSettings'
import { deleteMyData, type DeleteKind } from '@/lib/myData'
import type { CareLevel } from '@/lib/careLevel'
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '@/lib/notifications'
import { loadData, removeData, saveData } from '@/lib/storage'

// 일기 기능을 켰는지 끄는 설정입니다. 기록이 아니라 설정값이라 "모든 기록 지우기" 로는 안 지워집니다.
const DIARY_ENABLED_KEY = 'diary-enabled'

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
      '공부 계획, 공부 기록, 진행 중인 타이머, 시험, 일기가 전부 사라져요. 과목과 로그인 정보는 그대로 남아요.',
    done: '모든 기록을 지웠어요.',
  },
}

/** 지운 결과 안내. isSuccess 가 false 면 일부를 못 지운 것입니다. */
interface DeleteMessage {
  text: string
  isSuccess: boolean
}

/** 관리 강도 단계별 이름과 한 줄 설명. (#28 의 단계 표와 같은 문구) */
const careLevelOptions: { level: CareLevel; label: string; description: string }[] = [
  { level: 0, label: '0 회복', description: '위로만. "오늘은 10분만"' },
  { level: 1, label: '1 당근', description: '구체적 칭찬, 나무 성장' },
  { level: 2, label: '2 넛지', description: '담백한 알림. "계획 시간 10분 지났어"' },
  { level: 3, label: '3 심리적 채찍', description: '팩폭 말투, 독촉 메시지, 나무 시듦' },
  { level: 4, label: '4 강제적 채찍', description: '공부 시간에 집중 모드 잠금' },
]

/** 독설 허용 수위(1~5)별 한 줄 설명 */
const harshnessDescriptions: Record<number, string> = {
  1: '부드럽게만 말해줘',
  2: '담백하게 짚어줘',
  3: '따끔하게 말해도 돼',
  4: '세게 말해도 돼',
  5: '제일 세게 말해도 돼',
}

/** 'YYYY-MM-DD' 를 'M월 D일' 로 바꿔줍니다. */
function formatDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}

export function SettingsPage() {
  // 처음 열 때 한 번 불러옵니다. (불러오면서 예약된 한도 상향이 있으면 날짜가 지났는지도 같이 확인합니다)
  const [limits, setLimits] = useState(() => getCareLimits())
  const [messageSettings, setMessageSettings] = useState(getMessageSettings)

  // 지금 확인창으로 물어보고 있는 종류. null 이면 확인창이 닫혀 있습니다.
  const [pendingKind, setPendingKind] = useState<DeleteKind | null>(null)
  const [message, setMessage] = useState<DeleteMessage | null>(null)
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(getNotificationPermission)

  // 전화 받을 시간 ('HH:MM'). 아직 안 정했으면 빈 글자입니다. 올바른 시간만 불러옵니다.
  const [callTime, setCallTime] = useState(() => {
    const saved = loadData<unknown>(CALL_TIME_STORAGE_KEY, '')
    return typeof saved === 'string' && parseCallTime(saved) !== null ? saved : ''
  })
  // 아이폰인데 홈 화면에 추가하지 않았는지. 이 경우에만 안내를 보여줍니다.
  const [showIosGuide] = useState(isIosWithoutInstall)

  function handleChangeCallTime(nextTime: string) {
    setCallTime(nextTime)
    // 시간을 고르면 바로 저장합니다. 시간을 지우면(빈 글자) 저장해 둔 것도 지워서 전화가 울리지 않게 합니다.
    if (nextTime === '') {
      removeData(CALL_TIME_STORAGE_KEY)
    } else {
      saveData(CALL_TIME_STORAGE_KEY, nextTime)
    }
  }

  async function handleRequestNotification() {
    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)
  }

  // 일기 기능을 켰는지. 켜면 기록 화면에 일기 메뉴가 보입니다. (기본은 꺼짐 — #63 "원할 때만 켜는 기능")
  const [isDiaryEnabled, setIsDiaryEnabled] = useState(() => loadData(DIARY_ENABLED_KEY, false))

  useEffect(() => {
    saveData(DIARY_ENABLED_KEY, isDiaryEnabled)
  }, [isDiaryEnabled])

  function handleChangeMessageSettings(next: MessageSettings) {
    setMessageSettings(next)
    // "저장" 버튼이 따로 없어서, 바꾸는 즉시 저장합니다.
    saveMessageSettings(next)
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">설정</h1>
        <p className="mt-2 text-slate-600">
          AI 가 나를 얼마나 세게 챙길지 내가 정해요. 정한 한도는 절대 넘지 않아요.
        </p>
      </div>

      {/* 시안처럼 PC(lg)에서는 두 칸으로 나눕니다. 왼쪽은 관리 강도 한도, 오른쪽은 내 데이터 등 그 밖의 설정입니다. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <Card title="관리 강도 최대 한도">
            <p className="text-sm text-slate-500">한도를 낮추면 바로, 높이면 내일부터 적용돼요.</p>

            {limits.pendingMaxCareLevel !== null && limits.pendingEffectiveDate !== null && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {formatDateLabel(limits.pendingEffectiveDate)}부터 {limits.pendingMaxCareLevel}
                단계로 올라가요. 그때까지는 지금 한도({limits.maxCareLevel}단계)가 유지돼요.
              </p>
            )}

            <div
              role="radiogroup"
              aria-label="관리 강도 최대 한도"
              className="mt-4 flex flex-col gap-2"
            >
              {careLevelOptions.map((option) => {
                const isSelected = option.level === limits.maxCareLevel
                return (
                  <label
                    key={option.level}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3',
                      isSelected
                        ? 'border-brand bg-brand-light'
                        : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="maxCareLevel"
                      checked={isSelected}
                      onChange={() => setLimits(setMaxCareLevel(option.level))}
                      className="accent-brand mt-1 h-5 w-5 shrink-0 cursor-pointer"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                      <span className="text-sm text-slate-500">{option.description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </Card>

          <Card title="독설 허용 수위">
            <p className="text-sm text-slate-500">
              지적은 행동에만 해요. 외모·성적·능력 비하와 남과 비교는 절대 안 해요.
            </p>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((value) => {
                const isSelected = value === limits.maxHarshness
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setLimits(setMaxHarshness(value))}
                    className={cn(
                      'h-10 cursor-pointer rounded-lg border text-sm font-medium transition-colors',
                      isSelected
                        ? 'border-brand bg-brand-light text-brand'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {value}
                  </button>
                )
              })}
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {limits.maxHarshness} · {harshnessDescriptions[limits.maxHarshness]}
            </p>
          </Card>

          <Card title="잠금과 독촉">
            <div className="flex flex-col divide-y divide-slate-100">
              <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">집중 모드 잠금 허용</span>
                  <span className="text-sm text-slate-500">풀려면 10초 기다리고 이유를 적어요</span>
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={limits.allowFocusMode}
                    onChange={(event) => setLimits(setAllowFocusMode(event.target.checked))}
                    aria-label="집중 모드 잠금 허용"
                    className="accent-brand h-5 w-5 cursor-pointer"
                  />
                </span>
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">
                    정해진 시간 외 독촉 전화
                  </span>
                  <span className="text-sm text-slate-500">허용해도 하루 1번까지만</span>
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={limits.allowOffHoursCall}
                    onChange={(event) => setLimits(setAllowOffHoursCall(event.target.checked))}
                    aria-label="정해진 시간 외 독촉 전화"
                    className="accent-brand h-5 w-5 cursor-pointer"
                  />
                </span>
              </label>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
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
                  앱이 열려 있을 때만 울려요. 알림은 아래 &quot;알림&quot;에서 켤 수 있어요.
                </p>
                {showIosGuide && (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm break-keep text-slate-600">
                    아이폰은 Safari 의 공유 버튼 → &apos;홈 화면에 추가&apos;로 설치한 뒤에만 알림을
                    받을 수 있어요.
                  </p>
                )}
              </div>

              <MessageSettingsFields
                value={messageSettings}
                onChange={handleChangeMessageSettings}
              />
            </div>
          </Card>

          <Card title="일기 쓰기">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-500">
                원할 때만 쓰는 자유 일기예요. 켜면 기록 화면에 일기 메뉴가 보여요.
              </p>

              <div className="flex gap-3">
                <Button
                  variant={isDiaryEnabled ? 'primary' : 'secondary'}
                  aria-pressed={isDiaryEnabled}
                  className="h-11 flex-1"
                  onClick={() => setIsDiaryEnabled(true)}
                >
                  켜기
                </Button>
                <Button
                  variant={!isDiaryEnabled ? 'primary' : 'secondary'}
                  aria-pressed={!isDiaryEnabled}
                  className="h-11 flex-1"
                  onClick={() => setIsDiaryEnabled(false)}
                >
                  끄기
                </Button>
              </div>
            </div>
          </Card>

          <Card title="알림">
            <div className="flex flex-col gap-4">
              {isNotificationSupported() ? (
                <>
                  <p className="text-sm text-slate-500">
                    {notificationPermission === 'granted' &&
                      '알림이 켜져 있어요. 새 메시지나 전화가 오면 브라우저 알림으로도 알려줄게요.'}
                    {notificationPermission === 'denied' &&
                      '알림이 거부되어 있어요. 메시지는 메시지함에 그대로 쌓이고, 알림만 안 떠요. 켜려면 브라우저 주소창 옆 설정에서 알림을 허용해 주세요.'}
                    {notificationPermission === 'default' &&
                      '알림을 켜면 앱을 안 보고 있어도 새 메시지나 전화를 브라우저 알림으로 알려줘요.'}
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

          {/* 언제든 들어갈 수 있는 도움 연결. 누르면 바로 전화가 걸립니다. (#96) */}
          <Card title="힘들 때 도움받기" className="bg-slate-50">
            <p className="text-sm text-slate-500">혼자 버티기 힘들 때는 바로 이야기해 주세요.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {helpLines.map((line) => (
                <li key={line.number}>
                  {/* min-h-12 = 48px: 손가락으로 누르기 쉬운 높이 */}
                  <a
                    href={`tel:${line.number}`}
                    aria-label={`${line.name} ${line.number} 전화 걸기`}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 hover:bg-slate-100"
                  >
                    <span className="font-semibold text-slate-900">{line.name}</span>
                    <span className="text-brand text-xl font-bold">{line.number}</span>
                  </a>
                </li>
              ))}
            </ul>
            <Link
              to={SUPPORT_PATH}
              className="text-brand mt-3 inline-flex h-11 items-center text-sm font-medium underline"
            >
              도움 안내 화면 보기
            </Link>
          </Card>
        </div>
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
