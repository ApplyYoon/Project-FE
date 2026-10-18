/**
 * 오늘의 미션 (2026-10-18 사용자 결정: "오늘의 기분은 미션 알림 + 코치가 채팅에서 묻기, 첫 화면을 막던 체크인은 없앰")
 *
 * 하루에 미션 3~4개를 만들고, 이미 있는 기록(체크인 · 공부 기록)으로 끝났는지 봅니다. 따로 입력받지 않습니다.
 *   1. 컨디션 알려 주기        — 오늘 체크인이 있으면 끝 (코치 채팅의 컨디션 칩을 누르면 저장됨)
 *   2. 폰 엎어 두고 첫 공부 시작 — 오늘 끝낸 공부 기록이 하나라도 있으면 끝
 *   3~4. 공부 미션 1~2개       — 그 이름의 카드로 공부했으면 끝
 *
 * 공부 미션은 "내가 준비하는 것"(lib/studyFocus.ts)과 오늘 시간표 · 가까운 시험으로 정합니다. (2026-10-18)
 *   - 진짜 로그인: AI 가 짠 미션(lib/aiMissionsApi.ts, 하루 한 번 받아 저장) 2개까지. 화면에 'AI 추천' 이라고 붙입니다.
 *   - 못 받았거나 테스트 로그인: 아래 규칙 미션 1개 (ruleStudyMission)
 *       내신(또는 아직 모름) → 오늘 배운 ○○ 10분 복습 (시험 D-14 안이면 시험 범위 ○○ 25분)
 *       수능 → 수능 기출 ○○ 3문제 (15분)
 *       대회 · 기타 → {이름} 준비 25분
 *
 * 앱 안이면 아침 · 하교 무렵 · 저녁에 "오늘의 미션" 휴대폰 알림을 예약합니다. (buildMissionAlarms → hooks/useAppBridge.ts)
 * 알림을 누르면 코치 화면(/?mission=morning 등)이 열리고 코치가 미션을 먼저 말합니다. (pages/CoachPage.tsx)
 * React 를 쓰지 않는 순수 함수와, 저장소를 읽는 함수(load…)로 나눠 두었습니다.
 */
import {
  aiMissionsInputKey,
  loadCachedAiMissions,
  type AiMission,
  type AiMissionsInput,
} from '@/lib/aiMissionsApi'
import type { Alarm } from '@/lib/appBridge'
import { loadSavedCards } from '@/lib/cards'
import { loadStudySessions, sessionMinutes } from '@/lib/dailyRecords'
import { moveDateKey, toDayKey } from '@/lib/date'
import { getPlannedStartAt } from '@/lib/facts'
import { getMessageSettings } from '@/lib/messageSettings'
import { nearestMyEvent } from '@/lib/myEvents'
import { toQuietHours } from '@/lib/notifications'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { hasCheckIn, loadLocalCheckIn } from '@/lib/quickCheckIn'
import { isWithinQuietHours, type QuietHours } from '@/lib/safetyBrake'
import { gradeNumberOf } from '@/lib/schoolEvents'
import { loadSchoolClass, loadSchoolDay, type SchoolDay } from '@/lib/schoolToday'
import { loadData, saveData } from '@/lib/storage'
import { loadStudyFocus, type StudyFocus } from '@/lib/studyFocus'
import { COACH_PATH } from '@/lib/tabMenu'
import type { StudySession } from '@/types'

export type MissionKind = 'checkIn' | 'firstStudy' | 'study'

/** 미션 하나 */
export interface Mission {
  kind: MissionKind
  /** 화면 · 알림에 쓰는 이름. 예) '오늘 배운 미적분Ⅰ 10분 복습' */
  title: string
  done: boolean
  /** 공부 미션: [▷ 시작] 을 누르면 이 제목의 카드를 만들어 바로 시작합니다. 없으면 '오늘 공부 25분 채우기' 처럼 즉석 시작 */
  cardTitle?: string
  /** 공부 미션의 길이 (분) */
  minutes?: number
  /** 공부 미션이 이어지는 오늘 시간표 과목 */
  subject?: string
  /** AI 가 정한 미션이면 true (화면에 'AI 추천' 이라고 붙입니다) */
  isAi?: boolean
}

/** 복습 미션의 길이 (분) */
export const REVIEW_MINUTES = 10
/** 시간표를 모를 때 공부 미션: 오늘 공부를 이만큼 채우기 (분) */
export const DAILY_GOAL_MINUTES = 25
/** 수능 기출 미션의 길이 (분) */
export const SUNEUNG_MINUTES = 15
/** 시험 범위 · 대회 준비 미션의 길이 (분) */
export const FOCUS_MINUTES = 25
/** 시험이 이만큼(일) 안이면 내신 미션을 "시험 범위" 로 바꿉니다. */
export const EXAM_MISSION_DAYS = 14
/** AI 미션은 이만큼까지 씁니다. (체크인 · 첫 공부와 합쳐 4개) */
const MAX_AI_MISSIONS = 2

// 복습 미션으로 고르지 않는 과목 (공부라기보다 활동이라서)
const NOT_REVIEW_SUBJECTS = ['체육', '창의적 체험활동', '자율', '동아리', '진로']

export interface MissionInput {
  /** 오늘 체크인을 했는지 */
  hasCheckIn: boolean
  /** 오늘 끝낸 공부 기록 (놀기 제외) */
  todaySessions: StudySession[]
  /** 오늘 시간표 과목 (교시 순서, 모르면 빈 목록) */
  subjects: string[]
  /** 카드 번호 → 카드 제목 (공부 미션을 했는지 볼 때 씀) */
  cardTitleOf: (cardId: string) => string | undefined
  /** 내가 준비하는 것. 아직 안 골랐으면 null (내신처럼 다룹니다) */
  focus?: StudyFocus | null
  /** 가장 가까운 내 학년 시험. 없으면 null */
  exam?: { name: string; dDay: number } | null
  /** AI 가 짠 오늘의 공부 미션. 없으면(못 받음 · 테스트 로그인) null */
  aiMissions?: AiMission[] | null
}

/** 규칙으로 정한 공부 미션 하나 (done 은 buildDailyMissions 가 정함) */
interface StudyMissionPlan {
  title: string
  cardTitle?: string
  minutes: number
  subject?: string
  /** true 면 그 과목 이름이 들어간 카드로 공부해도 끝 (복습 미션) */
  doneBySubject?: boolean
}

/** 시간표에서 복습할 과목 하나를 고릅니다. 활동 과목은 빼고 첫 과목입니다. 없으면 undefined */
export function pickReviewSubject(subjects: string[]): string | undefined {
  return subjects.find((subject) => !NOT_REVIEW_SUBJECTS.some((word) => subject.includes(word)))
}

/**
 * 준비하는 것 · 시간표 · 시험으로 규칙 공부 미션 하나를 정합니다. (AI 미션을 못 받았을 때)
 *
 *   ruleStudyMission({ kind: 'SUNEUNG', name: null }, ['미적분Ⅰ'], null)
 *   -> { title: '수능 기출 미적분Ⅰ 3문제 (15분)', cardTitle: '수능 기출 미적분Ⅰ 3문제', minutes: 15, subject: '미적분Ⅰ' }
 *   ruleStudyMission({ kind: 'CONTEST', name: '정보올림피아드' }, [], null)
 *   -> { title: '정보올림피아드 준비 25분', cardTitle: '정보올림피아드 준비', minutes: 25 }
 *   ruleStudyMission(null, ['미적분Ⅰ'], { name: '2학기 2차 정기시험', dDay: 9 })
 *   -> { title: '시험 범위 미적분Ⅰ 25분', cardTitle: '미적분Ⅰ 시험 범위', minutes: 25, subject: '미적분Ⅰ' }
 */
export function ruleStudyMission(
  focus: StudyFocus | null,
  subjects: string[],
  exam: { name: string; dDay: number } | null,
): StudyMissionPlan {
  const subject = pickReviewSubject(subjects)
  if (focus?.kind === 'SUNEUNG') {
    return subject
      ? {
          title: `수능 기출 ${subject} 3문제 (${SUNEUNG_MINUTES}분)`,
          cardTitle: `수능 기출 ${subject} 3문제`,
          minutes: SUNEUNG_MINUTES,
          subject,
        }
      : {
          title: `수능 기출 3문제 (${SUNEUNG_MINUTES}분)`,
          cardTitle: '수능 기출 3문제',
          minutes: SUNEUNG_MINUTES,
        }
  }
  // 대회는 이름이 없어도 '대회 준비', 기타는 이름이 있을 때만 '{이름} 준비'
  const focusName =
    focus?.kind === 'CONTEST' ? (focus.name ?? '대회') : focus?.kind === 'OTHER' ? focus.name : null
  if (focusName) {
    return {
      title: `${focusName} 준비 ${FOCUS_MINUTES}분`,
      cardTitle: `${focusName} 준비`,
      minutes: FOCUS_MINUTES,
    }
  }
  // 내신(또는 아직 안 고름): 시험이 2주 안이면 시험 범위, 아니면 오늘 배운 과목 복습
  const isExamSoon = exam !== null && exam.dDay <= EXAM_MISSION_DAYS
  if (subject && isExamSoon) {
    return {
      title: `시험 범위 ${subject} ${FOCUS_MINUTES}분`,
      cardTitle: `${subject} 시험 범위`,
      minutes: FOCUS_MINUTES,
      subject,
      doneBySubject: true,
    }
  }
  if (subject) {
    return {
      title: `오늘 배운 ${subject} ${REVIEW_MINUTES}분 복습`,
      cardTitle: `${subject} 복습`,
      minutes: REVIEW_MINUTES,
      subject,
      doneBySubject: true,
    }
  }
  if (isExamSoon) {
    return { title: `시험 대비 ${FOCUS_MINUTES}분`, cardTitle: '시험 대비', minutes: FOCUS_MINUTES }
  }
  return { title: `오늘 공부 ${DAILY_GOAL_MINUTES}분 채우기`, minutes: DAILY_GOAL_MINUTES }
}

/**
 * 오늘의 미션 3~4개를 만듭니다.
 *
 *   buildDailyMissions({ hasCheckIn: true, todaySessions: [], subjects: ['미적분Ⅰ', '문학'], cardTitleOf })
 *   -> [ { kind: 'checkIn', title: '컨디션 알려 주기', done: true },
 *        { kind: 'firstStudy', title: '폰 엎어 두고 첫 공부 시작', done: false },
 *        { kind: 'study', title: '오늘 배운 미적분Ⅰ 10분 복습', cardTitle: '미적분Ⅰ 복습', minutes: 10, … } ]
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
  const studiedTitles = input.todaySessions.map(
    (session) => input.cardTitleOf(session.cardId ?? '') ?? '',
  )
  /** 그 제목(또는 과목)이 들어간 카드로 공부했는지 */
  const hasStudied = (text: string) => studiedTitles.some((title) => title.includes(text))

  const aiMissions = (input.aiMissions ?? []).slice(0, MAX_AI_MISSIONS)
  if (aiMissions.length > 0) {
    for (const mission of aiMissions) {
      missions.push({
        kind: 'study',
        title: mission.title,
        cardTitle: mission.title,
        minutes: mission.minutes,
        subject: mission.subject ?? undefined,
        isAi: true,
        done: hasStudied(mission.title),
      })
    }
    return missions
  }

  const plan = ruleStudyMission(input.focus ?? null, input.subjects, input.exam ?? null)
  const totalMinutes = input.todaySessions.reduce(
    (sum, session) => sum + sessionMinutes(session),
    0,
  )
  const done = plan.cardTitle
    ? hasStudied(plan.cardTitle) || (plan.doneBySubject === true && hasStudied(plan.subject ?? ''))
    : totalMinutes >= plan.minutes
  missions.push({
    kind: 'study',
    title: plan.title,
    cardTitle: plan.cardTitle,
    minutes: plan.minutes,
    subject: plan.subject,
    done,
  })
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
  // 코치 주소는 상수로 씁니다. (탭 순서가 바뀌어도 알림이 코치를 열게)
  return { id: `mission-${dateKey}-${slot}`, at, title, body, url: `${COACH_PATH}?mission=${slot}` }
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
  const tomorrowBody = '코치가 오늘의 미션을 골라 뒀어. 눌러서 시작하자.'
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

/** 적어 둔 시험 중 가장 가까운 내 학년 시험 (60일 안). 없으면 null */
function nearestSavedExam(
  schoolDay: SchoolDay | null,
  grade: number | null,
): { name: string; dDay: number } | null {
  const exam = (schoolDay?.exams ?? []).find(
    (item) =>
      item.dDay >= 0 &&
      item.dDay <= 60 &&
      (grade === null || item.grades.length === 0 || item.grades.includes(grade)),
  )
  return exam ? { name: exam.name, dDay: exam.dDay } : null
}

/** 적어 둔 학교 시험 중 가장 가까운 내 학년 시험 (저장소에서) */
function loadNearestSchoolExam(todayKey: string): { name: string; dDay: number } | null {
  const grade = loadSchoolClass()?.grade ?? gradeNumberOf(loadOnboardingAnswers()?.grade)
  return nearestSavedExam(loadSchoolDay(todayKey), grade)
}

/**
 * AI 미션을 부탁할 때 보낼 것을 저장소에서 모읍니다. (코치 화면이 서버에 묻고, 오늘의 미션도 같은 입력으로 저장된 답을 찾음)
 * 시험은 학교 시험과 내 일정(대회 등, lib/myEvents.ts) 중 더 가까운 것입니다.
 * 컨디션은 오늘 체크인이 있을 때만 넣습니다.
 */
export function loadAiMissionsInput(todayKey: string): AiMissionsInput {
  const schoolExam = loadNearestSchoolExam(todayKey)
  const myEvent = nearestMyEvent(todayKey)
  const exam =
    schoolExam === null
      ? myEvent
      : myEvent === null || schoolExam.dDay <= myEvent.dDay
        ? schoolExam
        : myEvent
  return {
    focus: loadStudyFocus(),
    subjects: loadSchoolDay(todayKey)?.subjects ?? [],
    exam,
    condition: loadLocalCheckIn(todayKey)?.condition ?? null,
  }
}

/** 저장소의 체크인 · 공부 기록 · 오늘 시간표 · 준비하는 것 · 저장해 둔 AI 미션으로 오늘의 미션을 만듭니다. */
export function loadDailyMissions(todayKey: string): Mission[] {
  const cards = loadSavedCards() ?? []
  const input = loadAiMissionsInput(todayKey)
  return buildDailyMissions({
    hasCheckIn: hasCheckIn(todayKey),
    todaySessions: loadTodaySessions(todayKey),
    subjects: input.subjects,
    cardTitleOf: (cardId) => cards.find((card) => card.id === cardId)?.title,
    focus: input.focus,
    // 규칙 미션의 "시험 범위" 는 학교 시험만 봅니다. (대회 날짜로 내신 미션이 바뀌지 않게)
    exam: loadNearestSchoolExam(todayKey),
    // 지금 입력과 같은 입력으로 받아 둔 AI 미션만 씁니다. (준비하는 것을 바꿨으면 규칙 미션 → 새로 받으면 AI 미션)
    aiMissions: loadCachedAiMissions(todayKey, aiMissionsInputKey(input)) ?? null,
  })
}

// 미션 알림을 껐는지 넣어 두는 이름 (실제 키는 'study-mission-alerts-off'). 설정의 "알림" 에서 켜고 끕니다.
const MISSION_ALERTS_OFF_KEY = 'mission-alerts-off'

/** 미션 알림이 켜져 있는지 (처음에는 켜져 있습니다) */
export function isMissionAlertsOn(): boolean {
  return loadData<unknown>(MISSION_ALERTS_OFF_KEY, false) !== true
}

/** 미션 알림을 켜거나 끕니다. 끄면 다음 확인(10초 안)에 앱의 예약에서도 빠집니다. */
export function setMissionAlertsOn(isOn: boolean): void {
  saveData(MISSION_ALERTS_OFF_KEY, !isOn)
}

/**
 * 지금의 미션 알림 목록을 저장소에서 만듭니다. (hooks/useAppBridge.ts 가 카드 알림과 합쳐서 보냅니다)
 * 미션 알림을 껐으면 빈 목록입니다. 저장된 값이 깨져 있어도 앱이 멈추지 않게, 문제가 생기면 빈 목록입니다.
 */
export function loadMissionAlarms(now: number): Alarm[] {
  if (!isMissionAlertsOn()) return []
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
