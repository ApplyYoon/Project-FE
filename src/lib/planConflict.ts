import { DAY_START_HOUR } from '@/lib/date'
import { formatMinutes, toMinutes } from '@/lib/timeline'
import type { StudyPlan } from '@/types'

/**
 * 계획의 시간(시작 ~ 시작 + 목표 시간)이 다른 일정과 겹치는지 계산합니다. (#315)
 * 비교하는 일정은 ① 그날 앱의 다른 계획 ② 구글 캘린더의 바쁜 시간 입니다.
 * 겹치는지는 이 파일의 순수 함수(React·인터넷을 쓰지 않아서 같은 입력이면 항상 같은 결과)가 계산합니다.
 *
 * ■ 하루는 새벽 4시에 시작합니다. (lib/date.ts)
 *   그래서 시각을 "그날 새벽 4시부터 몇 분째인지" 로 바꿔서 비교합니다.
 *   04:00 -> 240   /   23:30 -> 1410   /   00:30 -> 1470 (다음 날 새벽이라 23:30 보다 뒤)   /   03:59 -> 1679
 *   하루의 끝(다음 날 04:00)은 1680 입니다.
 *
 * ■ 겹침의 기준
 *   두 일정이 겹친다 = 한쪽의 시작이 다른 쪽의 끝보다 앞이고, 반대쪽도 그렇다.
 *   끝 시각 = 다음 일정의 시작 시각이면 겹치지 않습니다. (15:00~16:00 과 16:00~17:00 은 OK)
 */

/** 하루가 시작하는 시각 (새벽 4시 = 240분) */
export const DAY_START_MINUTES = DAY_START_HOUR * 60
/** 하루가 끝나는 시각 (다음 날 새벽 4시 = 1680분) */
export const DAY_END_MINUTES = DAY_START_MINUTES + 24 * 60

/**
 * 'HH:MM' 을 "하루 시작(새벽 4시)을 기준으로 한 분" 으로 바꿉니다. 시각 모양이 아니면 null 입니다.
 *
 *   toDayMinutes('04:00') -> 240
 *   toDayMinutes('19:00') -> 1140
 *   toDayMinutes('00:00') -> 1440   (다음 날 새벽이라 하루의 끝쪽에 놓입니다)
 *   toDayMinutes('03:59') -> 1679
 *   toDayMinutes('')      -> null
 */
export function toDayMinutes(time: string | undefined): number | null {
  const minutes = toMinutes(time)
  if (minutes === null) return null
  return minutes >= DAY_START_MINUTES ? minutes : minutes + 24 * 60
}

/** 다른 일정이 차지한 시간 하나 (하루 시작 기준 분) */
export interface OccupiedSlot {
  start: number
  end: number
  /** 앱의 계획이면 그 계획, 구글 캘린더 일정이면 null (구글 일정은 제목을 받지 않습니다) */
  plan: StudyPlan | null
}

/**
 * 그날의 다른 일정들을 "차지한 시간" 목록으로 바꿉니다.
 *
 *  - 앱 계획: 시작 시각이 있는 것만 봅니다. (노는 계획도 포함, 끝낸 계획도 포함) 시작 시각이 없거나
 *    목표 시간이 0 이하인 계획은 시간을 차지하지 않으니 뺍니다. ignorePlanId 의 계획도 뺍니다. (시작 시각을 고치는 중인 계획 자신)
 *  - 구글 일정: 시작·끝 시각(Date.now() 값)을 그날 새벽 4시 기준 분으로 바꿉니다.
 *    그날(새벽 4시 ~ 다음 날 새벽 4시) 밖으로 나간 부분은 잘라 냅니다.
 *
 *   plans [수학 19:00 60분, 영어(시각 없음) 30분], busyTimes 없음 -> [{ start: 1140, end: 1200, plan: 수학 }]
 */
export function toOccupiedSlots(
  plans: StudyPlan[],
  busyTimes: { start: number; end: number }[],
  dayKey: string,
  ignorePlanId?: string,
): OccupiedSlot[] {
  const slots: OccupiedSlot[] = []

  for (const plan of plans) {
    if (plan.id === ignorePlanId) continue
    const start = toDayMinutes(plan.startTime)
    if (start === null || !(plan.targetMinutes > 0)) continue
    slots.push({ start, end: start + plan.targetMinutes, plan })
  }

  // 'YYYY-MM-DD' 글자를 그대로 new Date 에 넣으면 영국 시간으로 읽혀서, 년·월·일을 쪼개서 만듭니다.
  const [year, month, day] = dayKey.split('-').map(Number)
  const dayStartMs = new Date(year, month - 1, day, DAY_START_HOUR).getTime()
  for (const busy of busyTimes) {
    // 시작은 내림, 끝은 올림: 1분이라도 걸치면 겹친 것으로 봅니다.
    const start = Math.max(
      DAY_START_MINUTES,
      Math.floor(DAY_START_MINUTES + (busy.start - dayStartMs) / 60000),
    )
    const end = Math.min(
      DAY_END_MINUTES,
      Math.ceil(DAY_START_MINUTES + (busy.end - dayStartMs) / 60000),
    )
    if (end > start) slots.push({ start, end, plan: null })
  }

  return slots
}

/** 겹침 검사 결과 */
export interface PlanConflict {
  /** 겹친 일정들 (시작이 빠른 순) */
  conflicts: OccupiedSlot[]
  /** 겹치지 않고 계획 전체가 들어가는, 가장 가까운 시작 시각 (하루 시작 기준 분). 그날 안에 들어갈 빈 시간이 없으면 null */
  freeStart: number | null
}

/**
 * 계획의 시간이 다른 일정과 겹치는지 봅니다. 안 겹치면 null 입니다.
 * 시작 시각이 비었거나 시각 모양이 아니면(= 시간 미정) 검사하지 않고 null 입니다.
 * 목표 시간이 0 이하면 차지하는 시간이 없어서 null 입니다.
 *
 * freeStart 는 "그 시각부터 목표 시간만큼" 비는 가장 가까운 시작 시각입니다.
 * 겹친 일정이 끝나는 시각으로 옮겨 보고, 거기서도 겹치면 그 일정의 끝으로 또 옮깁니다.
 *
 * ■ 예시 (다른 일정: 15:00~16:00, 16:30~17:00)
 *   14:30 시작 60분 -> 겹침 [15:00~16:00],  freeStart 17:00  (16:00 부터는 16:30 일정과 또 겹쳐서 17:00)
 *   14:30 시작 30분 -> 14:30~15:00 이라 안 겹침 -> null       (끝 = 다음 시작이면 OK)
 *   15:30 시작 30분 -> 겹침 [15:00~16:00],  freeStart 16:00
 *   16:00 시작 30분 -> 16:00~16:30 이라 안 겹침 -> null
 *   '' (시간 미정)  -> null
 * ■ 예시 (다른 일정: 23:00~00:30 구글 일정)
 *   23:30 시작 30분 -> 겹침, freeStart 00:30
 *   00:30 시작 30분 -> 안 겹침 -> null   (00:30 은 하루의 끝쪽, 새벽 4시 기준)
 * ■ 예시 (다른 일정: 03:00~04:00 → 그날의 맨 끝)
 *   03:30 시작 60분 -> 겹침, freeStart null  (04:00 에 시작하면 다음 날이 되어 그날 안에 들어갈 빈 시간이 없음)
 */
export function findConflict(
  startTime: string,
  targetMinutes: number,
  occupied: OccupiedSlot[],
): PlanConflict | null {
  const start = toDayMinutes(startTime)
  if (start === null || !(targetMinutes > 0)) return null

  const overlaps = (slot: OccupiedSlot, from: number) =>
    slot.start < from + targetMinutes && from < slot.end

  const conflicts = occupied
    .filter((slot) => overlaps(slot, start))
    .sort((a, b) => a.start - b.start)
  if (conflicts.length === 0) return null

  // 겹친 일정의 끝으로 옮겨 가면서, 계획 전체가 들어가는 자리를 찾습니다.
  // 옮길 때마다 시각이 반드시 커지므로 끝납니다.
  let candidate = start
  for (;;) {
    const hits = occupied.filter((slot) => overlaps(slot, candidate))
    if (hits.length === 0) break
    candidate = Math.max(...hits.map((slot) => slot.end))
  }

  return { conflicts, freeStart: candidate + targetMinutes <= DAY_END_MINUTES ? candidate : null }
}

/** 하루 시작 기준 분을 'HH:MM' 으로 바꿉니다. 1440 → '00:00', 1680 → '04:00' */
function formatDayMinutes(minutes: number): string {
  return formatMinutes(minutes % (24 * 60))
}

/** 안내 문구에 쓰는 일정 이름. 계획 내용이 너무 길면 줄입니다 */
function getSlotLabel(slot: OccupiedSlot): string {
  if (slot.plan === null) return '구글 캘린더 일정'
  const content = slot.plan.content
  return content.length > 20 ? `${content.slice(0, 20)}…` : content
}

/**
 * 겹침을 사용자에게 보여 줄 한국어 안내로 바꿉니다.
 * 겹친 일정의 시간을 보여 주고, 빈 시간을 알려 줍니다. 구글 일정은 제목 없이 "구글 캘린더 일정" 으로만 부릅니다.
 *
 *   15:00~16:00 수학과 겹침, 빈 시간 16:00
 *     -> '15:00 ~ 16:00 에 다른 일정이 있어요 (수학). 16:00 부터 비어요.'
 *   15:00~16:00 구글 일정과 겹침, 빈 시간 16:00
 *     -> '15:00 ~ 16:00 에 다른 일정이 있어요 (구글 캘린더 일정). 16:00 부터 비어요.'
 *   두 개와 겹침 (15:00~16:00 수학, 15:30~17:00 구글)
 *     -> '15:00 ~ 16:00 에 다른 일정이 있어요 (수학 외 1개). 17:00 부터 비어요.'
 *   빈 시간이 없음
 *     -> '03:00 ~ 04:00 에 다른 일정이 있어요 (영어). 이 날은 이 길이의 계획이 들어갈 빈 시간이 없어요.'
 */
export function describeConflict(conflict: PlanConflict): string {
  const [first] = conflict.conflicts
  const times = `${formatDayMinutes(first.start)} ~ ${formatDayMinutes(first.end)}`
  const more = conflict.conflicts.length > 1 ? ` 외 ${conflict.conflicts.length - 1}개` : ''
  const free =
    conflict.freeStart === null
      ? '이 날은 이 길이의 계획이 들어갈 빈 시간이 없어요.'
      : `${formatDayMinutes(conflict.freeStart)} 부터 비어요.`
  return `${times} 에 다른 일정이 있어요 (${getSlotLabel(first)}${more}). ${free}`
}
