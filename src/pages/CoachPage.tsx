import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { MissionBar } from '@/components/ui/MissionBar'
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
  findRecapSession,
  loadPhoneLift,
  negotiationChipsFor,
  type CoachChip,
  type CoachMessage,
} from '@/lib/coachBriefing'
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
import { getTodayKey, toDayKey } from '@/lib/date'
import { replyDemo } from '@/lib/demoCoach'
import { YOUTH_HELP_LINE } from '@/lib/helpLines'
import { getUpcomingMyEvents, saveMyEvent } from '@/lib/myEvents'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { loadLocalCheckIn, saveLocalCheckIn, saveQuickCheckIn } from '@/lib/quickCheckIn'
import { loadRestDays } from '@/lib/restDays'
import { gradeNumberOf } from '@/lib/schoolEvents'
import { loadSchoolClass, schoolTodayOrNullQuery } from '@/lib/schoolToday'
import { loadData, saveData } from '@/lib/storage'
import {
  cleanFocusName,
  focusLabelOf,
  loadStudyFocus,
  needsFocusName,
  saveStudyFocus,
} from '@/lib/studyFocus'
import { getTodayCardsState } from '@/lib/todayCards'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
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
 *   4. AI 가 고른 빠른 답 · 행동이 오면 칩으로 보여 주고, 없으면 핑계 협상 칩([▷ 10분으로 줄여서 시작])을 코드가 붙입니다.
 *      행동 칩(시작 · 카드 만들기)은 누를 때만 실행합니다.
 *   5. 위기 표현이 나오면 상담 전화 한 줄을 보여 줍니다. 대화는 막지 않습니다.
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
  const { cards, addCard } = useCards()
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
      const recap = buildSessionRecap(recapSession, loadPhoneLift(recapSession.id))
      // 공부를 끝내서 미션이 늘었으면 같은 말풍선에 한 줄로 붙입니다. (말풍선이 너무 많아지지 않게)
      if (hasNewMissionDone && !missionSlot) {
        recap.text += `\n✅ 오늘의 미션 ${doneMissions}/${missions.length} 끝!`
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
      // AI 가 고른 빠른 답 · 행동이 있으면 그 칩을, 없으면 핑계 협상 칩을 코드가 붙입니다.
      const studentText = variables.lines[variables.lines.length - 1]?.text ?? ''
      const serverChips = chipsFromServer(reply, nowCard)
      const chips = serverChips.length > 0 ? serverChips : negotiationChipsFor(studentText)
      setThread((current) => ({
        ...withBubble(current, { speaker: 'ai', text: reply.reply, chips }),
        chatId: openId,
        lastServerAt: Date.now(),
        isHelpShown: current.isHelpShown || reply.showHelp,
      }))
    },
  })

  const bubbles = thread.bubbles
  const lastBubble = bubbles[bubbles.length - 1]

  // 새 말풍선이 생기면 맨 아래로 내립니다.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [bubbles, talk.isPending])

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
    if (text === '' || talk.isPending) return
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
    if (talk.isPending) return
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
                    {/* 칩은 가장 마지막 코치 말풍선 아래에만 보입니다. 답을 받는 중에는 숨깁니다. */}
                    {bubble === lastBubble && !talk.isPending && bubble.chips && (
                      <ChipRow chips={bubble.chips} onPick={handleChip} />
                    )}
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
        <div className="flex items-end gap-2">
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
            disabled={talk.isPending}
            placeholder="코치에게 말하기"
            // text-base: 아이폰은 16px 보다 작은 입력칸을 누르면 화면을 확대해서 16px 로 둡니다.
            className="focus:ring-brand/30 max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={draft.trim() === '' || talk.isPending}
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
