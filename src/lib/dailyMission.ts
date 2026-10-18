/**
 * 오늘의 미션 (2026-10-18 사용자 결정: "오늘의 기분은 미션 알림 + 코치가 채팅에서 묻기, 첫 화면을 막던 체크인은 없앰")
 *
 * 하루에 미션 3개를 만들고, 이미 있는 기록(체크인 · 카드 · 공부 기록)으로 끝났는지 봅니다. 따로 입력받지 않습니다.
 *   1. 컨디션 알려 주기          — 오늘 체크인이 있으면 끝 (코치 채팅의 컨디션 칩을 누르면 저장됨)
 *   2. 코치와 오늘 계획 정하기    — 오늘 카드가 1장 이상 있으면 끝 (계획을 저장하면 카드가 생김)
 *   3. 첫 카드 폰 엎어 두고 시작  — 오늘 끝낸 공부 기록이 하나라도 있으면 끝
 * (2026-10-18 사용자: "AI 가 플래너를 한번 짜 주고 핑퐁하며 고치는 게 맞지, 일방적으로 10분 주는 건 아님"
 *  → 공부 미션을 정해서 내려 주지 않고, 코치와 오늘 계획을 같이 정하는 것을 미션으로 둡니다)
 *
 * 미션 알림(아침 · 하교 · 저녁)은 2026-10-18 #578 에서 "코치가 먼저 말 거는 알림"(lib/coachNudges.ts)으로 합쳤습니다.
 * 아침 알림을 누르면 코치가 오늘의 미션 칩을 같이 보여 줍니다. 예전 미션 알림 주소(/coach?mission=morning 등)도 그대로 열립니다.
 * React 를 쓰지 않는 순수 함수와, 저장소를 읽는 함수(load…)로 나눠 두었습니다.
 */
import { getCardsOnDate, loadSavedCards } from '@/lib/cards'
import { loadStudySessions } from '@/lib/dailyRecords'
import { toDayKey } from '@/lib/date'
import { hasCheckIn } from '@/lib/quickCheckIn'
import type { StudySession } from '@/types'

export type MissionKind = 'checkIn' | 'plan' | 'firstStudy'

/** 미션 하나 */
export interface Mission {
  kind: MissionKind
  /** 화면 · 알림에 쓰는 이름. 예) '코치와 오늘 계획 정하기' */
  title: string
  done: boolean
}

/** 오늘 카드가 없을 때 [▷ 시작] 칩으로 만드는 즉석 카드의 길이 (분). 학교 한 교시 50분 (2026-10-18: 30분 밑은 공부 블록으로 보지 않음) */
export const DAILY_GOAL_MINUTES = 50

export interface MissionInput {
  /** 오늘 체크인을 했는지 */
  hasCheckIn: boolean
  /** 오늘 카드가 1장 이상 있는지 (계획을 저장하면 카드가 생김) */
  hasTodayCard: boolean
  /** 오늘 끝낸 공부 기록 (놀기 제외) */
  todaySessions: StudySession[]
}

/**
 * 오늘의 미션 3개를 만듭니다.
 *
 *   buildDailyMissions({ hasCheckIn: true, hasTodayCard: false, todaySessions: [] })
 *   -> [ { kind: 'checkIn', title: '컨디션 알려 주기', done: true },
 *        { kind: 'plan', title: '코치와 오늘 계획 정하기', done: false },
 *        { kind: 'firstStudy', title: '첫 카드 폰 엎어 두고 시작', done: false } ]
 */
export function buildDailyMissions(input: MissionInput): Mission[] {
  return [
    { kind: 'checkIn', title: '컨디션 알려 주기', done: input.hasCheckIn },
    { kind: 'plan', title: '코치와 오늘 계획 정하기', done: input.hasTodayCard },
    {
      kind: 'firstStudy',
      title: '첫 카드 폰 엎어 두고 시작',
      done: input.todaySessions.length > 0,
    },
  ]
}

/** 끝낸 미션 수 */
export function countDoneMissions(missions: Mission[]): number {
  return missions.filter((mission) => mission.done).length
}

/** 아직 안 끝낸 첫 미션. 다 끝냈으면 undefined */
export function nextMission(missions: Mission[]): Mission | undefined {
  return missions.find((mission) => !mission.done)
}

// ---- 예전 미션 알림 주소 (?mission=) ----

/** 미션 알림을 보내던 때. 주소의 ?mission= 값이기도 합니다. (지금 알림은 lib/coachNudges.ts) */
export type MissionSlot = 'morning' | 'afterSchool' | 'evening'

export const MISSION_SLOTS: MissionSlot[] = ['morning', 'afterSchool', 'evening']

/** 주소의 ?mission= 값이 알림 때 이름이 맞는지 (주소는 누구나 고칠 수 있어서 확인합니다) */
export function isMissionSlot(value: string): value is MissionSlot {
  return (MISSION_SLOTS as string[]).includes(value)
}

// ---- 저장소에서 읽기 ----

/** 오늘 끝낸 공부 기록 (놀기 제외). 날짜는 새벽 4시 기준으로 시작한 날입니다. */
function loadTodaySessions(todayKey: string): StudySession[] {
  return loadStudySessions().filter((session) => toDayKey(session.startedAt) === todayKey)
}

/** 저장소의 체크인 · 오늘 카드 · 공부 기록으로 오늘의 미션을 만듭니다. */
export function loadDailyMissions(todayKey: string): Mission[] {
  return buildDailyMissions({
    hasCheckIn: hasCheckIn(todayKey),
    hasTodayCard: getCardsOnDate(loadSavedCards() ?? [], todayKey).length > 0,
    todaySessions: loadTodaySessions(todayKey),
  })
}
