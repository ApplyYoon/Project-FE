import { getCalendarStatus, busyTimesQuery, type BusyTime } from '@/lib/googleCalendar'
import { describeConflict, findConflict, toOccupiedSlots } from '@/lib/planConflict'
import { queryClient } from '@/lib/queryClient'
import type { StudyPlan } from '@/types'

/**
 * 계획을 넣거나 시작 시각을 바꾸기 전에, 그 시간이 다른 일정과 겹치는지 확인합니다. (#315)
 * 계획 추가 · 시작 시각 바꾸기 · (앞으로) 말로 계획 추가(#248) 가 모두 이 함수 하나를 씁니다.
 *
 * 겹침 계산은 lib/planConflict.ts 의 순수 함수가 하고, 이 파일은 구글 캘린더의 바쁜 시간을 받아와서 넘겨줍니다.
 * (받아오는 부분이 인터넷을 쓰기 때문에 계산 파일과 따로 두었습니다)
 */

/** 확인 결과 */
export interface PlanSlotCheck {
  /** 겹쳐서 저장하면 안 될 때 사용자에게 보여 줄 안내. 겹치지 않으면 null */
  conflictMessage: string | null
  /** 구글 캘린더를 못 읽었을 때의 안내. (연결이 끊겼거나 인터넷이 안 될 때) 구글 캘린더를 안 쓰거나 잘 읽었으면 null */
  googleNotice: string | null
}

/** 겹침이 없고 안내할 것도 없는 결과 */
export const NO_SLOT_PROBLEM: PlanSlotCheck = { conflictMessage: null, googleNotice: null }

const GOOGLE_NOTICE = '구글 캘린더는 확인하지 못했어요. 앱의 계획끼리만 확인했어요.'

/** 구글 캘린더를 기다리는 최대 시간(밀리초). 이보다 오래 걸리면 못 읽은 것으로 봅니다. */
const CHECK_TIMEOUT_MS = 4000

/** promise 가 timeoutMs 안에 끝나지 않으면 실패로 바꿉니다. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('시간이 지났어요')), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

interface CheckPlanSlotInput {
  /** 계획이 놓일 날짜 ('YYYY-MM-DD') */
  dayKey: string
  /** 시작 시각 ('HH:MM'). 비어 있으면(시간 미정) 검사하지 않습니다 */
  startTime: string
  /** 목표 시간 (분) */
  targetMinutes: number
  /** 그날 앱에 있는 계획들 */
  plans: StudyPlan[]
  /** 시작 시각을 바꾸는 중인 계획의 id. 자기 자신과는 겹침을 보지 않습니다 */
  ignorePlanId?: string
}

/**
 * 계획의 시간이 겹치는지 확인합니다.
 *
 *  - 시작 시각이 없으면 검사하지 않습니다. (겹침 없음)
 *  - 구글 캘린더를 연결했으면('on') 그날의 바쁜 시간도 같이 봅니다.
 *  - 구글 캘린더를 못 읽으면(연결 끊김 · 인터넷 문제) 앱 계획끼리만 검사하고, googleNotice 로 알려 줍니다.
 *  - 구글 캘린더를 연결한 적이 없으면 아무 안내 없이 앱 계획끼리만 검사합니다.
 */
export async function checkPlanSlot({
  dayKey,
  startTime,
  targetMinutes,
  plans,
  ignorePlanId,
}: CheckPlanSlotInput): Promise<PlanSlotCheck> {
  if (startTime === '') return NO_SLOT_PROBLEM

  let busyTimes: BusyTime[] = []
  let googleNotice: string | null = null
  const status = getCalendarStatus()
  if (status === 'expired') {
    // 연결했었는데 끊겨서 읽을 수 없습니다.
    googleNotice = GOOGLE_NOTICE
  } else if (status === 'on') {
    try {
      // 계획 화면이 이미 받아 둔 같은 날 일정이 있으면(1분 안) 그것을 씁니다.
      // retry: false — 실패하면 다시 시도하지 않고 바로 알려 줍니다. (사용자가 "추가하기" 를 누르고 기다리는 중입니다)
      // 구글이 답을 안 줘도 CHECK_TIMEOUT_MS 가 지나면 읽지 못한 것으로 보고 넘어갑니다.
      busyTimes = await withTimeout(
        queryClient.fetchQuery({ ...busyTimesQuery(dayKey), retry: false }),
        CHECK_TIMEOUT_MS,
      )
    } catch {
      googleNotice = GOOGLE_NOTICE
    }
  }

  const slots = toOccupiedSlots(plans, busyTimes, dayKey, ignorePlanId)
  const conflict = findConflict(startTime, targetMinutes, slots)
  return { conflictMessage: conflict ? describeConflict(conflict) : null, googleNotice }
}
