/**
 * 오늘의 미션 (2026-10-18 사용자 결정: "오늘의 기분은 미션 알림 + 코치가 채팅에서 묻기, 첫 화면을 막던 체크인은 없앰")
 *
 * 하루에 미션 3개를 만들고, 이미 있는 기록(체크인 · 공부 기록)으로 끝났는지 봅니다. 따로 입력받지 않습니다.
 *   1. 컨디션 알려 주기        — 오늘 체크인이 있으면 끝 (코치 채팅의 컨디션 칩을 누르면 저장됨)
 *   2. 폰 엎어 두고 첫 공부 시작 — 오늘 끝낸 공부 기록이 하나라도 있으면 끝
 *   3. 오늘 배운 과목 10분 복습  — 그 과목 이름이 들어간 카드로 공부했으면 끝 (시간표를 모르면 "오늘 공부 25분 채우기")
 *
 * 앱 안이면 아침 · 하교 무렵 · 저녁에 "오늘의 미션" 휴대폰 알림을 예약합니다. (buildMissionAlarms → hooks/useAppBridge.ts)
 * 알림을 누르면 코치 화면(/?mission=morning 등)이 열리고 코치가 미션을 먼저 말합니다. (pages/CoachPage.tsx)
 * React 를 쓰지 않는 순수 함수와, 저장소를 읽는 함수(load…)로 나눠 두었습니다.
 */
import type { Alarm } from '@/lib/appBridge'
import { loadSavedCards } from '@/lib/cards'
import { loadStudySessions, sessionMinutes } from '@/lib/dailyRecords'
import { moveDateKey, toDayKey } from '@/lib/date'
import { getPlannedStartAt } from '@/lib/facts'
import { getMessageSettings } from '@/lib/messageSettings'
import { toQuietHours } from '@/lib/notifications'
import { hasCheckIn } from '@/lib/quickCheckIn'
import { isWithinQuietHours, type QuietHours } from '@/lib/safetyBrake'
import { loadSchoolDay } from '@/lib/schoolToday'
import type { StudySession } from '@/types'

export type MissionKind = 'checkIn' | 'firstStudy' | 'review'

/** 미션 하나 */
export interface Mission {
  kind: MissionKind
  /** 화면 · 알림에 쓰는 이름. 예) '오늘 배운 미적분Ⅰ 10분 복습' */
  title: string
  done: boolean
  /** 복습 미션의 과목 (review 이고 시간표를 알 때만) */
  subject?: string
}

/** 복습 미션의 길이 (분) */
export const REVIEW_MINUTES = 10
/** 시간표를 모를 때 3번 미션: 오늘 공부를 이만큼 채우기 (분) */
export const DAILY_GOAL_MINUTES = 25

// 복습 미션으로 고르지 않는 과목 (공부라기보다 활동이라서)
const NOT_REVIEW_SUBJECTS = ['체육', '창의적 체험활동', '자율', '동아리', '진로']

export interface MissionInput {
  /** 오늘 체크인을 했는지 */
  hasCheckIn: boolean
  /** 오늘 끝낸 공부 기록 (놀기 제외) */
  todaySessions: StudySession[]
  /** 오늘 시간표 과목 (교시 순서, 모르면 빈 목록) */
  subjects: string[]
  /** 카드 번호 → 카드 제목 (복습했는지 볼 때 씀) */
  cardTitleOf: (cardId: string) => string | undefined
}

/** 시간표에서 복습할 과목 하나를 고릅니다. 활동 과목은 빼고 첫 과목입니다. 없으면 undefined */
export function pickReviewSubject(subjects: string[]): string | undefined {
  return subjects.find((subject) => !NOT_REVIEW_SUBJECTS.some((word) => subject.includes(word)))
}

/**
 * 오늘의 미션 3개를 만듭니다.
 *
 *   buildDailyMissions({ hasCheckIn: true, todaySessions: [], subjects: ['미적분Ⅰ', '문학'], cardTitleOf })
 *   -> [ { kind: 'checkIn', title: '컨디션 알려 주기', done: true },
 *        { kind: 'firstStudy', title: '폰 엎어 두고 첫 공부 시작', done: false },
 *        { kind: 'review', title: '오늘 배운 미적분Ⅰ 10분 복습', subject: '미적분Ⅰ', done: false } ]
 */
export function buildDailyMissions(input: MissionInput): Mission[] {
  const missions: Mission[] = [
    { kind: 'checkIn', title: '컨디션 알려 주기', done: input.hasCheckIn },
    {
      kind: 'firstStudy',
      title: '폰 엎어 두고 첫 공부 시작',
      done: input.todaySessions.length > 0,
    },
  ]

  const subject = pickReviewSubject(input.subjects)
  if (subject) {
    // 그 과목 이름이 들어간 카드로 공부했으면 복습한 것으로 봅니다. (코치의 [복습 시작] 칩은 '과목 복습' 카드를 만듭니다)
    const reviewed = input.todaySessions.some((session) =>
      (input.cardTitleOf(session.cardId ?? '') ?? '').includes(subject),
    )
    missions.push({
      kind: 'review',
      title: `오늘 배운 ${subject} ${REVIEW_MINUTES}분 복습`,
      subject,
      done: reviewed,
    })
  } else {
    const minutes = input.todaySessions.reduce((sum, session) => sum + sessionMinutes(session), 0)
    missions.push({
      kind: 'review',
      title: `오늘 공부 ${DAILY_GOAL_MINUTES}분 채우기`,
      done: minutes >= DAILY_GOAL_MINUTES,
    })
  }
  return missions
}

/** 끝낸 미션 수 */
export function countDoneMissions(missions: Mission[]): number {
  return missions.filter((mission) => mission.done).length
}

/** 아직 안 끝낸 첫 미션. 다 끝냈으면 undefined */
export function nextMission(missions: Mission[]): Mission | undefined {
  return missions.find((mission) => !mission.done)
}

// ---- 오늘의 미션 알림 (앱 안에서만) ----

/** 미션 알림을 보내는 때. 주소의 ?mission= 값이기도 합니다. */
export type MissionSlot = 'morning' | 'afterSchool' | 'evening'

export const MISSION_SLOTS: MissionSlot[] = ['morning', 'afterSchool', 'evening']

/** 주소의 ?mission= 값이 알림 때 이름이 맞는지 (주소는 누구나 고칠 수 있어서 확인합니다) */
export function isMissionSlot(value: string): value is MissionSlot {
  return (MISSION_SLOTS as string[]).includes(value)
}

const MORNING_TIME = '07:30'
const EVENING_TIME = '21:00'
/** 시간표를 모를 때의 하교 무렵 */
const DEFAULT_AFTER_SCHOOL_TIME = '16:30'
/**
 * 일반적인 고등학교에서 교시가 끝나는 시각 (1교시부터). 학교마다 조금씩 달라서 "대략" 으로 씁니다.
 * NEIS 시간표에는 교시만 있고 시각이 없습니다.
 */
const PERIOD_END_TIMES = ['09:40', '10:40', '11:40', '12:40', '14:30', '15:30', '16:30', '17:30']
/** 하교 알림은 마지막 교시가 끝나고 이만큼 뒤에 (분) */
const AFTER_SCHOOL_DELAY_MINUTES = 30

/**
 * 하교 무렵 알림 시각('HH:MM'). 마지막 교시가 끝나고 30분 뒤, 모르면 16:30 입니다.
 *
 *   getAfterSchoolTime(7)    -> '17:00'
 *   getAfterSchoolTime(null) -> '16:30'
 */
export function getAfterSchoolTime(lastPeriod: number | null): string {
  if (lastPeriod === null || lastPeriod < 1) return DEFAULT_AFTER_SCHOOL_TIME
  const end = PERIOD_END_TIMES[Math.min(lastPeriod, PERIOD_END_TIMES.length) - 1]
  const [hour, minute] = end.split(':').map(Number)
  const total = hour * 60 + minute + AFTER_SCHOOL_DELAY_MINUTES
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export interface MissionAlarmsInput {
  /** 지금 (Date.now() 값) */
  now: number
  /** 오늘의 미션 (buildDailyMissions) */
  todayMissions: Mission[]
  /** 오늘 시간표의 마지막 교시. 모르면 null */
  lastPeriodToday: number | null
  /** 연락 금지 시간. 이 시간에 울릴 알림은 뺍니다. */
  quietHours: QuietHours
}

/** 미션 알림 하나를 만듭니다. 누르면 코치 화면이 열리고 코치가 그 때의 미션 이야기를 먼저 합니다. */
function makeMissionAlarm(
  dateKey: string,
  slot: MissionSlot,
  time: string,
  title: string,
  body: string,
): Alarm | null {
  const at = getPlannedStartAt({ date: dateKey, startTime: time })
  if (at === null) return null
  return { id: `mission-${dateKey}-${slot}`, at, title, body, url: `/?mission=${slot}` }
}

/**
 * 오늘 · 내일의 "오늘의 미션" 알림 목록 (최대 6개). 카드 알림과 합쳐서 앱에 보냅니다. (alarms.set 은 목록을 통째로 바꿈)
 * - 오늘: 미션을 다 끝냈으면 보내지 않습니다. 내용은 남은 미션 이름입니다.
 * - 내일: 아직 미션을 모르니 같은 안내 문장입니다. (내일 앱을 열면 그날 미션으로 다시 만듭니다)
 * - 빼는 것: 이미 지난 시각 · 연락 금지 시간. 시각은 등교 전 · 하교 뒤 · 저녁이라 수업 시간과 겹치지 않습니다.
 */
export function buildMissionAlarms(input: MissionAlarmsInput): Alarm[] {
  const todayKey = toDayKey(input.now)
  const tomorrowKey = moveDateKey(todayKey, 1)
  const left = input.todayMissions.filter((mission) => !mission.done)
  const leftText = left
    .slice(0, 2)
    .map((mission) => mission.title)
    .join(' · ')

  const alarms: (Alarm | null)[] = []
  if (left.length > 0) {
    alarms.push(
      makeMissionAlarm(todayKey, 'morning', MORNING_TIME, '☀️ 오늘의 미션', leftText),
      makeMissionAlarm(
        todayKey,
        'afterSchool',
        getAfterSchoolTime(input.lastPeriodToday),
        '🎒 하교했지? 남은 미션',
        leftText,
      ),
      makeMissionAlarm(
        todayKey,
        'evening',
        EVENING_TIME,
        `🌙 미션 ${left.length}개 남았어`,
        `${leftText} — 코치랑 오늘 마무리하자`,
      ),
    )
  }
  const tomorrowBody = '코치가 오늘의 미션 3개를 골라 뒀어. 눌러서 시작하자.'
  alarms.push(
    makeMissionAlarm(tomorrowKey, 'morning', MORNING_TIME, '☀️ 오늘의 미션', tomorrowBody),
    makeMissionAlarm(
      tomorrowKey,
      'afterSchool',
      DEFAULT_AFTER_SCHOOL_TIME,
      '🎒 하교했지? 오늘의 미션',
      tomorrowBody,
    ),
    makeMissionAlarm(tomorrowKey, 'evening', EVENING_TIME, '🌙 오늘의 미션', tomorrowBody),
  )

  return alarms
    .filter((alarm): alarm is Alarm => alarm !== null)
    .filter((alarm) => alarm.at > input.now)
    .filter((alarm) => !isWithinQuietHours(new Date(alarm.at), input.quietHours))
}

// ---- 저장소에서 읽기 ----

/** 오늘 끝낸 공부 기록 (놀기 제외). 날짜는 새벽 4시 기준으로 시작한 날입니다. */
function loadTodaySessions(todayKey: string): StudySession[] {
  return loadStudySessions().filter((session) => toDayKey(session.startedAt) === todayKey)
}

/** 저장소의 체크인 · 공부 기록 · 오늘 시간표로 오늘의 미션을 만듭니다. */
export function loadDailyMissions(todayKey: string): Mission[] {
  const cards = loadSavedCards() ?? []
  const schoolDay = loadSchoolDay(todayKey)
  return buildDailyMissions({
    hasCheckIn: hasCheckIn(todayKey),
    todaySessions: loadTodaySessions(todayKey),
    subjects: schoolDay?.subjects ?? [],
    cardTitleOf: (cardId) => cards.find((card) => card.id === cardId)?.title,
  })
}

/**
 * 지금의 미션 알림 목록을 저장소에서 만듭니다. (hooks/useAppBridge.ts 가 카드 알림과 합쳐서 보냅니다)
 * 저장된 값이 깨져 있어도 앱이 멈추지 않게, 문제가 생기면 빈 목록입니다.
 */
export function loadMissionAlarms(now: number): Alarm[] {
  try {
    const todayKey = toDayKey(now)
    return buildMissionAlarms({
      now,
      todayMissions: loadDailyMissions(todayKey),
      lastPeriodToday: loadSchoolDay(todayKey)?.lastPeriod ?? null,
      quietHours: toQuietHours(getMessageSettings()),
    })
  } catch {
    return []
  }
}
