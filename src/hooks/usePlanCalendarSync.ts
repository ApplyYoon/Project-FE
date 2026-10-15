import { hasGrantedAllScopesGoogle, useGoogleLogin } from '@react-oauth/google'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  CALENDAR_SCOPE,
  CalendarError,
  deleteCalendarEvent,
  getCalendarStatus,
  insertCalendarEvent,
  moveCalendarEvent,
  saveCalendarToken,
} from '@/lib/googleCalendar'
import { canSyncPlan, toCalendarEvent } from '@/lib/planCalendar'
import type { StudyPlan, Subject } from '@/types'

// 시작 시각을 고치는 칸은 한 글자 바꿀 때마다 바뀌어서, 손을 뗀 뒤 이만큼(밀리초) 기다렸다가 구글에 한 번만 보냅니다.
const MOVE_DELAY_MS = 800

/** 계획 줄에 보여 줄 구글 캘린더 상태. 보여 줄 것이 없으면 undefined 입니다 */
export type PlanCalendarState = 'synced' | 'missing' | 'syncing'

interface UsePlanCalendarSyncOptions {
  /** 일정 제목에 과목 이름을 넣으려고 받습니다 */
  subjects: Subject[]
  /** 구글이 정해 준 일정 id 를 계획에 적는 함수 (usePlans 의 setGoogleEventId) */
  setGoogleEventId: (planId: string, googleEventId: string | undefined) => void
}

/**
 * 공부 계획을 구글 캘린더와 맞춥니다. (#316)
 *   계획 추가      -> 구글 캘린더에 일정 만들기 (POST)
 *   시작 시각 바꿈 -> 일정 옮기기 (PATCH), 시각을 지우면 일정 지우기
 *   계획 삭제      -> 일정 지우기 (DELETE)
 *   목표 시간 바꿈 -> 일정 끝 시각 옮기기
 *
 * ■ 지키는 것
 *  - 구글 캘린더를 연결했을 때(설정 › 구글 캘린더)만 합니다. 시작 시각이 있는 오늘·앞으로의 계획만 넣습니다.
 *  - **앱이 만든 일정만** 옮기고 지웁니다. (계획에 적어 둔 googleEventId 가 있는 일정)
 *  - 구글에 실패해도 계획은 그대로 저장됩니다. 계획 줄에 [구글 캘린더에 넣기] 가 남아서 다시 할 수 있습니다.
 *  - 연결이 끝났으면(한 시간) [구글 캘린더에 넣기] 를 눌렀을 때 구글 창을 다시 띄웁니다.
 *
 *   const calendar = usePlanCalendarSync({ subjects, setGoogleEventId })
 *   calendar.onPlanAdded(newPlan)
 */
export function usePlanCalendarSync({ subjects, setGoogleEventId }: UsePlanCalendarSyncOptions) {
  const queryClient = useQueryClient()
  // 구글에 넣는 중인 계획 id. 화면에 "넣는 중…" 을 보여 줍니다.
  const [syncingPlanIds, setSyncingPlanIds] = useState<string[]>([])
  // 구글 캘린더에 실패했을 때 보여 줄 안내
  const [notice, setNotice] = useState<string | null>(null)
  // 같은 계획을 두 번 넣어 일정이 두 개 생기지 않게 막는 표시. (화면을 다시 그리지 않아도 바로 바뀌어야 해서 ref 입니다)
  const insertingRef = useRef(new Set<string>())
  // 계획마다 "구글에 보내기" 예약. 손을 떼기 전에 또 바꾸면 앞의 예약을 지웁니다.
  const moveTimersRef = useRef(new Map<string, number>())
  // 연결이 끝나서 구글 창을 다시 띄운 뒤, 창이 끝나면 넣을 계획
  const waitingPlanRef = useRef<StudyPlan | null>(null)

  function findSubject(subjectId: string) {
    return subjects.find((subject) => subject.id === subjectId)
  }

  function showError(error: unknown) {
    setNotice(
      error instanceof CalendarError
        ? error.message
        : '구글 캘린더에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
    )
  }

  /** 계획 하나를 구글 캘린더에 넣습니다. 이미 넣었거나 넣는 중이면 아무것도 하지 않습니다. */
  async function insert(plan: StudyPlan) {
    const event = toCalendarEvent(plan, findSubject(plan.subjectId))
    if (event === null || plan.googleEventId || insertingRef.current.has(plan.id)) return

    insertingRef.current.add(plan.id)
    setSyncingPlanIds((prev) => [...prev, plan.id])
    try {
      setGoogleEventId(plan.id, await insertCalendarEvent(event))
      setNotice(null)
      // 설정 화면의 "오늘 바쁜 시간" 이 새 일정을 보도록, 받아 둔 것을 버립니다.
      void queryClient.invalidateQueries({ queryKey: ['google-calendar'] })
    } catch (error) {
      showError(error)
    } finally {
      insertingRef.current.delete(plan.id)
      setSyncingPlanIds((prev) => prev.filter((id) => id !== plan.id))
    }
  }

  /** 앱이 만든 일정을 지금 계획에 맞춥니다. 시작 시각이 없어졌으면 일정을 지웁니다. */
  async function move(plan: StudyPlan, eventId: string) {
    try {
      const event = toCalendarEvent(plan, findSubject(plan.subjectId))
      if (event === null) {
        await deleteCalendarEvent(eventId)
        setGoogleEventId(plan.id, undefined)
      } else {
        await moveCalendarEvent(eventId, event)
      }
      setNotice(null)
      void queryClient.invalidateQueries({ queryKey: ['google-calendar'] })
    } catch (error) {
      showError(error)
    }
  }

  // 연결이 끝났을 때 [구글 캘린더에 넣기] 를 누르면 띄우는 구글 창. (설정 화면의 연결과 같은 권한)
  const openGoogleWindow = useGoogleLogin({
    flow: 'implicit',
    scope: CALENDAR_SCOPE,
    onSuccess: (tokenResponse) => {
      const plan = waitingPlanRef.current
      waitingPlanRef.current = null
      if (!hasGrantedAllScopesGoogle(tokenResponse, CALENDAR_SCOPE)) {
        setNotice('캘린더 권한에 체크해야 넣을 수 있어요.')
        return
      }
      saveCalendarToken(tokenResponse.access_token, tokenResponse.expires_in)
      if (plan) void insert(plan)
    },
    onError: () => setNotice('권한을 허락하지 않아서 구글 캘린더에 넣지 못했어요.'),
    onNonOAuthError: () =>
      setNotice('구글 창을 마치지 않았어요. 창이 안 떴다면 브라우저의 팝업 차단을 풀어 주세요.'),
  })

  /** 새 계획을 만들었을 때. 연결돼 있으면 바로 구글 캘린더에 넣습니다. */
  function onPlanAdded(plan: StudyPlan, todayKey: string) {
    if (getCalendarStatus() === 'on' && canSyncPlan(plan, todayKey)) void insert(plan)
  }

  /**
   * 계획이 바뀌었을 때(시작 시각 · 목표 시간). changedPlan 은 **바뀐 뒤의** 계획입니다.
   * 손을 뗀 뒤 잠깐 기다렸다가 구글에 한 번만 보냅니다.
   */
  function onPlanChanged(changedPlan: StudyPlan, todayKey: string) {
    const timers = moveTimersRef.current
    window.clearTimeout(timers.get(changedPlan.id))
    timers.set(
      changedPlan.id,
      window.setTimeout(() => {
        timers.delete(changedPlan.id)
        if (changedPlan.googleEventId) {
          void move(changedPlan, changedPlan.googleEventId)
        } else {
          // 시간 미정이던 계획에 시작 시각을 정한 경우: 새로 넣습니다.
          onPlanAdded(changedPlan, todayKey)
        }
      }, MOVE_DELAY_MS),
    )
  }

  /** 계획을 지웠을 때. 앱이 만든 일정이 있으면 구글에서도 지웁니다. */
  function onPlanDeleted(plan: StudyPlan) {
    window.clearTimeout(moveTimersRef.current.get(plan.id))
    if (!plan.googleEventId) return
    deleteCalendarEvent(plan.googleEventId)
      .then(() => void queryClient.invalidateQueries({ queryKey: ['google-calendar'] }))
      .catch(showError)
  }

  /** 계획 줄의 [구글 캘린더에 넣기] 를 눌렀을 때. 연결이 끝났으면 구글 창부터 띄웁니다. */
  function addToCalendar(plan: StudyPlan) {
    setNotice(null)
    if (getCalendarStatus() === 'on') {
      void insert(plan)
      return
    }
    // 버튼을 누른 그 순간에 창을 띄워야 브라우저가 팝업을 막지 않습니다.
    waitingPlanRef.current = plan
    openGoogleWindow()
  }

  /** 계획 줄에 보여 줄 상태. 연결한 적이 없거나, 맞출 계획이 아니면 undefined 입니다. */
  function getPlanState(plan: StudyPlan, todayKey: string): PlanCalendarState | undefined {
    const status = getCalendarStatus()
    if (status !== 'on' && status !== 'expired') return undefined
    if (!canSyncPlan(plan, todayKey)) return undefined
    if (syncingPlanIds.includes(plan.id)) return 'syncing'
    return plan.googleEventId ? 'synced' : 'missing'
  }

  return { notice, onPlanAdded, onPlanChanged, onPlanDeleted, addToCalendar, getPlanState }
}
