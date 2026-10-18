import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { MissionBar } from '@/components/ui/MissionBar'
import { PlanCard } from '@/components/ui/PlanCard'
import { SettingsLink } from '@/components/ui/SettingsLink'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAiMessages } from '@/hooks/useAiMessages'
import { useAuth } from '@/hooks/useAuth'
import { useCards } from '@/hooks/useCards'
import { useSendCheckIn } from '@/hooks/useCheckInSync'
import { useQueryParam } from '@/hooks/useQueryParam'
import { countUnreadAiMessages } from '@/lib/aiMessages'
import { ApiError, getApiErrorMessage } from '@/lib/api'
import { finishCall, type CallLine } from '@/lib/callReview'
import { loadCardMarks } from '@/lib/cardMarks'
import { createInstantCardNow } from '@/lib/cardSession'
import { countsForCheckCall } from '@/lib/checkCall'
import { MAX_CHAT_TEXT_LENGTH, sendChatMessage, startChat, type ChatReply } from '@/lib/chatApi'
import { canSyncCheckIns, todayCheckInForCoachQuery } from '@/lib/checkInsApi'
import {
  SKIP_FOCUS_NAME_LABEL,
  buildFocusDateQuestion,
  buildFocusNameQuestion,
  buildFocusQuestion,
  buildFocusReaction,
  buildMissionBriefing,
  buildMissionProgress,
  buildMorningBriefing,
  buildSessionRecap,
  chipsFromServer,
  codeChipsFor,
  findRecapSession,
  loadPhoneLift,
  PLAN_CHIP,
  QUIZ_CHIP,
  quizChipForCard,
  type CoachChip,
  type CoachMessage,
} from '@/lib/coachBriefing'
import { loadFocusScore } from '@/lib/focusScore'
import {
  DAILY_MINUTES_OPTIONS,
  DEFAULT_DAILY_MINUTES,
  LIGHTER_REQUEST,
  MAX_LONG_PLAN_DAYS,
  MAX_PLAN_TEXT_LENGTH,
  makeDemoDayPlan,
  makeDemoLongPlan,
  parseLongPlanText,
  planFromCards,
  planReviseLabels,
  planToCards,
  requestDayPlan,
  requestLongPlan,
  reviseDayPlan,
  reviseDemoPlan,
  reviseLongPlan,
  withDemoFallback,
  type CoachPlan,
  type LongPlanInput,
  type PlanReply,
  type PlanStatus,
} from '@/lib/coachPlan'
import {
  dayLabel,
  hasStudentLine,
  loadCoachThread,
  needsNewSession,
  newSessionStart,
  nextBubbleId,
  saveCoachThread,
  sessionLines,
  type CoachThread,
  type ThreadBubble,
} from '@/lib/coachThread'
import { cn } from '@/lib/cn'
import { runDailyCareStage } from '@/lib/dailyCareRun'
import {
  countDoneMissions,
  isMissionSlot,
  loadDailyMissions,
  nextMission,
  type Mission,
} from '@/lib/dailyMission'
import { loadAllSessions, loadStudySessions } from '@/lib/dailyRecords'
import { isServerDataToken } from '@/lib/dataMode'
import { getTodayKey, moveDateKey, toDayKey } from '@/lib/date'
import { replyDemo } from '@/lib/demoCoach'
import { YOUTH_HELP_LINE } from '@/lib/helpLines'
import { getUpcomingMyEvents, saveMyEvent } from '@/lib/myEvents'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { shrinkPhoto } from '@/lib/photoCards'
import { loadLocalCheckIn, saveLocalCheckIn, saveQuickCheckIn } from '@/lib/quickCheckIn'
import { loadRestDays } from '@/lib/restDays'
import { gradeNumberOf } from '@/lib/schoolEvents'
import { loadSchoolClass, schoolTodayOrNullQuery, type SchoolToday } from '@/lib/schoolToday'
import { loadData, saveData } from '@/lib/storage'
import {
  FOCUS_NAME_MAX,
  cleanFocusName,
  focusLabelOf,
  loadStudyFocus,
  needsFocusName,
  saveStudyFocus,
} from '@/lib/studyFocus'
import {
  MAX_QUIZ_MATERIAL_LENGTH,
  MAX_QUIZ_TOPIC_LENGTH,
  PHOTO_QUIZ_TOPIC,
  answerQuiz,
  countCorrect,
  loadYesterdayWrong,
  makeDemoQuiz,
  newQuiz,
  nextQuizStep,
  parseQuizText,
  requestQuizOrDemo,
  retryOneQuestion,
  saveQuizResult,
  toQuizResult,
  wrongQuestionsOf,
  type CoachQuiz,
  type QuizInput,
  type QuizQuestion,
  type QuizReply,
} from '@/lib/studyQuiz'
import { getTodayCardsState } from '@/lib/todayCards'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

// 코치가 결과를 먼저 물어본 마지막 공부 기록 번호. 같은 기록을 두 번 묻지 않으려고 저장합니다. (대화 내용이 아니라 번호만)
const RECAPPED_SESSION_KEY = 'coach-recapped-session'

// 코치가 마지막으로 알아챈 "오늘의 미션 몇 개 끝" ('2026-10-18:2' 모양). 미션을 끝내고 돌아오면 코치가 먼저 말을 겁니다.
const MISSION_PROGRESS_KEY = 'coach-mission-progress'

// 조용히 정리를 보낸 서버 채팅 번호들. 개발 모드(StrictMode)는 effect 를 두 번 돌려서, 한 번만 보내려고 둡니다.
const finishedChatIds = new Set<string>()

/** 저장해 둔 미션 진행이 오늘 몇 개였는지. 오늘 것이 아니면 null */
function loadMissionProgress(todayKey: string): number | null {
  const saved = loadData<unknown>(MISSION_PROGRESS_KEY, null)
  if (typeof saved !== 'string') return null
  const [date, done] = saved.split(':')
  const count = Number(done)
  return date === todayKey && Number.isInteger(count) ? count : null
}

/**
 * 지난 서버 세션을 조용히 정리합니다. (POST /calls/{id}/finish — 요약 · 생각 습관 · 약속이 서버에 남음)
 * 정리한 요약은 다음 세션 대본의 [지난 통화] 가 되어, AI 가 "어제 약속 지켰어?" 처럼 이어서 물어봅니다.
 * 결과 화면으로 가지 않고, 실패해도 대화방은 그대로입니다. (이미 정리됐거나 서버가 잊었으면 4xx 라서 그냥 넘어갑니다)
 */
function finishQuietly(chatId: string, lines: CallLine[]) {
  if (finishedChatIds.has(chatId) || !hasStudentLine(lines)) return
  finishedChatIds.add(chatId)
  void finishCall({ callId: chatId, lines }).catch(() => undefined)
}

/**
 * 서버가 거절한 이유를 학생이 이해할 수 있는 문장으로 바꿉니다.
 * (테스트 로그인은 서버를 안 부르고 시연용 정해진 답을 쓰므로 여기까지 오지 않습니다)
 */
function getChatErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'AI 코치와의 대화는 구글로 로그인한 계정에서만 쓸 수 있어요.'
  }
  return getApiErrorMessage(error)
}

/**
 * 코치 탭("/coach", 두 번째 탭) — AI 코치(멘토)와 이어서 이야기하는 대화방 하나입니다. (2026-10-18, BE #238 · #307)
 * 사용자 결정: "채팅 탭은 무조건 하나", "멘토와 연속적인 대화를 한다는 느낌으로".
 *
 *   1. 지난 대화가 이 기기에 남아 있어서 다시 열면 이어서 보입니다. 날이 바뀌면 날짜 구분선이 생깁니다. (lib/coachThread.ts)
 *   2. 그날 처음 열면 코치가 먼저 말을 겁니다. (아침 브리핑: 시간표 · 급식 · 시험 D-day · 오늘 카드 · 컨디션 묻기)
 *      이 첫 말은 코드가 만듭니다(lib/coachBriefing.ts). 그래서 열기만 해서는 AI 사용량을 쓰지 않습니다.
 *      공부가 끝난 뒤 · 미션을 끝낸 뒤 · 미션 알림을 누르고 들어왔을 때도 코치가 먼저 말을 겁니다.
 *   3. 칩을 누르거나 말을 쓰면 AI 가 답합니다.
 *      - 진짜 로그인: 그때 서버 채팅을 엽니다. 서버 세션은 하루 단위이고, 날이 바뀌면 지난 세션을 조용히 정리해서
 *        요약을 남깁니다. 다음 날 AI 는 그 요약(서버 대본의 [지난 통화])으로 지난 약속을 먼저 물어봅니다.
 *      - 테스트 로그인: 서버를 못 써서 시연용 정해진 답(lib/demoCoach.ts)을 쓰고 "시연용 정해진 답" 이라고 붙입니다.
 *   4. AI 가 고른 빠른 답 · 행동이 오면 칩으로 보여 주고, 없으면 코드가 칩을 붙입니다. (핑계 · 계획 · 시험 이야기)
 *      행동 칩(시작 · 카드 만들기 · 계획 짜기)은 누를 때만 실행합니다.
 *   5. 계획 핑퐁 (2026-10-18, lib/coachPlan.ts): 코치가 오늘 계획 · 시험 날까지의 긴 계획(최대 30일)을 먼저 짜서
 *      계획 말풍선으로 보여 주고, 학생이 [줄여 줘] · [주말은 빼 줘] · 자유로운 한 줄로 고칩니다.
 *      [이대로 할게] 를 눌러야 카드로 저장합니다. 긴 계획은 교과서 · 시험 범위 사진도 넣을 수 있습니다. (사진은 저장 안 함)
 *   6. 위기 표현이 나오면 상담 전화 한 줄을 보여 줍니다. 대화는 막지 않습니다.
 *
 * 모바일에서는 화면 높이를 꽉 채웁니다. 말풍선 목록만 스크롤되고, 입력창은 아래(하단 탭 위)에 붙어 있습니다.
 * ⚠️ 대화는 서버에 저장하지 않고 이 기기에만 남깁니다(최근 14일 · 300개). console.log 로 찍지 않습니다.
 */
export function CoachPage() {
  // 하루 1번 관리 단계를 판정해 저장합니다. ("통화가 없으면 다음 날 첫 진입 때", 기획서 5.4)
  // 홈과 코치 중 어디로 먼저 들어와도 판정되게 여기서도 부릅니다. 오늘 이미 판정했으면 아무것도 바꾸지 않습니다.
  useState(() => runDailyCareStage(getTodayKey(), Date.now()))

  return (
    // flex-1 · min-h-0: Layout 이 잡아 준 높이를 꽉 채우고, 안의 목록만 스크롤되게 합니다.
    // 모바일은 바탕을 연회색으로 칠하고(-mx-4 -my-3 으로 Layout 의 여백까지 덮음), 내용은 흰 묶음으로 올립니다.
    <div className="-mx-4 -my-3 flex min-h-0 flex-1 flex-col gap-3 bg-slate-100 px-4 py-3 sm:mx-0 sm:my-0 sm:rounded-3xl sm:p-4">
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-snug font-bold tracking-tight text-slate-900">
            AI 코치
          </h1>
          <p className="truncate text-[15px] text-slate-500">오늘 공부, 같이 잡아 볼까?</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 통화 · 알림 · 설정은 탭 없이 여기(코치 머리)에만 둡니다. (2026-10-18 "탭을 명확히") */}
          <Link to="/call" className={chipClass}>
            <span aria-hidden>📞</span> 통화
          </Link>
          <NotificationsBell />
          <SettingsLink />
        </div>
      </div>

      {/* 첫 말(브리핑)에 쓸 오늘 학교 정보를 받는 동안만 자리 표시를 보여 줍니다. 못 받아도 대화는 열립니다. */}
      <AsyncBoundary pendingFallback={<ChatSkeleton />}>
        <CoachChat />
      </AsyncBoundary>
    </div>
  )
}

/* 종 모양 아이콘 (라이브러리 없이 SVG 를 직접 그립니다) */
function BellIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

/**
 * 알림 화면(/notifications)으로 가는 종 버튼. 안 읽은 알림이 있으면 빨간 점이 뜹니다. (예전에는 모든 화면 헤더에 있었음)
 * 누르기 쉽게 44×44px(h-11 w-11) 입니다.
 */
function NotificationsBell() {
  // 새 알림이 쌓이면 화면을 옮기지 않아도 바로 다시 그려져서 빨간 점이 뜹니다. (hooks/useAiMessages.ts)
  const unreadCount = countUnreadAiMessages(useAiMessages())
  // 화면을 읽어 주는 프로그램이 "알림, 안 읽은 알림 3개" 처럼 개수까지 읽어 줍니다.
  const label = unreadCount > 0 ? `알림, 안 읽은 알림 ${unreadCount}개` : '알림'
  return (
    <Link
      to="/notifications"
      aria-label={label}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
    >
      <BellIcon />
      {unreadCount > 0 && (
        <span
          aria-hidden
          className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
        />
      )}
    </Link>
  )
}

function ChatSkeleton() {
  return (
    <div role="status" className="flex min-h-0 flex-1 flex-col gap-3 rounded-3xl bg-white p-4">
      <span className="sr-only">코치를 부르는 중이에요</span>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-24 w-4/5 rounded-[20px]" />
    </div>
  )
}

/** 코치가 먼저 거는 말(브리핑 · 결과 묻기 · 미션)을 말풍선으로 만듭니다. */
function toCoachBubble(id: number, message: CoachMessage, at: number): ThreadBubble {
  return { id, speaker: 'ai', text: message.text, chips: message.chips, at }
}

/** 대화방 끝에 말풍선 하나를 더한 새 대화방 */
function withBubble(thread: CoachThread, bubble: Omit<ThreadBubble, 'id' | 'at'>): CoachThread {
  const added: ThreadBubble = { ...bubble, id: nextBubbleId(thread.bubbles), at: Date.now() }
  return { ...thread, bubbles: [...thread.bubbles, added] }
}

// ---- 계획 말풍선 (lib/coachPlan.ts, 2026-10-18 계획 핑퐁) ----

/**
 * 계획을 짜거나 고쳐 달라는 요청 하나
 *   day    — 오늘 계획 (light 면 가볍게)
 *   long   — 시험 · 대회 날까지의 긴 계획 (notice 가 있으면 코치의 답 앞에 붙임)
 *   revise — 열려 있는 계획(bubbleId 의 말풍선)을 학생의 요청대로 고치기
 */
type PlanRequest =
  | { type: 'day'; light: boolean }
  | { type: 'long'; input: LongPlanInput; notice: string | null }
  | { type: 'revise'; bubbleId: number; plan: CoachPlan; request: string }

/** 긴 계획 칸에 적는 것 */
interface LongPlanForm {
  goal: string
  /** 'YYYY-MM-DD'. 아직 안 골랐으면 '' */
  endDate: string
  dailyMinutes: number
  /** 줄인 사진(data URL). 이 화면의 기억에만 두고 어디에도 저장하지 않습니다. */
  photo: string | null
}

/** 위기 표현이 감지돼서 계획 대신 하는 말 (아래에 상담 전화 한 줄이 같이 보임) */
const PLAN_HELP_REPLY = '계획은 잠깐 미뤄 두자. 마음이 힘들면 아래 번호로 언제든 이야기해도 돼.'

/** 계획 말풍선마다 pickStatus 가 돌려준 상태로 바꿉니다. (null 이면 그대로) */
function withPlanStatus(
  thread: CoachThread,
  pickStatus: (bubble: ThreadBubble) => PlanStatus | null,
): CoachThread {
  const bubbles = thread.bubbles.map((bubble) => {
    if (!bubble.plan) return bubble
    const status = pickStatus(bubble)
    return status ? { ...bubble, plan: { ...bubble.plan, status } } : bubble
  })
  return { ...thread, bubbles }
}

/** 계획을 짜거나 고친 결과를 대화방 끝에 붙입니다. */
function applyPlanReply(thread: CoachThread, result: PlanReply, request: PlanRequest): CoachThread {
  if (result.showHelp) {
    return withBubble({ ...thread, isHelpShown: true }, { speaker: 'ai', text: PLAN_HELP_REPLY })
  }
  if (result.plan) {
    // 새 계획이 나오면 열려 있던 계획은 끝납니다. 고친 계획이면 그 전 것은 '고치기 전', 나머지는 '닫음'
    const closed = withPlanStatus(thread, (bubble) => {
      if (bubble.plan?.status !== 'open') return null
      return request.type === 'revise' && bubble.id === request.bubbleId ? 'replaced' : 'closed'
    })
    return withBubble(closed, { speaker: 'ai', text: result.reply, plan: result.plan })
  }
  // 새 계획이 없으면 코치의 한 줄만 붙입니다. "다 빼 줘" 로 계획이 비었으면 그 계획은 닫습니다.
  const next =
    result.cleared && request.type === 'revise'
      ? withPlanStatus(thread, (bubble) => (bubble.id === request.bubbleId ? 'closed' : null))
      : thread
  return withBubble(next, {
    speaker: 'ai',
    text: result.reply,
    ...(result.isDemo ? { isDemo: true } : {}),
  })
}

/** 오늘 시간표의 과목 (겹치지 않게). AI 가 오늘 계획의 카드 글을 쓸 때 참고합니다. */
function todaySubjectsOf(school: SchoolToday | null): string[] {
  const subjects: string[] = []
  for (const period of school?.timetable ?? []) {
    if (!subjects.includes(period.subject)) subjects.push(period.subject)
  }
  return subjects
}

// ---- 문제 말풍선 (lib/studyQuiz.ts, 2026-10-18 확인 문제) ----

/** 확인 문제 칸에 적는 것 */
interface QuizForm {
  /** 무엇에 대한 문제인지. 오늘 카드를 고르면 그 카드 제목이 들어갑니다. */
  topic: string
  /** 고른 오늘 카드 번호. 직접 적었으면 null */
  cardId: string | null
  /** 고른 카드의 체크리스트 */
  checklist: string[]
  /** 붙여 넣은 필기 · 교과서 글 (선택) */
  material: string
  /** 줄인 사진(data URL). 이 화면의 기억에만 두고 어디에도 저장하지 않습니다. */
  photo: string | null
}

/** 위기 표현이 감지돼서 문제 대신 하는 말 (아래에 상담 전화 한 줄이 같이 보임) */
const QUIZ_HELP_REPLY = '문제는 잠깐 미뤄 두자. 마음이 힘들면 아래 번호로 언제든 이야기해도 돼.'

/** 대화방에서 bubbleId 말풍선의 문제를 change 로 바꾼 새 대화방 */
function withQuiz(
  thread: CoachThread,
  bubbleId: number,
  change: (quiz: CoachQuiz) => CoachQuiz,
): CoachThread {
  const bubbles = thread.bubbles.map((bubble) =>
    bubble.id === bubbleId && bubble.quiz ? { ...bubble, quiz: change(bubble.quiz) } : bubble,
  )
  return { ...thread, bubbles }
}

/** 새 문제를 내기 전에, 풀다 만 문제 말풍선은 접습니다. (결과는 다 푼 것만 남음) */
function closeOpenQuizzes(thread: CoachThread): CoachThread {
  const bubbles = thread.bubbles.map((bubble) =>
    bubble.quiz && (bubble.quiz.status === 'open' || bubble.quiz.status === 'guessCheck')
      ? { ...bubble, quiz: { ...bubble.quiz, status: 'closed' as const } }
      : bubble,
  )
  return { ...thread, bubbles }
}

/** 문제 말풍선을 대화방 끝에 붙입니다. (서버를 부르지 않는 "틀린 문제 다시" 도 이걸로) */
function withNewQuiz(
  thread: CoachThread,
  text: string,
  quiz: { topic: string; cardId: string | null; questions: QuizQuestion[]; isDemo: boolean },
): CoachThread {
  const made = newQuiz({ ...quiz, now: Date.now() })
  return withBubble(closeOpenQuizzes(thread), { speaker: 'ai', text, quiz: made })
}

/** 문제를 받은 결과를 대화방 끝에 붙입니다. */
function applyQuizReply(thread: CoachThread, result: QuizReply, input: QuizInput): CoachThread {
  if (result.showHelp) {
    return withBubble({ ...thread, isHelpShown: true }, { speaker: 'ai', text: QUIZ_HELP_REPLY })
  }
  if (result.notStudy) {
    return withBubble(thread, {
      speaker: 'ai',
      text: '공부 자료가 아닌 것 같아. 교과서나 필기 사진으로 다시 해 볼래?',
      chips: [QUIZ_CHIP],
    })
  }
  if (result.questions === null) {
    return withBubble(thread, {
      speaker: 'ai',
      text: '이번엔 문제를 못 만들었어. 주제를 조금 더 자세히 적어 줄래?',
      chips: [QUIZ_CHIP],
    })
  }
  const lines = [
    ...(result.notice ? [result.notice] : []),
    `'${input.topic}' 문제 ${result.questions.length}개 낼게. 천천히 풀어 봐!`,
  ]
  return withNewQuiz(thread, lines.join('\n'), {
    topic: input.topic,
    cardId: input.cardId,
    questions: result.questions,
    isDemo: result.isDemo,
  })
}

function CoachChat() {
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const isServerData = isServerDataToken(token)
  const [todayKey] = useState(getTodayKey)
  const [now] = useState(() => Date.now())
  const sendCheckIn = useSendCheckIn()
  // 미션 알림을 누르고 들어오면 ?mission=morning 처럼 옵니다. 코치가 그 미션 이야기를 먼저 합니다.
  const [missionParam, setMissionParam] = useQueryParam('mission', '')

  // 첫 말의 재료: 오늘 학교 정보(못 받으면 null) · 오늘 카드 · 오늘 체크인
  const [schoolClass] = useState(loadSchoolClass)
  const { data: school } = useSuspenseQuery(
    schoolTodayOrNullQuery(schoolClass, isServerData, todayKey),
  )
  // 다른 기기에서 이미 오늘 컨디션을 알려 줬으면 이 기기에 옮겨 적습니다. (그러면 코치가 다시 묻지 않음)
  useSuspenseQuery(todayCheckInForCoachQuery(todayKey, canSyncCheckIns(token)))
  // 오늘의 미션 (체크인 · 오늘 카드 · 공부 기록으로 끝났는지 봄). 컨디션 칩을 누르면 다시 계산합니다.
  const [missions, setMissions] = useState<Mission[]>(() => loadDailyMissions(todayKey))
  // "내가 준비하는 것" 을 묻는 중 어디까지 왔는지 (대회 · 기타일 때만 이름 → 날짜를 더 묻습니다)
  //   name: 학생이 쓴 다음 한 줄을 이름으로 저장 · date: 날짜를 고르거나 [아직 몰라] 를 기다림
  const [focusStep, setFocusStep] = useState<'name' | 'date' | null>(null)
  // 날짜 고르기 칸을 열었는지 ([📅 날짜 고르기] 칩)
  const [isPickingDate, setIsPickingDate] = useState(false)
  const [pickedDate, setPickedDate] = useState('')
  const { cards, addCard, deleteCard } = useCards()
  const [allSessions] = useState(loadAllSessions)
  const [marks] = useState(loadCardMarks)
  const [restDays] = useState(loadRestDays)
  const todayCards = getTodayCardsState({
    cards,
    sessions: allSessions,
    marks,
    isRestDay: restDays.some((day) => day.date === todayKey),
    todayKey,
    now,
  })
  const nowCard = todayCards.current ?? todayCards.next
  // 오늘 계획을 고칠 때 바꿀 수 있는 카드: 오늘 하루짜리이고 아직 시작 · 처리하지 않은 카드 (반복 카드는 건드리지 않음)
  const editableTodayCards = todayCards.items
    .filter((item) => item.status === 'waiting' || item.status === 'current')
    .map((item) => item.card)
    .filter((card) => card.date === todayKey && !(card.repeatDays && card.repeatDays.length > 0))
  const todaySubjects = todaySubjectsOf(school)
  // 홈의 [코치와 계획 짜기] 로 들어오면 ?plan=today 로 옵니다. 코치가 바로 오늘 계획을 짜 줍니다.
  const [planParam, setPlanParam] = useQueryParam('plan', '')
  // 긴 계획 칸 (목표 · 날짜 · 하루 시간 · 사진). null 이면 닫혀 있습니다.
  const [longForm, setLongForm] = useState<LongPlanForm | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // [🕖 시간 바꿔 줘] 를 눌러 시각 고르기 칸을 열었는지
  const [isPickingTime, setIsPickingTime] = useState(false)
  const [pickedTime, setPickedTime] = useState('')
  // 확인 문제 칸 (주제 · 오늘 카드 · 글 · 사진). null 이면 닫혀 있습니다.
  const [quizForm, setQuizForm] = useState<QuizForm | null>(null)
  // 확인 문제 칸에서 [📄 글 붙여 넣기] 를 눌러 글칸을 열었는지
  const [isMaterialOpen, setIsMaterialOpen] = useState(false)
  // 입력창의 📎 로 고른 사진 (줄인 data URL). 문제 · 계획 중 무엇에 쓸지 고를 때까지 이 화면의 기억에만 둡니다.
  const [chatPhoto, setChatPhoto] = useState<string | null>(null)
  const [chatPhotoError, setChatPhotoError] = useState<string | null>(null)

  // 처음 그릴 때 한 번만 정합니다:
  //   이 기기의 대화방을 꺼내고 → 날이 바뀌었으면 지난 서버 세션을 정리할 준비 + 오늘의 첫 말(브리핑)
  //   → 끝난 공부가 있으면 결과 묻기 → 미션 알림으로 들어왔으면 미션 이야기, 미션을 새로 끝냈으면 몇 개 끝냈는지
  const [initial] = useState(() => {
    let thread = loadCoachThread(user?.id ?? 'unknown')
    let staleSession: { chatId: string; lines: CallLine[] } | null = null
    if (thread.chatId !== null && needsNewSession(thread, now)) {
      staleSession = { chatId: thread.chatId, lines: sessionLines(thread) }
      thread = { ...thread, chatId: null, lastServerAt: null }
    }
    const add = (message: CoachMessage) => {
      const bubble = toCoachBubble(nextBubbleId(thread.bubbles), message, now)
      thread = { ...thread, bubbles: [...thread.bubbles, bubble] }
      return bubble
    }

    const lastBubble = thread.bubbles[thread.bubbles.length - 1]
    const isFirstToday = !lastBubble || toDayKey(lastBubble.at) !== todayKey
    if (isFirstToday) {
      const briefing = add(
        buildMorningBriefing({
          hour: new Date(now).getHours(),
          school,
          grade: schoolClass?.grade ?? gradeNumberOf(loadOnboardingAnswers()?.grade),
          cards: todayCards,
          checkIn: loadLocalCheckIn(todayKey),
          yesterdayWrongCount: loadYesterdayWrong(todayKey).length,
        }),
      )
      // 오늘의 서버 세션은 오늘의 첫 말부터 보냅니다. (어제 대화는 요약으로만 넘어감)
      if (thread.chatId === null)
        thread = { ...thread, sessionFrom: briefing.id, isHelpShown: false }
    }

    const lastRecapped = loadData<unknown>(RECAPPED_SESSION_KEY, null)
    const recapSession = findRecapSession(
      loadStudySessions(),
      now,
      typeof lastRecapped === 'string' ? lastRecapped : null,
    )
    const missionSlot = isMissionSlot(missionParam) ? missionParam : null
    const doneMissions = countDoneMissions(missions)
    const lastProgress = loadMissionProgress(todayKey)
    const hasNewMissionDone = lastProgress !== null && doneMissions > lastProgress
    if (recapSession) {
      const recap = buildSessionRecap(
        recapSession,
        loadPhoneLift(recapSession.id),
        loadFocusScore(recapSession.id),
      )
      // 공부를 끝내서 미션이 늘었으면 같은 말풍선에 한 줄로 붙입니다. (말풍선이 너무 많아지지 않게)
      if (hasNewMissionDone && !missionSlot) {
        recap.text += `\n✅ 오늘의 미션 ${doneMissions}/${missions.length} 끝!`
      }
      // 카드로 공부했으면 그 카드로 확인 문제를 내자고 권합니다. (누를 때만 문제를 냄)
      const recapCard = cards.find((card) => card.id === recapSession.cardId)
      if (recapCard) recap.chips = [...recap.chips, quizChipForCard(recapCard)]
      // 확인 통화로 치는 공부(타이머 10분 이상)면 코치한테 말로 설명하는 통화를 권합니다. (누를 때만, lib/checkCall.ts)
      if (countsForCheckCall(recapSession)) {
        recap.chips = [...recap.chips, { kind: 'checkCall', label: '📞 코치한테 3분 설명하기' }]
      }
      add(recap)
    }
    // 오늘 첫 말이 이미 컨디션을 묻고 있으면(미션 ①), 미션 말풍선으로 같은 걸 또 묻지 않습니다.
    const isAskingCheckIn = isFirstToday && nextMission(missions)?.kind === 'checkIn'
    if (missionSlot && !isAskingCheckIn) {
      add(buildMissionBriefing(missions, missionSlot, nowCard))
    } else if (hasNewMissionDone && !recapSession) {
      add(buildMissionProgress(missions, nowCard))
    }
    return { thread, staleSession, recapSessionId: recapSession?.id ?? null, missionSlot }
  })

  const [thread, setThread] = useState<CoachThread>(initial.thread)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // 대화방이 바뀔 때마다 이 기기에 저장합니다. (다시 열면 이어서 보이게)
  useEffect(() => {
    saveCoachThread(thread, Date.now())
  }, [thread])

  // 날이 바뀌어 닫은 지난 서버 세션을 조용히 정리합니다. (진짜 로그인만)
  const staleSession = initial.staleSession
  useEffect(() => {
    if (staleSession && isServerData) finishQuietly(staleSession.chatId, staleSession.lines)
  }, [staleSession, isServerData])

  // 결과를 물어본 공부 기록 번호를 적어 둡니다. (다음에 같은 기록을 또 묻지 않게)
  useEffect(() => {
    if (initial.recapSessionId) saveData(RECAPPED_SESSION_KEY, initial.recapSessionId)
  }, [initial.recapSessionId])

  // 미션 알림으로 들어왔으면 이야기를 꺼냈으니 주소의 ?mission= 을 지웁니다. (새로고침해도 또 말하지 않게)
  const hasMissionParam = initial.missionSlot !== null
  useEffect(() => {
    if (hasMissionParam) setMissionParam('')
  }, [hasMissionParam, setMissionParam])

  // 코치가 알아챈 미션 진행을 적어 둡니다. 다음에 더 끝내고 돌아오면 그때 말을 겁니다.
  const doneMissionCount = countDoneMissions(missions)
  useEffect(() => {
    saveData(MISSION_PROGRESS_KEY, `${todayKey}:${doneMissionCount}`)
  }, [todayKey, doneMissionCount])

  // 진짜 로그인일 때 AI 의 답을 받습니다. 세션이 없으면 그때 처음 열고,
  // 서버가 대본을 잊었으면(409 — 서버가 다시 켜짐 등) 새로 열어서 한 번 더 보냅니다.
  const talk = useMutation({
    mutationFn: async ({ id, lines }: { id: string | null; lines: CallLine[] }) => {
      let openId = id ?? (await startChat()).chatId
      let reply: ChatReply
      try {
        reply = await sendChatMessage(openId, lines)
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 409)) throw error
        openId = (await startChat()).chatId
        reply = await sendChatMessage(openId, lines)
      }
      return { openId, reply }
    },
    onSuccess: ({ openId, reply }, variables) => {
      // AI 가 고른 빠른 답 · 행동이 있으면 그 칩을, 없으면 코드가 칩을 붙입니다. (핑계 협상 · 계획 · 시험)
      const studentText = variables.lines[variables.lines.length - 1]?.text ?? ''
      const serverChips = chipsFromServer(reply, nowCard)
      const chips = serverChips.length > 0 ? serverChips : codeChipsFor(studentText)
      setThread((current) => ({
        ...withBubble(current, { speaker: 'ai', text: reply.reply, chips }),
        chatId: openId,
        lastServerAt: Date.now(),
        isHelpShown: current.isHelpShown || reply.showHelp,
      }))
    },
  })

  // 계획을 짜거나 고칩니다. (lib/coachPlan.ts)
  //   진짜 로그인: 서버 AI. 서버가 아직 준비 안 됐으면(404 · 503 · 429) 시연용 예시로 대신합니다.
  //   테스트 로그인: 시연용 예시
  const planTalk = useMutation({
    mutationFn: async (request: PlanRequest): Promise<PlanReply> => {
      const focus = loadStudyFocus()
      if (request.type === 'revise') {
        // 시연용 계획은 서버가 고칠 수 없어서 시연용으로 고칩니다.
        if (!isServerData || request.plan.isDemo) {
          return reviseDemoPlan(request.plan, request.request)
        }
        return withDemoFallback(
          () =>
            request.plan.kind === 'day'
              ? reviseDayPlan(request.plan, request.request, { focus, subjects: todaySubjects })
              : reviseLongPlan(request.plan, request.request),
          () => reviseDemoPlan(request.plan, request.request),
        )
      }
      if (request.type === 'long') {
        const demo = () =>
          makeDemoLongPlan({
            todayKey,
            goal: request.input.goal,
            endDate: request.input.endDate,
            dailyMinutes: request.input.dailyMinutes,
            hasPhoto: request.input.image !== null,
            isEventDate: request.input.isEventDate,
          })
        const result = isServerData
          ? await withDemoFallback(() => requestLongPlan(request.input), demo)
          : demo()
        return request.notice ? { ...result, reply: `${request.notice}\n${result.reply}` } : result
      }
      // 오늘 계획: 오늘 카드가 이미 있으면 새로 짜지 않고 그 카드들을 같이 고칩니다.
      if (editableTodayCards.length > 0) {
        const current = planFromCards(editableTodayCards)
        if (!request.light) {
          return {
            showHelp: false,
            reply: '지금 오늘 계획이야. 고칠 곳을 말해 줘. (예: 영어는 빼 줘, 8시부터)',
            plan: current,
            cleared: false,
            isDemo: false,
          }
        }
        if (!isServerData) return reviseDemoPlan(current, LIGHTER_REQUEST)
        return withDemoFallback(
          () => reviseDayPlan(current, LIGHTER_REQUEST, { focus, subjects: todaySubjects }),
          () => reviseDemoPlan(current, LIGHTER_REQUEST),
        )
      }
      const demo = () =>
        makeDemoDayPlan({
          todayKey,
          now: Date.now(),
          subjects: todaySubjects,
          light: request.light,
        })
      if (!isServerData) return demo()
      // 가볍게 짜 달라면 컨디션을 2 로 보냅니다. (서버가 총량을 줄임) 아니면 오늘 체크인의 컨디션
      const condition = request.light ? 2 : (loadLocalCheckIn(todayKey)?.condition ?? null)
      return withDemoFallback(
        () => requestDayPlan({ date: todayKey, focus, subjects: todaySubjects, condition }),
        demo,
      )
    },
    onSuccess: (result, request) => {
      setThread((current) => applyPlanReply(current, result, request))
    },
  })

  // 확인 문제를 받습니다. (lib/studyQuiz.ts)
  //   진짜 로그인: 서버 AI. 서버가 아직 준비 안 됐으면(404 · 503 · 429) 시연용 예시 문제로 대신합니다.
  //   테스트 로그인: 시연용 예시 문제
  const quizTalk = useMutation({
    mutationFn: async (input: QuizInput): Promise<QuizReply> =>
      isServerData ? requestQuizOrDemo(input) : makeDemoQuiz(input),
    onSuccess: (result, input) => {
      setThread((current) => applyQuizReply(current, result, input))
    },
  })
  // AI 의 답이나 계획 · 문제를 기다리는 중인지 (그동안은 새 말 · 칩을 막습니다)
  const isBusy = talk.isPending || planTalk.isPending || quizTalk.isPending

  const bubbles = thread.bubbles
  const lastBubble = bubbles[bubbles.length - 1]
  // 지금 고치는 중인 계획 말풍선. 있으면 학생이 쓰는 말은 이 계획을 고치는 요청이 됩니다.
  const openPlanBubble = bubbles.findLast((bubble) => bubble.plan?.status === 'open')
  // 가장 최근 문제 말풍선. 이것만 펼쳐 보이고, 앞의 문제 말풍선은 결과 한 줄로 접습니다.
  const latestQuizId = bubbles.findLast((bubble) => bubble.quiz)?.id ?? null
  // 확인 문제 칸에서 고를 수 있는 오늘 카드 (다 한 카드 · 지금 카드 · 다음 카드, 5개까지)
  const quizCardOptions = todayCards.items.map((item) => item.card).slice(0, 5)

  // 새 말풍선이 생기면 맨 아래로 내립니다.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [bubbles, isBusy])

  // 홈에서 ?plan=today 로 들어왔으면 오늘 계획을 한 번 짜 줍니다. (주소의 값은 지워서 새로고침해도 또 짜지 않게)
  // 개발 모드(StrictMode)는 effect 를 두 번 돌려서, 한 번만 짜려고 ref 로 표시해 둡니다.
  const mutatePlan = planTalk.mutate
  const hasPlanParam = planParam === 'today'
  const autoPlanStarted = useRef(false)
  useEffect(() => {
    if (!hasPlanParam || autoPlanStarted.current) return
    autoPlanStarted.current = true
    setPlanParam('')
    setThread((current) => withBubble(current, { speaker: 'me', text: PLAN_CHIP.label }))
    mutatePlan({ type: 'day', light: false })
  }, [hasPlanParam, setPlanParam, mutatePlan])

  /**
   * 준비하는 것을 다 정했을 때 코치의 한 줄 반응 (테스트 로그인에서 씀). 날짜를 받았으면 D-day 를 말하고,
   * 오늘 계획을 아직 안 정했으면 같이 정하자고 권합니다. 진짜 로그인은 그 말을 AI 에게 보내서 AI 가 반응합니다.
   */
  function focusReactionNow(): CoachMessage | null {
    const focus = loadStudyFocus()
    if (focus === null) return null
    const myEvent = focus.name
      ? getUpcomingMyEvents(todayKey, 365).find((event) => event.name === focus.name)
      : undefined
    const needsPlan = !missions.some((mission) => mission.kind === 'plan' && mission.done)
    return buildFocusReaction(focus, myEvent?.dDay ?? null, needsPlan)
  }

  /** 학생의 말을 보냅니다. 진짜 로그인은 서버 AI, 테스트 로그인은 시연용 정해진 답이 답합니다. */
  function sendText(raw: string) {
    const text = raw.trim().slice(0, MAX_CHAT_TEXT_LENGTH)
    if (text === '' || isBusy) return
    if (focusStep === null) {
      // 계획 말풍선이 열려 있으면 학생이 쓴 말은 그 계획을 고치는 요청입니다. (계획 핑퐁)
      if (openPlanBubble?.plan) {
        revisePlan(openPlanBubble, text)
        return
      }
      // "11월 2일 중간고사 미적분 계획 짜 줘" 처럼 긴 계획을 부탁하면 바로 짜 줍니다.
      // 날짜를 못 알아들었으면 긴 계획 칸을 열어 날짜를 고르게 합니다.
      const longRequest = parseLongPlanText(text, todayKey)
      if (longRequest) {
        const goal = longRequest.goal || suggestedGoal()
        let notice: string | null = null
        if (longRequest.farEventDate && goal !== '') {
          // 30일보다 먼 날은 계획을 30일치만 짜고, 그 날은 지금 홈 일정에 D-day 로 넣어 둡니다.
          saveMyEvent({
            name: goal.slice(0, FOCUS_NAME_MAX),
            date: longRequest.farEventDate,
            kind: 'focus',
          })
          notice = `${MAX_LONG_PLAN_DAYS}일보다 먼 날이라 우선 ${MAX_LONG_PLAN_DAYS}일치만 짰어. D-day 는 홈 일정에 넣어 뒀어.`
        }
        if (longRequest.endDate && goal !== '') {
          startPlan(
            {
              type: 'long',
              input: {
                goal,
                endDate: longRequest.endDate,
                dailyMinutes: DEFAULT_DAILY_MINUTES,
                image: null,
                focus: loadStudyFocus(),
                isEventDate: longRequest.isEventDate,
              },
              notice,
            },
            text,
          )
        } else {
          openLongForm(goal, text, longRequest.endDate)
        }
        return
      }
      // "미적분 3단원 문제 내 줘" 처럼 문제를 부탁하면 바로 냅니다. 주제를 안 말했으면 주제 칸을 엽니다.
      const quizRequest = parseQuizText(text)
      if (quizRequest) {
        if (quizRequest.topic !== '') {
          startQuiz(
            {
              topic: quizRequest.topic,
              checklist: [],
              material: null,
              image: null,
              cardId: null,
            },
            text,
          )
        } else {
          openQuizForm({}, text)
        }
        return
      }
    }
    let focusReaction: CoachMessage | null = null
    if (focusStep === 'name') {
      // 대회 · 기타를 고른 뒤 쓴 첫 말은 그 이름으로 저장합니다. ([이름은 나중에] 를 누르면 이름 없이 둡니다)
      const focus = loadStudyFocus()
      const name = focus === null || text === SKIP_FOCUS_NAME_LABEL ? null : cleanFocusName(text)
      if (focus) saveStudyFocus({ ...focus, name })
      if (name) {
        // 이름을 받았으면 날짜를 한 번 더 묻습니다. (코드가 묻고, 날짜를 고르면 그때 반응 · AI)
        setFocusStep('date')
        const question = buildFocusDateQuestion(name)
        const withAnswer = withBubble(thread, { speaker: 'me', text })
        setThread(
          withBubble(withAnswer, { speaker: 'ai', text: question.text, chips: question.chips }),
        )
        return
      }
      setFocusStep(null)
      focusReaction = focusReactionNow()
    } else if (focusStep === 'date') {
      // 날짜를 골랐거나(그 날짜 글이 옴) [아직 몰라] 를 눌렀습니다. 날짜는 고를 때 이미 저장했습니다.
      setFocusStep(null)
      setIsPickingDate(false)
      focusReaction = focusReactionNow()
    }
    let next = withBubble(thread, { speaker: 'me', text })
    if (!isServerData && focusReaction) {
      // 테스트 로그인: 준비하는 것에 대한 답이면 코드가 바뀐 미션으로 반응합니다.
      setThread(
        withBubble(next, { speaker: 'ai', text: focusReaction.text, chips: focusReaction.chips }),
      )
      return
    }
    if (!isServerData) {
      const reply = replyDemo(text, { school, card: nowCard })
      next = withBubble(next, { speaker: 'ai', text: reply.text, chips: reply.chips, isDemo: true })
      setThread({ ...next, isHelpShown: next.isHelpShown || reply.showHelp })
      return
    }
    // 열린 세션이 오래됐거나 날이 바뀌었거나 길어졌으면, 정리하고 이 말 앞의 코치 말부터 새 세션으로 보냅니다.
    if (needsNewSession(next, Date.now()) && next.chatId !== null) {
      finishQuietly(next.chatId, sessionLines(thread))
      next = {
        ...next,
        chatId: null,
        lastServerAt: null,
        sessionFrom: newSessionStart(next.bubbles),
      }
    }
    setThread(next)
    talk.mutate({ id: next.chatId, lines: sessionLines(next) })
  }

  // ---- 계획 말풍선 ----

  /** 계획을 짜거나 고쳐 달라고 합니다. myText 가 있으면 그 말을 내 말풍선으로 먼저 붙입니다. */
  function startPlan(request: PlanRequest, myText: string | null) {
    if (isBusy) return
    setIsPickingTime(false)
    if (myText) setThread((current) => withBubble(current, { speaker: 'me', text: myText }))
    planTalk.mutate(request)
  }

  /** 열려 있는 계획을 학생의 요청(한 줄)대로 고쳐 달라고 합니다. */
  function revisePlan(bubble: ThreadBubble, request: string) {
    if (!bubble.plan) return
    startPlan(
      {
        type: 'revise',
        bubbleId: bubble.id,
        plan: bubble.plan,
        request: request.slice(0, MAX_PLAN_TEXT_LENGTH),
      },
      request,
    )
  }

  /** 긴 계획의 목표 한 줄로 먼저 채워 둘 것: 준비하는 것의 이름 → 가장 가까운 내 일정 → 학교 시험 → 종류 */
  function suggestedGoal(): string {
    const focus = loadStudyFocus()
    if (focus?.name) return focus.name
    const myEvent = getUpcomingMyEvents(todayKey, MAX_LONG_PLAN_DAYS).find(
      (event) => event.dDay >= 1,
    )
    if (myEvent) return myEvent.name
    const exam = (school?.events ?? []).find((event) => event.exam && event.dDay >= 1)
    if (exam) return exam.name
    return focus ? `${focusLabelOf(focus.kind)} 준비` : ''
  }

  /**
   * 긴 계획의 날짜로 먼저 채워 둘 것: 30일 안의 내 일정 → 학교 시험 중 목표 이름과 맞는 것. 없으면 ''
   * 목표가 비었으면 가장 가까운 것을 씁니다. ('기말' 인데 중간고사 날짜를 채우지 않게 이름을 봅니다)
   */
  function suggestedEndDate(goal: string): string {
    const matches = (name: string) => goal === '' || name.includes(goal) || goal.includes(name)
    const myEvent = getUpcomingMyEvents(todayKey, MAX_LONG_PLAN_DAYS).find(
      (event) => event.dDay >= 1 && matches(event.name),
    )
    if (myEvent) return myEvent.date
    const exam = (school?.events ?? []).find(
      (event) =>
        event.exam && event.dDay >= 1 && event.dDay <= MAX_LONG_PLAN_DAYS && matches(event.name),
    )
    return exam?.date ?? ''
  }

  /**
   * 긴 계획 칸을 엽니다. 코치가 무엇을 적으면 되는지 한 줄로 알려 줍니다.
   * endDate 를 주면(채팅에서 날짜를 알아들음) 그 날로, 아니면 가까운 일정 · 시험 날로 미리 채웁니다.
   */
  function openLongForm(
    goal: string,
    myText: string,
    endDate: string | null = null,
    photo: string | null = null,
  ) {
    setPhotoError(null)
    setLongForm({
      goal,
      endDate: endDate ?? suggestedEndDate(goal),
      dailyMinutes: DEFAULT_DAILY_MINUTES,
      photo,
    })
    const withAnswer = withBubble(thread, { speaker: 'me', text: myText })
    setThread(
      withBubble(withAnswer, {
        speaker: 'ai',
        text: '좋아! 뭘 준비하는지 · 언제까지인지 아래에 알려 줘. 시험 범위표나 교과서 사진을 넣으면 그 범위로 짜 줄게.',
      }),
    )
  }

  /** 긴 계획 칸에서 사진을 고르면 줄여서 이 화면의 기억에만 둡니다. (저장하지 않음) */
  async function handleLongPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 사진을 다시 골라도 다시 읽게 비워 둡니다.
    event.target.value = ''
    if (!file) return
    setPhotoError(null)
    try {
      const photo = await shrinkPhoto(file)
      setLongForm((current) => (current ? { ...current, photo } : current))
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : '사진을 읽지 못했어요.')
    }
  }

  // 긴 계획 칸의 날짜는 내일부터 30일 뒤까지 고를 수 있습니다. (서버도 같은 범위)
  const longMinDate = moveDateKey(todayKey, 1)
  const longMaxDate = moveDateKey(todayKey, MAX_LONG_PLAN_DAYS)
  const isLongFormReady =
    longForm !== null &&
    longForm.goal.trim() !== '' &&
    longForm.endDate >= longMinDate &&
    longForm.endDate <= longMaxDate

  /** 긴 계획 칸에서 [계획 짜 줘] 를 누르면: 적은 것을 내 말풍선으로 붙이고 긴 계획을 짜 달라고 합니다. */
  function handleLongSubmit(event: FormEvent) {
    event.preventDefault()
    if (!longForm || !isLongFormReady) return
    const goal = longForm.goal.trim().slice(0, MAX_PLAN_TEXT_LENGTH)
    const [, month, day] = longForm.endDate.split('-').map(Number)
    const photoText = longForm.photo ? ' · 📎 사진 1장' : ''
    const myText = `📅 ${month}월 ${day}일까지 · ${goal} · 하루 ${longForm.dailyMinutes}분${photoText}`
    startPlan(
      {
        type: 'long',
        input: {
          goal,
          endDate: longForm.endDate,
          dailyMinutes: longForm.dailyMinutes,
          image: longForm.photo,
          focus: loadStudyFocus(),
          // 칸에서 고른 날은 시험 · 대회 날이라 저장할 때 홈 일정에 넣습니다.
          isEventDate: true,
        },
        notice: null,
      },
      myText,
    )
    setLongForm(null)
  }

  /**
   * [이대로 할게] — 계획을 카드로 저장합니다. 오늘 카드를 고친 계획이면 그 카드들을 바꿉니다.
   * 긴 계획이면 시험 · 대회 날을 내 일정(홈 "다가오는 일정")에 D-day 로 넣습니다.
   */
  function handleAcceptPlan(bubble: ThreadBubble) {
    const plan = bubble.plan
    if (!plan || isBusy) return
    setIsPickingTime(false)
    const saved = withPlanStatus(thread, (item) => (item.id === bubble.id ? 'saved' : null))
    const withAnswer = withBubble(saved, { speaker: 'me', text: '이대로 할게' })
    if (plan.fromCards) {
      // 지금 카드를 그대로 쓰기로 했으면 바꿀 것이 없습니다.
      setThread(
        withBubble(withAnswer, {
          speaker: 'ai',
          text: '좋아, 지금 계획 그대로 가자! 시간 되면 내가 알려 줄게.',
          chips: nowCard
            ? [{ kind: 'startCard', label: '▷ 지금 카드 시작', cardId: nowCard.id }]
            : [{ kind: 'say', label: '고마워!' }],
        }),
      )
      return
    }
    const now = Date.now()
    plan.replaceCardIds.forEach(deleteCard)
    const newCards = planToCards(plan, now)
    newCards.forEach(addCard)
    const lines = [`카드 ${newCards.length}장을 달력에 넣었어. 시간 되면 내가 알려 줄게!`]
    // 학생이 알려 준 시험 · 대회 날까지의 계획이면 그 날을 홈 일정에 D-day 로 넣습니다.
    if (plan.kind === 'long' && plan.spec && plan.isEventDate) {
      const name = plan.spec.goal.slice(0, FOCUS_NAME_MAX)
      saveMyEvent({ name, date: plan.spec.endDate, kind: 'focus' })
      lines.push(`📅 '${name}' D-day 도 홈 일정에 넣었어.`)
    }
    // 오늘 카드가 생겼으면 미션 ② "코치와 오늘 계획 정하기" 가 끝납니다.
    const nextMissions = loadDailyMissions(todayKey)
    if (countDoneMissions(nextMissions) > countDoneMissions(missions)) {
      lines.push(`✅ 오늘의 미션 ${countDoneMissions(nextMissions)}/${nextMissions.length} 끝!`)
    }
    setMissions(nextMissions)
    const firstToday = newCards
      .filter((card) => card.date === todayKey)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))[0]
    const chips: CoachChip[] = firstToday
      ? [
          { kind: 'startCard', label: '▷ 오늘 첫 카드 시작', cardId: firstToday.id },
          { kind: 'say', label: '고마워!' },
        ]
      : [{ kind: 'say', label: '고마워!' }]
    setThread(withBubble(withAnswer, { speaker: 'ai', text: lines.join('\n'), chips }))
  }

  /** [나중에 할래] — 계획을 저장하지 않고 닫습니다. 그다음 말은 다시 AI 코치와의 대화가 됩니다. */
  function handleClosePlan(bubble: ThreadBubble) {
    if (isBusy) return
    setIsPickingTime(false)
    const closed = withPlanStatus(thread, (item) => (item.id === bubble.id ? 'closed' : null))
    const withAnswer = withBubble(closed, { speaker: 'me', text: '나중에 할래' })
    setThread(
      withBubble(withAnswer, { speaker: 'ai', text: '알겠어. 계획은 언제든 다시 짜 줄게.' }),
    )
  }

  /** 시각 고르기 칸에서 [바꾸기] 를 누르면 그 시각으로 고쳐 달라고 합니다. */
  function handlePickTime(event: FormEvent) {
    event.preventDefault()
    if (!openPlanBubble || pickedTime === '') return
    revisePlan(openPlanBubble, `시작 시각을 ${pickedTime}로 바꿔 줘`)
    setPickedTime('')
  }

  // ---- 문제 말풍선 ----

  /** 확인 문제를 내 달라고 합니다. myText 가 있으면 그 말을 내 말풍선으로 먼저 붙입니다. */
  function startQuiz(input: QuizInput, myText: string | null) {
    if (isBusy) return
    if (myText) setThread((current) => withBubble(current, { speaker: 'me', text: myText }))
    quizTalk.mutate(input)
  }

  /** 확인 문제 칸을 엽니다. 코치가 무엇을 고르면 되는지 한 줄로 알려 줍니다. */
  function openQuizForm(prefill: Partial<QuizForm>, myText: string) {
    setIsMaterialOpen(false)
    setQuizForm({ topic: '', cardId: null, checklist: [], material: '', photo: null, ...prefill })
    const withAnswer = withBubble(thread, { speaker: 'me', text: myText })
    setThread(
      withBubble(withAnswer, {
        speaker: 'ai',
        text: prefill.photo
          ? '사진으로 문제 낼게! 무슨 과목 · 단원인지 적어 주면 더 잘 맞춰 낼 수 있어.'
          : '뭘 확인해 볼까? 오늘 카드를 고르거나 주제를 적어 줘. 교과서 · 필기 사진을 넣으면 그 내용으로 낼게.',
      }),
    )
  }

  /** 확인 문제 칸에서 사진을 고르면 줄여서 이 화면의 기억에만 둡니다. (저장하지 않음) */
  async function handleQuizPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 사진을 다시 골라도 다시 읽게 비워 둡니다.
    event.target.value = ''
    if (!file) return
    setPhotoError(null)
    try {
      const photo = await shrinkPhoto(file)
      setQuizForm((current) => (current ? { ...current, photo } : current))
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : '사진을 읽지 못했어요.')
    }
  }

  // 주제를 적었거나 사진을 넣었으면 문제를 낼 수 있습니다. (사진만 있으면 '사진 속 공부 내용')
  const isQuizFormReady =
    quizForm !== null && (quizForm.topic.trim() !== '' || quizForm.photo !== null)

  /** 확인 문제 칸에서 [문제 내 줘] 를 누르면: 고른 것을 내 말풍선으로 붙이고 문제를 내 달라고 합니다. */
  function handleQuizSubmit(event: FormEvent) {
    event.preventDefault()
    if (!quizForm || !isQuizFormReady) return
    const topic = (quizForm.topic.trim() || PHOTO_QUIZ_TOPIC).slice(0, MAX_QUIZ_TOPIC_LENGTH)
    const material = quizForm.material.trim()
    const extras = [quizForm.photo ? '📎 사진 1장' : null, material ? '📄 글' : null].filter(
      Boolean,
    )
    const myText = `📝 ${topic} 문제 내 줘${extras.length > 0 ? ` · ${extras.join(' · ')}` : ''}`
    startQuiz(
      {
        topic,
        checklist: quizForm.checklist,
        material: material === '' ? null : material.slice(0, MAX_QUIZ_MATERIAL_LENGTH),
        image: quizForm.photo,
        cardId: quizForm.cardId,
      },
      myText,
    )
    setQuizForm(null)
  }

  /**
   * 문제 말풍선의 문제를 바꿉니다. 다 풀어서 처음 '끝(done)' 이 되는 순간에 결과를 이 기기에 남깁니다.
   * (학생이 누를 때만 바뀌어서, 결과는 한 번만 남습니다)
   */
  function changeQuiz(bubbleId: number, change: (quiz: CoachQuiz) => CoachQuiz) {
    const before = thread.bubbles.find((bubble) => bubble.id === bubbleId)?.quiz
    if (!before) return
    const after = change(before)
    if (before.status !== 'done' && after.status === 'done') {
      const now = Date.now()
      saveQuizResult(toQuizResult(after, now, toDayKey(now)))
    }
    setThread((current) => withQuiz(current, bubbleId, () => after))
  }

  /** [틀린 것 다시 보기] — 그 문제 말풍선에서 틀린 문제만 다시 냅니다. (서버를 부르지 않음) */
  function handleReviewWrong(bubble: ThreadBubble) {
    const quiz = bubble.quiz
    if (!quiz || isBusy) return
    const wrong = wrongQuestionsOf(quiz)
    if (wrong.length === 0) return
    const withAnswer = withBubble(thread, { speaker: 'me', text: '틀린 것 다시 볼래' })
    setThread(
      withNewQuiz(
        withAnswer,
        `틀린 ${wrong.length}문제 다시 풀어 보자. 이번엔 해설을 떠올리면서!`,
        {
          topic: quiz.topic,
          cardId: quiz.cardId,
          questions: wrong,
          isDemo: quiz.isDemo,
        },
      ),
    )
  }

  /** [📝 틀린 문제 다시] — 어제 틀린 문제를 다시 냅니다. (이 기기의 결과에서 꺼냄, 서버를 부르지 않음) */
  function startYesterdayReview(label: string) {
    const wrong = loadYesterdayWrong(todayKey).slice(0, 5)
    const withAnswer = withBubble(thread, { speaker: 'me', text: label })
    if (wrong.length === 0) {
      setThread(
        withBubble(withAnswer, {
          speaker: 'ai',
          text: '어제 틀린 문제는 이미 다 다시 풀었어. 오늘 공부한 걸로 새로 내 볼까?',
          chips: [QUIZ_CHIP],
        }),
      )
      return
    }
    setThread(
      withNewQuiz(withAnswer, `어제 틀린 ${wrong.length}문제야. 이번엔 맞혀 보자!`, {
        topic: '어제 틀린 문제',
        cardId: null,
        questions: wrong,
        isDemo: false,
      }),
    )
  }

  /** 입력창의 📎 로 사진을 고르면 줄여서 기억해 두고, 문제 · 계획 중 무엇에 쓸지 묻습니다. (저장하지 않음) */
  async function handleChatPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setChatPhotoError(null)
    try {
      setChatPhoto(await shrinkPhoto(file))
    } catch (error) {
      setChatPhotoError(error instanceof Error ? error.message : '사진을 읽지 못했어요.')
    }
  }

  /** 📎 사진 → [📝 이걸로 문제 내기] */
  function handlePhotoQuiz() {
    if (!chatPhoto || isBusy) return
    setLongForm(null)
    openQuizForm({ photo: chatPhoto }, '📎 이 사진으로 문제 내 줘')
    setChatPhoto(null)
  }

  /** 📎 사진 → [📅 이걸로 계획 짜기] (긴 계획 칸에 사진을 넣어 엽니다) */
  function handlePhotoPlan() {
    if (!chatPhoto || isBusy) return
    setQuizForm(null)
    openLongForm(suggestedGoal(), '📎 이 사진으로 계획 짜 줘', null, chatPhoto)
    setChatPhoto(null)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    sendText(draft)
    setDraft('')
  }

  /** 칩을 누르면: 말 칩은 그 말을 보내고, 행동 칩은 그 일을 합니다. (누를 때만 실행) */
  function handleChip(chip: CoachChip) {
    if (chip.kind === 'say') {
      sendText(chip.label)
      return
    }
    if (chip.kind === 'checkIn') {
      // 오늘의 체크인으로 저장하고(서버로도), 그 말을 보내서 AI 와 이야기를 이어 갑니다. (미션 ① 끝)
      const checkIn = saveQuickCheckIn(chip.condition, chip.emotions)
      if (sendCheckIn.canSync) sendCheckIn.mutate(checkIn, { onSuccess: saveLocalCheckIn })
      setMissions(loadDailyMissions(todayKey))
      // 준비하는 것을 아직 모르면 AI 에 보내기 전에 한 번 묻습니다. (코드가 묻고, 고르면 그때 AI 와 이어 감)
      if (loadStudyFocus() === null) {
        const question = buildFocusQuestion()
        const withAnswer = withBubble(thread, { speaker: 'me', text: chip.label })
        setThread(
          withBubble(withAnswer, { speaker: 'ai', text: question.text, chips: question.chips }),
        )
        return
      }
      sendText(chip.label)
      return
    }
    if (chip.kind === 'focus') {
      // 준비하는 것은 오늘 계획을 짤 때의 재료입니다. (lib/studyFocus.ts)
      saveStudyFocus({ kind: chip.focus, name: null })
      // 대회 · 기타는 이름 한 줄(그다음 날짜)을 더 묻습니다. 내신 · 수능은 바로 반응합니다.
      if (needsFocusName(chip.focus)) {
        setFocusStep('name')
        const question = buildFocusNameQuestion(chip.focus)
        const withAnswer = withBubble(thread, { speaker: 'me', text: chip.label })
        setThread(
          withBubble(withAnswer, { speaker: 'ai', text: question.text, chips: question.chips }),
        )
        return
      }
      if (isServerData) {
        sendText(chip.label)
        return
      }
      const reaction = focusReactionNow()
      const withAnswer = withBubble(thread, { speaker: 'me', text: chip.label })
      setThread(
        reaction
          ? withBubble(withAnswer, { speaker: 'ai', text: reaction.text, chips: reaction.chips })
          : withAnswer,
      )
      return
    }
    if (chip.kind === 'pickDate') {
      setIsPickingDate(true)
      return
    }
    if (chip.kind === 'photoCards') {
      navigate('/cards/photo')
      return
    }
    if (chip.kind === 'dayPlan') {
      startPlan({ type: 'day', light: chip.light === true }, chip.label)
      return
    }
    if (chip.kind === 'longPlan') {
      if (!isBusy) openLongForm(suggestedGoal(), chip.label)
      return
    }
    if (chip.kind === 'quiz') {
      if (isBusy) return
      // 카드로 내는 칩(공부 끝 회고)이면 바로 내고, 아니면 주제를 고르는 칸을 엽니다.
      if (chip.topic) {
        startQuiz(
          {
            topic: chip.topic,
            checklist: chip.checklist ?? [],
            material: null,
            image: null,
            cardId: chip.cardId ?? null,
          },
          chip.label,
        )
      } else {
        openQuizForm({}, chip.label)
      }
      return
    }
    if (chip.kind === 'quizReview') {
      if (!isBusy) startYesterdayReview(chip.label)
      return
    }
    if (chip.kind === 'makePlan') {
      if (isBusy) return
      // AI 가 알아들은 날짜가 짤 수 있는 범위(내일 ~ 30일 뒤)면 바로 짜고, 아니면 목표를 채운 칸을 열어 날짜를 고르게 합니다.
      const goal = chip.goal.slice(0, MAX_PLAN_TEXT_LENGTH)
      if (chip.endDate && chip.endDate >= longMinDate && chip.endDate <= longMaxDate) {
        startPlan(
          {
            type: 'long',
            input: {
              goal,
              endDate: chip.endDate,
              dailyMinutes: DEFAULT_DAILY_MINUTES,
              image: null,
              focus: loadStudyFocus(),
              // 학생이 채팅에서 말한 시험 · 대회 날이라 저장할 때 홈 일정에 넣습니다.
              isEventDate: true,
            },
            notice: null,
          },
          chip.label,
        )
      } else {
        openLongForm(goal, chip.label)
      }
      return
    }
    if (chip.kind === 'checkCall') {
      // 통화 화면이 문(오늘 끝낸 공부)을 확인합니다. 방금 공부한 기록은 거기서 바로 서버로 보냅니다. (lib/checkCall.ts)
      navigate('/call')
      return
    }
    if (chip.kind === 'startCard') {
      navigate(`/timer?card=${encodeURIComponent(chip.cardId)}`)
      return
    }
    if (chip.kind === 'startMinutes') {
      // 정한 길이의 즉석 카드를 만들어 그 카드로 바로 시작합니다. (addCard 는 바로 저장해서 카드가 남습니다)
      const card = createInstantCardNow(todayKey, chip.minutes)
      addCard(card)
      navigate(`/timer?card=${encodeURIComponent(card.id)}`)
      return
    }
    if (chip.kind === 'startTitled') {
      // 제목을 붙인 카드(예: '미적분Ⅰ 복습' 10분)를 만들어 바로 시작합니다.
      const card = createInstantCardNow(todayKey, chip.minutes)
      addCard({
        ...card,
        title: chip.title,
        checklist: [{ id: `${card.id}-item-0`, text: chip.title }],
      })
      navigate(`/timer?card=${encodeURIComponent(card.id)}`)
      return
    }
    navigate(`/cards/new?date=${todayKey}`)
  }

  /** 날짜 고르기 칸에서 [넣기] 를 누르면: 내 일정으로 저장하고, 그 날짜를 내 말로 보냅니다. */
  function handlePickDate(event: FormEvent) {
    event.preventDefault()
    if (pickedDate === '' || pickedDate < todayKey) return
    const focus = loadStudyFocus()
    saveMyEvent({
      name: focus?.name ?? focusLabelOf(focus?.kind ?? 'OTHER'),
      date: pickedDate,
      kind: 'focus',
    })
    const [, month, day] = pickedDate.split('-').map(Number)
    setPickedDate('')
    sendText(`📅 ${month}월 ${day}일`)
  }

  /** 미션 줄을 누르면 코치가 오늘의 미션을 보여 주고 다음 미션을 권합니다. */
  function handleShowMissions() {
    if (isBusy) return
    const message = buildMissionBriefing(missions, null, nowCard)
    setThread(withBubble(thread, { speaker: 'ai', text: message.text, chips: message.chips }))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <MissionBar missions={missions} onOpen={handleShowMissions} />
      {/* role="log": 새 말이 생기면 화면을 읽어 주는 프로그램이 알려 줍니다. */}
      <div
        ref={listRef}
        role="log"
        aria-label="AI 코치와의 대화"
        className="min-h-0 flex-1 overflow-y-auto rounded-3xl bg-white p-4"
      >
        <ul className="flex flex-col gap-3">
          {bubbles.map((bubble, index) => {
            // 날이 바뀌는 곳에 날짜 구분선을 그립니다. (하루의 기준은 새벽 4시)
            const previous = bubbles[index - 1]
            const isNewDay = !previous || toDayKey(previous.at) !== toDayKey(bubble.at)
            return (
              <Fragment key={bubble.id}>
                {isNewDay && (
                  <li aria-hidden className="flex justify-center py-1">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                      {dayLabel(bubble.at)}
                    </span>
                  </li>
                )}
                {bubble.speaker === 'ai' ? (
                  <li>
                    <CoachBubble text={bubble.text} isDemo={bubble.isDemo} />
                    {bubble.plan && <PlanCard plan={bubble.plan} />}
                    {bubble.quiz && (
                      <QuizCard
                        quiz={bubble.quiz}
                        isLatest={bubble.id === latestQuizId}
                        onAnswer={(choiceIndex) =>
                          changeQuiz(bubble.id, (quiz) => answerQuiz(quiz, choiceIndex, Date.now()))
                        }
                        onNext={() =>
                          changeQuiz(bubble.id, (quiz) => nextQuizStep(quiz, Date.now()))
                        }
                        onRetry={() =>
                          changeQuiz(bubble.id, (quiz) => retryOneQuestion(quiz, Date.now()))
                        }
                        onKeepResult={() =>
                          changeQuiz(bubble.id, (quiz) => ({ ...quiz, status: 'done' }))
                        }
                        onReviewWrong={() => handleReviewWrong(bubble)}
                        onOtherTopic={() => !isBusy && openQuizForm({}, '다른 주제로 낼래')}
                      />
                    )}
                    {/* 칩은 가장 마지막 코치 말풍선 아래에만 보입니다. 답을 받는 중에는 숨깁니다.
                        계획을 고치는 중이면 그 계획의 칩([이대로 할게] · [줄여 줘] …)을 보여 줍니다.
                        문제를 푸는 중이면 문제 말풍선 안의 버튼만 씁니다. */}
                    {bubble === lastBubble &&
                      !isBusy &&
                      !isQuizActive(bubble.quiz) &&
                      (openPlanBubble?.plan ? (
                        <PlanChips
                          bubble={openPlanBubble}
                          plan={openPlanBubble.plan}
                          onAccept={handleAcceptPlan}
                          onRevise={revisePlan}
                          onPickTime={setIsPickingTime}
                          onClose={handleClosePlan}
                        />
                      ) : (
                        bubble.chips && <ChipRow chips={bubble.chips} onPick={handleChip} />
                      ))}
                  </li>
                ) : (
                  <li className="flex justify-end">
                    {/* max-w-[80%] + break-words: 긴 말풍선도 화면 폭을 넘지 않고 안에서 줄바꿈됩니다. */}
                    <p className="bg-brand max-w-[80%] rounded-[20px] px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap text-white">
                      {bubble.text}
                    </p>
                  </li>
                )}
              </Fragment>
            )
          })}
          {talk.isPending && (
            <li>
              <CoachBubble text="쓰는 중…" isStatus />
            </li>
          )}
          {planTalk.isPending && (
            <li>
              <CoachBubble
                text={
                  planTalk.variables?.type === 'long' && planTalk.variables.input.image
                    ? '사진을 읽고 계획 짜는 중…'
                    : '계획 짜는 중…'
                }
                isStatus
              />
            </li>
          )}
          {quizTalk.isPending && (
            <li>
              <CoachBubble
                text={quizTalk.variables?.image ? '사진을 읽고 문제 만드는 중…' : '문제 만드는 중…'}
                isStatus
              />
            </li>
          )}
        </ul>
      </div>

      {/* 대회 · 기타 날짜 고르기 칸. 고르면 내 일정(홈 "다가오는 일정")에 D-day 로 뜹니다. */}
      {isPickingDate && focusStep === 'date' && (
        <form
          onSubmit={handlePickDate}
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-3xl bg-white p-3"
        >
          <label htmlFor="focus-date" className="text-sm font-semibold text-slate-700">
            📅 날짜
          </label>
          <input
            id="focus-date"
            type="date"
            min={todayKey}
            value={pickedDate}
            onChange={(event) => setPickedDate(event.target.value)}
            className="focus:ring-brand/30 h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-3 text-base focus:ring-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pickedDate === ''}
            className="bg-brand h-11 shrink-0 cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            넣기
          </button>
        </form>
      )}

      {/* [🕖 시간 바꿔 줘] 를 누르면 여는 시각 고르기 칸. 고르면 그 시각부터로 고쳐 달라고 합니다. */}
      {isPickingTime && openPlanBubble && (
        <form
          onSubmit={handlePickTime}
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-3xl bg-white p-3"
        >
          <label htmlFor="plan-time" className="text-sm font-semibold text-slate-700">
            🕖 몇 시부터?
          </label>
          <input
            id="plan-time"
            type="time"
            value={pickedTime}
            onChange={(event) => setPickedTime(event.target.value)}
            className="focus:ring-brand/30 h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-3 text-base focus:ring-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pickedTime === '' || isBusy}
            className="bg-brand h-11 shrink-0 cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            바꾸기
          </button>
        </form>
      )}

      {/* 긴 계획 칸: 무엇을 · 언제까지 · 하루 얼마나 · (선택) 교과서 · 범위 사진 */}
      {longForm !== null && (
        <form
          onSubmit={handleLongSubmit}
          aria-label="시험·대회 계획 짜기"
          className="flex shrink-0 flex-col gap-2 rounded-3xl bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-semibold text-slate-900">📅 시험·대회 계획</p>
            <button
              type="button"
              aria-label="계획 칸 닫기"
              onClick={() => setLongForm(null)}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
          <label htmlFor="long-goal" className="text-sm font-medium text-slate-600">
            뭘 준비해?
          </label>
          <input
            id="long-goal"
            value={longForm.goal}
            maxLength={MAX_PLAN_TEXT_LENGTH}
            onChange={(event) => setLongForm({ ...longForm, goal: event.target.value })}
            placeholder="예: 중간고사 미적분 1~3단원"
            className="focus:ring-brand/30 h-11 w-full min-w-0 rounded-2xl bg-slate-100 px-3 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="long-date" className="text-sm font-medium text-slate-600">
              언제까지?
            </label>
            <input
              id="long-date"
              type="date"
              min={longMinDate}
              max={longMaxDate}
              value={longForm.endDate}
              onChange={(event) => setLongForm({ ...longForm, endDate: event.target.value })}
              className="focus:ring-brand/30 h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-3 text-base focus:ring-2 focus:outline-none"
            />
          </div>
          <div
            role="group"
            aria-label="하루 공부 시간"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-sm font-medium text-slate-600">하루</span>
            {DAILY_MINUTES_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={longForm.dailyMinutes === minutes}
                onClick={() => setLongForm({ ...longForm, dailyMinutes: minutes })}
                className={cn(
                  chipClass,
                  'px-3',
                  longForm.dailyMinutes === minutes &&
                    'bg-brand-light text-brand border-transparent font-semibold',
                )}
              >
                {minutes}분
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 사진은 줄여서 이 화면의 기억에만 둡니다. 계획을 짜는 데만 서버에 보내고 저장하지 않습니다. */}
            <label className={cn(chipClass, 'focus-within:ring-brand/30 focus-within:ring-2')}>
              📎 교과서·범위 사진
              <input type="file" accept="image/*" onChange={handleLongPhoto} className="sr-only" />
            </label>
            {longForm.photo && (
              <span className="flex items-center gap-1">
                <img
                  src={longForm.photo}
                  alt="넣은 사진"
                  className="h-10 w-10 max-w-full rounded-lg object-cover"
                />
                <button
                  type="button"
                  aria-label="사진 빼기"
                  onClick={() => setLongForm({ ...longForm, photo: null })}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
          {photoError && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {photoError}
            </p>
          )}
          <button
            type="submit"
            disabled={!isLongFormReady || isBusy}
            className="bg-brand h-11 w-full cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            계획 짜 줘
          </button>
          <p className="text-xs break-keep text-slate-400">
            날짜는 내일부터 {MAX_LONG_PLAN_DAYS}일 안으로 골라 줘. 사진은 저장하지 않아.
          </p>
        </form>
      )}

      {/* 확인 문제 칸: 오늘 카드 고르기 또는 주제 적기 · (선택) 글 붙여 넣기 · 교과서 · 필기 사진 */}
      {quizForm !== null && (
        <form
          onSubmit={handleQuizSubmit}
          aria-label="확인 문제 내기"
          className="flex shrink-0 flex-col gap-2 rounded-3xl bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-semibold text-slate-900">📝 확인 문제</p>
            <button
              type="button"
              aria-label="문제 칸 닫기"
              onClick={() => setQuizForm(null)}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
          {quizCardOptions.length > 0 && (
            <div role="group" aria-label="오늘 카드로 내기" className="flex flex-wrap gap-2">
              {quizCardOptions.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={quizForm.cardId === card.id}
                  onClick={() =>
                    setQuizForm({
                      ...quizForm,
                      topic: card.title,
                      cardId: card.id,
                      checklist: card.checklist
                        .map((item) => item.text)
                        .filter((text) => text.trim() !== ''),
                    })
                  }
                  className={cn(
                    chipClass,
                    'max-w-full',
                    quizForm.cardId === card.id &&
                      'bg-brand-light text-brand border-transparent font-semibold',
                  )}
                >
                  <span className="truncate">{card.title}</span>
                </button>
              ))}
            </div>
          )}
          <label htmlFor="quiz-topic" className="text-sm font-medium text-slate-600">
            {quizCardOptions.length > 0 ? '또는 주제를 적어 줘' : '뭘 확인할까?'}
          </label>
          <input
            id="quiz-topic"
            value={quizForm.topic}
            maxLength={MAX_QUIZ_TOPIC_LENGTH}
            // 직접 고쳐 적으면 카드로 내는 게 아니게 됩니다.
            onChange={(event) =>
              setQuizForm({ ...quizForm, topic: event.target.value, cardId: null, checklist: [] })
            }
            placeholder="예: 미적분 3단원 수열의 극한"
            className="focus:ring-brand/30 h-11 w-full min-w-0 rounded-2xl bg-slate-100 px-3 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
          />
          {isMaterialOpen && (
            <>
              <label htmlFor="quiz-material" className="text-sm font-medium text-slate-600">
                필기 · 교과서 글 (이 안에서만 문제를 내)
              </label>
              <textarea
                id="quiz-material"
                value={quizForm.material}
                maxLength={MAX_QUIZ_MATERIAL_LENGTH}
                rows={3}
                onChange={(event) => setQuizForm({ ...quizForm, material: event.target.value })}
                placeholder="공부한 내용을 붙여 넣어 줘"
                className="focus:ring-brand/30 w-full min-w-0 resize-none rounded-2xl bg-slate-100 px-3 py-2 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
              />
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!isMaterialOpen && (
              <button type="button" onClick={() => setIsMaterialOpen(true)} className={chipClass}>
                📄 글 붙여 넣기
              </button>
            )}
            {/* 사진은 줄여서 이 화면의 기억에만 둡니다. 문제를 내는 데만 서버에 보내고 저장하지 않습니다. */}
            <label className={cn(chipClass, 'focus-within:ring-brand/30 focus-within:ring-2')}>
              📎 교과서·필기 사진
              <input type="file" accept="image/*" onChange={handleQuizPhoto} className="sr-only" />
            </label>
            {quizForm.photo && (
              <span className="flex items-center gap-1">
                <img
                  src={quizForm.photo}
                  alt="넣은 사진"
                  className="h-10 w-10 max-w-full rounded-lg object-cover"
                />
                <button
                  type="button"
                  aria-label="사진 빼기"
                  onClick={() => setQuizForm({ ...quizForm, photo: null })}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
          {photoError && (
            <p role="alert" className="text-sm break-keep text-red-600">
              {photoError}
            </p>
          )}
          <button
            type="submit"
            disabled={!isQuizFormReady || isBusy}
            className="bg-brand h-11 w-full cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            문제 내 줘 (3문제)
          </button>
          <p className="text-xs break-keep text-slate-400">
            푼 결과는 이 기기에만 남아. 사진은 저장하지 않아.
          </p>
        </form>
      )}

      {/* 입력창의 📎 로 고른 사진: 문제를 낼지 · 계획을 짤지 고릅니다. (고르기 전에는 아무 데도 보내지 않음) */}
      {chatPhoto && (
        <div
          role="group"
          aria-label="고른 사진으로 할 일"
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-3xl bg-white p-3"
        >
          <img
            src={chatPhoto}
            alt="고른 사진"
            className="h-10 w-10 max-w-full shrink-0 rounded-lg object-cover"
          />
          <p className="min-w-0 flex-1 text-sm break-keep text-slate-600">이 사진으로 뭘 할까?</p>
          <button
            type="button"
            aria-label="사진 빼기"
            onClick={() => setChatPhoto(null)}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
          <div className="flex w-full flex-wrap gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={handlePhotoQuiz}
              className={cn(chipClass, 'bg-brand-light text-brand border-transparent')}
            >
              📝 이걸로 문제 내기
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handlePhotoPlan}
              className={cn(chipClass, 'bg-brand-light text-brand border-transparent')}
            >
              📅 이걸로 계획 짜기
            </button>
          </div>
        </div>
      )}

      {/* 위기 표현이 감지됐을 때 상담 전화 한 줄. 대화는 막지 않습니다. (누르면 바로 전화가 걸립니다) */}
      {thread.isHelpShown && (
        <a
          href={`tel:${YOUTH_HELP_LINE.number}`}
          className="flex min-h-14 shrink-0 items-center gap-3 rounded-3xl bg-white px-4 py-2"
        >
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50"
          >
            ☎️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-slate-900">
              {YOUTH_HELP_LINE.name} {YOUTH_HELP_LINE.number}
            </span>
            <span className="block text-sm break-keep text-slate-500">
              지금 이야기할 곳 · {YOUTH_HELP_LINE.detail}
            </span>
          </span>
          <span aria-hidden className="text-slate-400">
            ›
          </span>
        </a>
      )}

      {/* 입력창은 목록 아래에 붙습니다. 하단 탭은 Layout 이 아래 여백(pb-14)으로 비켜 줍니다. */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 flex-col gap-1 rounded-3xl bg-white p-2"
      >
        {talk.isError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 px-2 pt-1">
            <p className="text-sm break-keep text-red-600">{getChatErrorMessage(talk.error)}</p>
            <button
              type="button"
              onClick={() => talk.variables && talk.mutate(talk.variables)}
              className={chipClass}
            >
              다시 보내기
            </button>
          </div>
        )}
        {planTalk.isError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 px-2 pt-1">
            <p className="text-sm break-keep text-red-600">
              계획을 못 짰어요. {getChatErrorMessage(planTalk.error)}
            </p>
            <button
              type="button"
              onClick={() => planTalk.variables && planTalk.mutate(planTalk.variables)}
              className={chipClass}
            >
              다시 보내기
            </button>
          </div>
        )}
        {quizTalk.isError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 px-2 pt-1">
            <p className="text-sm break-keep text-red-600">
              문제를 못 만들었어요. {getChatErrorMessage(quizTalk.error)}
            </p>
            <button
              type="button"
              onClick={() => quizTalk.variables && quizTalk.mutate(quizTalk.variables)}
              className={chipClass}
            >
              다시 보내기
            </button>
          </div>
        )}
        {chatPhotoError && (
          <p role="alert" className="px-2 pt-1 text-sm break-keep text-red-600">
            {chatPhotoError}
          </p>
        )}
        <div className="flex items-end gap-2">
          {/* 📎 사진 넣기: 교과서 · 필기 · 시험 범위 사진으로 문제를 내거나 계획을 짭니다. (저장하지 않음) */}
          <label
            aria-label="사진 넣기"
            className={cn(
              'focus-within:ring-brand/30 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-slate-100 text-lg focus-within:ring-2',
              isBusy && 'pointer-events-none opacity-40',
            )}
          >
            📎
            <input
              type="file"
              accept="image/*"
              disabled={isBusy}
              onChange={handleChatPhoto}
              className="sr-only"
            />
          </label>
          <label htmlFor="chat-input" className="sr-only">
            AI 코치에게 보낼 말
          </label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // 키보드가 올라왔을 때 입력창이 가려지지 않게 화면 안으로 끌어옵니다.
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
            maxLength={MAX_CHAT_TEXT_LENGTH}
            rows={1}
            disabled={isBusy}
            // 계획을 고치는 중이면 쓰는 말이 고치는 요청이 된다고 알려 줍니다.
            placeholder={openPlanBubble ? '계획 고칠 곳을 말해 줘' : '코치에게 말하기'}
            // text-base: 아이폰은 16px 보다 작은 입력칸을 누르면 화면을 확대해서 16px 로 둡니다.
            className="focus:ring-brand/30 max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={draft.trim() === '' || isBusy}
            className="bg-brand h-11 shrink-0 cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            보내기
          </button>
        </div>
      </form>
    </div>
  )
}

// 작은 칩 버튼: 흰 바탕 + 옅은 테두리, 높이 40px
const chipClass =
  'flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-transform active:scale-[0.98]'

interface ChipRowProps {
  chips: CoachChip[]
  onPick: (chip: CoachChip) => void
}

/** 코치 말풍선 바로 아래의 빠른 답 칩 줄. 넘치면 다음 줄로 내려갑니다. 행동 칩은 brand 색으로 구분합니다. */
function ChipRow({ chips, onPick }: ChipRowProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={`${chip.kind}-${chip.label}`}
          type="button"
          onClick={() => onPick(chip)}
          className={cn(
            chipClass,
            chip.kind !== 'say' &&
              chip.kind !== 'checkIn' &&
              chip.kind !== 'focus' &&
              'bg-brand-light text-brand border-transparent',
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

interface CoachBubbleProps {
  text: string
  /** true 면 "쓰는 중…" 처럼 상태를 알리는 말풍선입니다. (화면 읽기 프로그램이 읽어 줌) */
  isStatus?: boolean
  /** true 면 시연용 정해진 답이라고 아래에 붙입니다. */
  isDemo?: boolean
}

/** AI 코치의 말풍선. 위에 작은 코치 이름과 동그란 아이콘을 둡니다. */
function CoachBubble({ text, isStatus = false, isDemo = false }: CoachBubbleProps) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span
          aria-hidden
          className="bg-brand-light flex size-6 items-center justify-center rounded-full text-[13px]"
        >
          🧑‍🏫
        </span>
        코치
      </p>
      <p
        role={isStatus ? 'status' : undefined}
        className={cn(
          'max-w-[85%] rounded-[20px] bg-slate-100 px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap',
          isStatus ? 'text-slate-500' : 'text-slate-900',
        )}
      >
        {text}
      </p>
      {isDemo && <p className="text-xs text-amber-700">시연용 정해진 답 (AI 아님)</p>}
    </div>
  )
}

// ---- 계획 말풍선 ----
// 계획 카드(PlanCard)는 AI 통화 화면에서도 써서 components/ui/PlanCard.tsx 에 있습니다. 칩은 코치 화면에서만 씁니다.

interface PlanChipsProps {
  /** 계획이 붙은 말풍선 */
  bubble: ThreadBubble
  plan: CoachPlan
  onAccept: (bubble: ThreadBubble) => void
  /** 칩 글자를 그대로 고치는 요청으로 보냅니다. */
  onRevise: (bubble: ThreadBubble, request: string) => void
  /** 시각 고르기 칸을 엽니다. (true) */
  onPickTime: (isOpen: boolean) => void
  onClose: (bubble: ThreadBubble) => void
}

/** 고치는 중인 계획의 칩: [이대로 할게] · [줄여 줘] · [주말은 빼 줘] · [시간 바꿔 줘] · [나중에 할래] */
function PlanChips({ bubble, plan, onAccept, onRevise, onPickTime, onClose }: PlanChipsProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onAccept(bubble)}
        className={cn(chipClass, 'bg-brand border-transparent font-semibold text-white')}
      >
        ✅ 이대로 할게
      </button>
      {planReviseLabels(plan).map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => onRevise(bubble, label)}
          className={chipClass}
        >
          {label}
        </button>
      ))}
      <button type="button" onClick={() => onPickTime(true)} className={chipClass}>
        🕖 시간 바꿔 줘
      </button>
      <button type="button" onClick={() => onClose(bubble)} className={chipClass}>
        나중에 할래
      </button>
    </div>
  )
}

// ---- 문제 말풍선 ----
// 지금은 코치 화면에서만 써서 이 파일에 둡니다. AI 통화 화면에서도 쓰게 되면 components/ui/ 로 뺍니다.

/** 푸는 중인 문제인지 (푸는 중 · 찍기 확인 중) */
function isQuizActive(quiz: CoachQuiz | undefined): boolean {
  return quiz !== undefined && (quiz.status === 'open' || quiz.status === 'guessCheck')
}

/** 보기 번호 글자 */
const CHOICE_MARKS = ['①', '②', '③', '④']

interface QuizCardProps {
  quiz: CoachQuiz
  /** true 면 가장 최근 문제 말풍선입니다. 아니면 결과 한 줄로 접습니다. */
  isLatest: boolean
  onAnswer: (choiceIndex: number) => void
  /** [다음] · [결과 보기] */
  onNext: () => void
  /** 찍은 것 같을 때 [다시 풀기] — 한 문제만 다시 */
  onRetry: () => void
  /** 찍은 것 같을 때 [괜찮아] — 그대로 결과 보기 */
  onKeepResult: () => void
  onReviewWrong: () => void
  onOtherTopic: () => void
}

/**
 * 코치 말풍선 아래의 문제 카드. 한 문제씩 보여 주고, 고르면 정답 · 오답 색과 해설을 보여 줍니다.
 * 다 풀면 "3개 중 2개 맞았어" 와 [틀린 것 다시 보기] · [다른 주제로] 를 보여 줍니다.
 */
function QuizCard({
  quiz,
  isLatest,
  onAnswer,
  onNext,
  onRetry,
  onKeepResult,
  onReviewWrong,
  onOtherTopic,
}: QuizCardProps) {
  const total = quiz.questions.length
  const correct = countCorrect(quiz)
  const wrongCount = wrongQuestionsOf(quiz).length
  const isDone = quiz.status === 'done'

  // 지난 문제 말풍선 · 풀다 만 문제는 결과 한 줄로 접습니다.
  if (!isLatest || quiz.status === 'closed') {
    return (
      <p className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-sm break-words text-slate-500 sm:max-w-md">
        📝 {quiz.topic} · {isDone ? `${total}개 중 ${correct}개 맞음` : '풀다 말았어'}
      </p>
    )
  }

  const question = quiz.questions[quiz.current]
  const answer = quiz.answers[quiz.current]
  const isLastStep = quiz.retryIndex !== null || quiz.current === total - 1

  return (
    <div className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white p-3 sm:max-w-md">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[15px] font-bold break-words text-slate-900">📝 {quiz.topic}</p>
        {quiz.status === 'open' && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 tabular-nums">
            {quiz.current + 1}/{total}
          </span>
        )}
      </div>

      {quiz.status === 'open' && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[15px] break-words whitespace-pre-wrap text-slate-900">
            {question.question}
          </p>
          <div role="group" aria-label="보기" className="flex flex-col gap-2">
            {question.choices.map((choice, index) => {
              const isAnswer = index === question.answerIndex
              const isPicked = answer?.choiceIndex === index
              return (
                <button
                  key={index}
                  type="button"
                  disabled={answer !== null}
                  onClick={() => onAnswer(index)}
                  className={cn(
                    'flex min-h-10 w-full cursor-pointer items-start gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-left text-[15px] break-words text-slate-800 disabled:cursor-default',
                    // 고른 뒤: 정답은 초록, 내가 고른 오답은 빨강, 나머지는 흐리게
                    answer !== null &&
                      isAnswer &&
                      'border-emerald-300 bg-emerald-50 text-emerald-800',
                    answer !== null &&
                      isPicked &&
                      !isAnswer &&
                      'border-red-300 bg-red-50 text-red-700',
                    answer !== null && !isAnswer && !isPicked && 'opacity-60',
                  )}
                >
                  <span aria-hidden className="shrink-0">
                    {CHOICE_MARKS[index]}
                  </span>
                  <span className="min-w-0 flex-1">{choice}</span>
                </button>
              )
            })}
          </div>
          {answer !== null && (
            <>
              <p
                role="status"
                className={cn(
                  'text-[15px] font-semibold',
                  answer.choiceIndex === question.answerIndex ? 'text-emerald-700' : 'text-red-600',
                )}
              >
                {answer.choiceIndex === question.answerIndex ? '⭕ 맞았어!' : '❌ 아쉽다'}
              </p>
              {question.explanation && (
                <p className="text-sm break-words text-slate-600">{question.explanation}</p>
              )}
              <button
                type="button"
                onClick={onNext}
                className="bg-brand h-10 w-full cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
              >
                {isLastStep ? '결과 보기' : '다음'}
              </button>
            </>
          )}
        </div>
      )}

      {/* 찍은 것 같을 때: 혼내지 않고 한 문제만 다시 볼지 묻습니다. 두 버튼은 같은 모양 · 같은 크기 */}
      {quiz.status === 'guessCheck' && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[15px] break-keep text-slate-800">
            찍은 것 같은데? 한 문제만 다시 볼까?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className={cn(chipClass, 'flex-1 justify-center')}
            >
              다시 풀기
            </button>
            <button
              type="button"
              onClick={onKeepResult}
              className={cn(chipClass, 'flex-1 justify-center')}
            >
              괜찮아
            </button>
          </div>
        </div>
      )}

      {isDone && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[15px] font-semibold text-slate-900">
            {total}개 중 {correct}개 맞았어{correct === total ? '! 👏' : '.'}
          </p>
          <ul className="flex flex-col gap-1">
            {quiz.questions.map((item, index) => {
              const isRight = quiz.answers[index]?.choiceIndex === item.answerIndex
              return (
                <li key={index} className="flex gap-2 text-sm text-slate-600">
                  <span aria-label={isRight ? '맞음' : '틀림'} className="shrink-0">
                    {isRight ? '⭕' : '❌'}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{item.question}</span>
                </li>
              )
            })}
          </ul>
          {wrongCount > 0 && (
            <p className="text-xs break-keep text-slate-400">
              틀린 문제는 내일 코치가 한 번 더 물어볼게.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {wrongCount > 0 && (
              <button
                type="button"
                onClick={onReviewWrong}
                className={cn(chipClass, 'bg-brand-light text-brand border-transparent')}
              >
                틀린 것 다시 보기
              </button>
            )}
            <button type="button" onClick={onOtherTopic} className={chipClass}>
              다른 주제로
            </button>
          </div>
        </div>
      )}
      {quiz.isDemo && <p className="mt-1 text-xs text-amber-700">시연용 예시 문제 (AI 아님)</p>}
    </div>
  )
}
