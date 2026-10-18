/**
 * 앱 알림의 문구와 말투를 정하는 순수 함수입니다. (#255)
 *
 * 앱 알림은 "앱 안에서 생긴 일" 을 알림 화면에 쌓아 주는 것입니다. AI 를 부르지 않고,
 * 여기에 정해 둔 문장에 숫자를 끼워서 만듭니다. (비용 0. 숫자는 코드가 계산한 것만 씁니다)
 * React 도 저장소도 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 * 실제로 "지금 보낼지" 를 정하고 쌓는 일은 lib/appAlertCheck.ts 가 합니다.
 *
 *   알림 종류          언제                                         기본 말투
 *   planLate           계획한 시작 시각이 지났는데 타이머가 꺼져 있음   넛지(2)
 *   timerDone          타이머 목표 시간을 채워서 끝냄                 당근(1)
 *   goalDone           오늘 공부 계획의 시간을 다 채움                당근(1)
 *   missed3Days        3일 연속으로 계획을 못 채움                    회복(0)
 *   weekGoalAchieved   지난주에 고른 목표를 달성함                    당근(1)
 *   weekGoalMissed     지난주에 고른 목표를 못 채움                   넛지(2)
 *
 * ■ 문구 규칙 (lib/careTheme.ts 의 인사말과 같은 규칙입니다)
 *  - 외모·성적·능력을 깎아내리는 말, 다른 사람과 비교하는 말은 쓰지 않습니다. 지적은 행동에만 합니다.
 *  - 문장마다 말투(careLevel)와 독설 수위(harshness)를 정직하게 답니다.
 *  - 모든 종류에 회복(0) 말투 문장이 하나 이상 있어야 합니다. 한도를 0 으로 낮춘 사람에게도 보낼 문장이 필요하기 때문입니다.
 */
import { toDayKey } from '@/lib/date'
import { eventMessageCareLevels, eventMessageLabels } from '@/lib/eventMessage'
import type { EventMessageType } from '@/lib/eventMessage'
import { getPlannedStartAt } from '@/lib/facts'
import { getSessionMs } from '@/lib/studyTime'
import type { WeeklyGoalKind } from '@/lib/weeklyGoal'
import type { CareLevel, StudyPlan, StudySession } from '@/types'

/** 앱 알림의 종류. 앞의 셋은 lib/eventMessage.ts(#83)가 판단하는 종류와 같습니다. */
export type AppAlertType = EventMessageType | 'timerDone' | 'weekGoalAchieved' | 'weekGoalMissed'

/** 알림 말풍선 아래에 붙는 짧은 이름 */
export const appAlertLabels: Record<AppAlertType, string> = {
  ...eventMessageLabels,
  timerDone: '타이머 완주',
  weekGoalAchieved: '주간 목표 달성',
  weekGoalMissed: '주간 목표 결과',
}

/** 알림 종류마다 정해 둔 기본 말투 (관리 강도). 실제로는 여기서 내 한도만큼 낮아질 수 있습니다. */
export const appAlertCareLevels: Record<AppAlertType, CareLevel> = {
  ...eventMessageCareLevels,
  timerDone: 1,
  weekGoalAchieved: 1,
  weekGoalMissed: 2,
}

/** 정해 둔 문장 하나 */
export interface AlertSentence {
  /** 이 문장의 말투 (0 회복 / 1 당근 / 2 넛지) */
  careLevel: CareLevel
  /** 독설 수위 (1 부드럽게 / 2 담백하게 / 3 따끔하게). 설정의 "독설 허용 수위" 와 같은 기준입니다 */
  harshness: number
  /** 문장. {time} 처럼 중괄호로 감싼 자리에 숫자가 끼워집니다 */
  text: string
}

/*
 * 종류별 문장입니다. 중괄호 자리에 들어가는 값:
 *   planLate          {time} 계획한 시작 시각 '19:00' · {plan} 과목과 할 일 '국어 비문학 3지문'
 *   timerDone         {subject} 과목 이름 · {minutes} 약속한 목표 시간(분)
 *   goalDone          {target} 오늘 계획의 목표 시간 '4시간'
 *   missed3Days       (없음)
 *   weekGoal…         {label} 무슨 숫자인지 '완주율' · {before} 지난주에 제안할 때 본 숫자 '55%'
 *                     {after} 그 주의 결과 '66%' · {target} 목표 숫자 '65%'
 */
export const appAlertSentences: Record<AppAlertType, AlertSentence[]> = {
  planLate: [
    { careLevel: 2, harshness: 1, text: '{time} {plan}, 시작할 시간이야' },
    { careLevel: 2, harshness: 2, text: '{time} {plan}, 아직 시작 전이야. 타이머부터 켜자.' },
    { careLevel: 1, harshness: 1, text: '{time} {plan} 할 시간이야. 지금 켜면 계획대로야.' },
    { careLevel: 0, harshness: 1, text: '{time} {plan}, 준비되면 하나만 해볼까?' },
  ],
  timerDone: [
    { careLevel: 1, harshness: 1, text: '{subject} {minutes}분 완주!' },
    { careLevel: 0, harshness: 1, text: '{subject} {minutes}분을 채웠어. 잠깐 쉬어도 돼.' },
  ],
  goalDone: [
    { careLevel: 1, harshness: 1, text: '오늘 계획 {target}, 다 해냈어' },
    { careLevel: 0, harshness: 1, text: '오늘 계획 {target}을 다 채웠어. 이제 푹 쉬어.' },
  ],
  missed3Days: [
    { careLevel: 0, harshness: 1, text: '요즘 힘들지. 오늘은 딱 한 장만 해볼까?' },
    { careLevel: 0, harshness: 1, text: '괜찮아, 천천히 다시 시작하자. 오늘은 한 가지만 해보자.' },
  ],
  weekGoalAchieved: [
    { careLevel: 1, harshness: 1, text: '지난주 목표 달성! {label} {before} → {after}' },
    {
      careLevel: 0,
      harshness: 1,
      text: '지난주 목표를 채웠어. {label} {before} → {after}. 이번 주는 편하게 가도 돼.',
    },
  ],
  weekGoalMissed: [
    {
      careLevel: 2,
      harshness: 1,
      text: '지난주 {label} {before} → {after} (목표 {target}). 이번 주에 다시 해보자.',
    },
    {
      careLevel: 2,
      harshness: 2,
      text: '지난주 목표는 못 채웠어. {label} {before} → {after} (목표 {target})',
    },
    {
      careLevel: 1,
      harshness: 1,
      text: '지난주 {label} {before} → {after}. 목표 {target}까지 이번 주에 한 번 더 해보자.',
    },
    {
      careLevel: 0,
      harshness: 1,
      text: '지난주 {label} {before} → {after}. 이번 주는 가볍게 다시 시작하자.',
    },
  ],
}

/** 주간 목표의 종류마다 알림에 쓸 숫자 이름과 단위 */
export const weekGoalLabels: Record<WeeklyGoalKind, { label: string; unit: string }> = {
  completion: { label: '완주율', unit: '%' },
  keep: { label: '완주율', unit: '%' },
  planRate: { label: '계획 대비 실제', unit: '%' },
  startDelay: { label: '시작 지연', unit: '분' },
}

/**
 * 이 알림을 어느 말투(관리 강도)로 보낼지 정합니다.
 *
 *  1) 안전 브레이크(#95)가 켜져 있으면 무엇이든 회복(0) 말투입니다.
 *  2) 아니면 그 종류의 기본 말투를 쓰되, 내가 정한 관리 강도 최대 한도(#59)를 넘지 않습니다.
 *
 *   getAppAlertCareLevel('planLate', 4, false) -> 2   (넛지 그대로)
 *   getAppAlertCareLevel('planLate', 1, false) -> 1   (한도가 당근이면 당근 말투로)
 *   getAppAlertCareLevel('planLate', 0, false) -> 0
 *   getAppAlertCareLevel('planLate', 4, true)  -> 0   (안전 브레이크)
 *   getAppAlertCareLevel('goalDone', 4, false) -> 1   (기본 말투보다 세지지는 않습니다)
 */
export function getAppAlertCareLevel(
  type: AppAlertType,
  maxCareLevel: CareLevel,
  isSafetyBrakeOn: boolean,
): CareLevel {
  if (isSafetyBrakeOn) return 0
  const baseLevel = appAlertCareLevels[type]
  return baseLevel > maxCareLevel ? maxCareLevel : baseLevel
}

/**
 * 알림 문장을 만듭니다.
 *
 *  1) careLevel 보다 센 말투의 문장은 뺍니다. 남은 것 중 가장 가까운(가장 높은) 말투의 문장만 남깁니다.
 *  2) 그중 허용 수위(maxHarshness)보다 센 문장은 뺍니다. 다 빠지면 그중 가장 순한 문장을 씁니다.
 *  3) 남은 문장 중 하나를 아무거나 고르고, 중괄호 자리에 values 를 끼웁니다.
 *     (random 은 확인할 때 값을 고정하려고 받습니다. () => 0 이면 항상 첫 번째 문장입니다)
 *
 * 예시 (values = { time: '19:00', plan: '국어 비문학 3지문' }, random = () => 0)
 *   ('planLate', 2, 3) -> '19:00 국어 비문학 3지문, 시작할 시간이야'
 *                         (random 이 0.9 면 '19:00 국어 비문학 3지문, 아직 시작 전이야. 타이머부터 켜자.')
 *   ('planLate', 2, 1) -> '19:00 국어 비문학 3지문, 시작할 시간이야'   (수위 2 문장은 나오지 않습니다)
 *   ('planLate', 1, 3) -> '19:00 국어 비문학 3지문 할 시간이야. 지금 켜면 계획대로야.'
 *   ('planLate', 0, 3) -> '19:00 국어 비문학 3지문, 준비되면 하나만 해볼까?'
 * 예시 (values = { subject: '국어', minutes: '50' })
 *   ('timerDone', 1, 3) -> '국어 50분 완주!'
 *   ('timerDone', 0, 3) -> '국어 50분을 채웠어. 잠깐 쉬어도 돼.'
 */
export function getAppAlertText(
  type: AppAlertType,
  careLevel: CareLevel,
  maxHarshness: number,
  values: Record<string, string>,
  random: () => number = Math.random,
): string {
  const sentences = appAlertSentences[type]

  // 1) 말투: careLevel 이하 중 가장 높은 단계
  const allowedLevels = sentences.filter((sentence) => sentence.careLevel <= careLevel)
  const usedLevel = Math.max(...allowedLevels.map((sentence) => sentence.careLevel))
  const sameLevel = allowedLevels.filter((sentence) => sentence.careLevel === usedLevel)

  // 2) 수위: 허용 수위 이하. 하나도 없으면 가장 순한 것
  let candidates = sameLevel.filter((sentence) => sentence.harshness <= maxHarshness)
  if (candidates.length === 0) {
    const lowest = Math.min(...sameLevel.map((sentence) => sentence.harshness))
    candidates = sameLevel.filter((sentence) => sentence.harshness === lowest)
  }

  // 3) 하나 고르고 숫자 끼우기
  const picked = candidates[Math.floor(random() * candidates.length)]
  // \{(\w+)\} 는 '{time}' 처럼 중괄호로 감싼 이름입니다. 그 이름의 값으로 바꿉니다. (값이 없으면 빈 글자)
  return picked.text.replace(/\{(\w+)\}/g, (_whole, name: string) => values[name] ?? '')
}

/**
 * 오늘 "목표를 정한 타이머" 를 끝까지 한 기록 중 가장 최근 것을 돌려줍니다. 없으면 null 입니다.
 * 끝까지 했는지는 실제로 공부한 시간(일시정지 뺀 시간)이 약속한 목표 시간 이상인지로 봅니다.
 *
 *   오늘 기록: 목표 50분에 50분 함, 목표 30분에 10분 함   -> 앞의 기록
 *   오늘 기록: 목표 없이 2시간 함                          -> null   (약속한 목표가 없습니다)
 *   어제 기록만 있음                                       -> null
 *
 * sessions 에는 공부 기록만 넣습니다. (노는 기록은 공부를 채운 것이 아닙니다)
 * todayKey 는 오늘 날짜('YYYY-MM-DD')입니다. 기록이 며칠 것인지는 하루의 기준(새벽 4시)으로 봅니다.
 * "끝까지 했다" 의 기준은 주간 팩트의 완주율(lib/facts.ts)과 같습니다.
 */
export function findFinishedTimerToday(
  sessions: StudySession[],
  todayKey: string,
): StudySession | null {
  let latest: StudySession | null = null
  for (const session of sessions) {
    if (session.targetMinutes === undefined || toDayKey(session.startedAt) !== todayKey) continue
    if (getSessionMs(session) < session.targetMinutes * 60 * 1000) continue
    if (latest === null || session.endedAt > latest.endedAt) latest = session
  }
  return latest
}

/** 오늘 가장 먼저 시작하기로 한 계획과, 그 시작 시각(Date.now() 같은 숫자) */
export interface FirstPlannedPlan {
  plan: StudyPlan
  startAt: number
}

/**
 * 오늘 계획 중 "가장 먼저 시작하기로 한, 아직 안 끝낸 계획" 을 돌려줍니다. 없으면 null 입니다.
 * 시작 시각을 안 정한 계획과 이미 끝낸(done) 계획은 보지 않습니다.
 *
 *   19:00 국어(안 끝냄) · 21:00 수학(안 끝냄) · 영어(시각 없음)   -> 19:00 국어
 *   19:00 국어(끝냄) · 21:00 수학(안 끝냄)                         -> 21:00 수학
 *   전부 시각 없음                                                 -> null
 *
 * 00:00 ~ 03:59 로 적은 계획은 달력으로 다음 날 새벽입니다. (하루의 기준 새벽 4시, lib/facts.ts 의 getPlannedStartAt)
 * 그래서 '01:00' 계획은 '23:00' 계획보다 뒤입니다.
 */
export function findFirstPlannedPlan(todayPlans: StudyPlan[]): FirstPlannedPlan | null {
  let first: FirstPlannedPlan | null = null
  for (const plan of todayPlans) {
    if (plan.done) continue
    const startAt = getPlannedStartAt(plan)
    if (startAt === null) continue
    if (first === null || startAt < first.startAt) first = { plan, startAt }
  }
  return first
}
