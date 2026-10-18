import { AsyncBoundary } from '@/components/ui/AsyncBoundary'
import { SettingsLink } from '@/components/ui/SettingsLink'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useCards } from '@/hooks/useCards'
import { useSendCheckIn } from '@/hooks/useCheckInSync'
import { useQueryParam } from '@/hooks/useQueryParam'
import { ApiError, getApiErrorMessage } from '@/lib/api'
import type { CallLine, CallResultState } from '@/lib/callReview'
import { loadCardMarks } from '@/lib/cardMarks'
import { createInstantCardNow } from '@/lib/cardSession'
import { MAX_CHAT_LINES, MAX_CHAT_TEXT_LENGTH, sendChatMessage, startChat } from '@/lib/chatApi'
import { canSyncCheckIns, todayCheckInForCoachQuery } from '@/lib/checkInsApi'
import {
  buildMissionBriefing,
  buildMissionProgress,
  buildMorningBriefing,
  buildSessionRecap,
  findRecapSession,
  loadPhoneLift,
  negotiationChipsFor,
  type CoachChip,
  type CoachMessage,
} from '@/lib/coachBriefing'
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
import { getTodayKey } from '@/lib/date'
import { replyDemo } from '@/lib/demoCoach'
import { YOUTH_HELP_LINE } from '@/lib/helpLines'
import { loadOnboardingAnswers } from '@/lib/onboardingSteps'
import { loadLocalCheckIn, saveLocalCheckIn, saveQuickCheckIn } from '@/lib/quickCheckIn'
import { loadRestDays } from '@/lib/restDays'
import { gradeNumberOf } from '@/lib/schoolEvents'
import { loadSchoolClass, schoolTodayOrNullQuery } from '@/lib/schoolToday'
import { loadData, saveData } from '@/lib/storage'
import { getTodayCardsState } from '@/lib/todayCards'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/** 채팅 말풍선 하나 */
interface ChatBubble {
  id: number
  speaker: 'ai' | 'me'
  text: string
  /** 코치 말풍선 아래의 빠른 답 칩. 가장 마지막 코치 말풍선의 칩만 보입니다. */
  chips?: CoachChip[]
  /** true 면 테스트 로그인용 "시연용 정해진 답" 입니다. (AI 가 쓴 말이 아님) */
  isDemo?: boolean
}

/** 탭을 옮겼다 돌아와도 이어지게 들고 있는 대화 */
interface KeptChat {
  /** 이 대화를 시작한 로그인 열쇠. 다른 사람이 로그인하면 대화를 비웁니다. */
  token: string | null
  chatId: string | null
  bubbles: ChatBubble[]
  isHelpShown: boolean
}

const EMPTY_CHAT: KeptChat = { token: null, chatId: null, bubbles: [], isHelpShown: false }

// 탭을 옮겼다 돌아와도 대화가 남게, 이 파일(모듈) 안의 변수에 잠깐 들고 있습니다.
// ⚠️ 브라우저 저장소에는 넣지 않습니다. 그래서 새로고침하거나 앱을 다시 열면 사라집니다. (대화는 학생의 마음 이야기라서)
let keptChat: KeptChat = EMPTY_CHAT

// 코치가 결과를 먼저 물어본 마지막 공부 기록 번호. 같은 기록을 두 번 묻지 않으려고 저장합니다. (대화 내용이 아니라 번호만)
const RECAPPED_SESSION_KEY = 'coach-recapped-session'

// 코치가 마지막으로 알아챈 "오늘의 미션 몇 개 끝" ('2026-10-18:2' 모양). 미션을 끝내고 돌아오면 코치가 먼저 말을 겁니다.
const MISSION_PROGRESS_KEY = 'coach-mission-progress'

/** 저장해 둔 미션 진행이 오늘 몇 개였는지. 오늘 것이 아니면 null */
function loadMissionProgress(todayKey: string): number | null {
  const saved = loadData<unknown>(MISSION_PROGRESS_KEY, null)
  if (typeof saved !== 'string') return null
  const [date, done] = saved.split(':')
  const count = Number(done)
  return date === todayKey && Number.isInteger(count) ? count : null
}

/** 말풍선 목록을 서버에 보내는 대화 줄로 바꿉니다. (말풍선 번호 · 칩은 화면에서만 씁니다) */
function toLines(bubbles: ChatBubble[]): CallLine[] {
  return bubbles.map(({ speaker, text }) => ({ speaker, text }))
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
 * 코치 탭(첫 화면 "/") — AI 코치와 이야기하는 곳입니다. (2026-10-18 "AI 코치 채팅 중심", BE #238)
 * 예전 상담 탭(/counsel) · 상담 채팅(/counsel/chat)을 합쳤습니다. 음성 통화는 머리의 [통화] 버튼으로 갑니다.
 *
 *   1. 화면을 열면 코치가 먼저 말을 겁니다. (아침 브리핑: 시간표 · 급식 · 시험 D-day · 오늘 카드 · 오늘 컨디션)
 *      이 첫 말은 코드가 만듭니다(lib/coachBriefing.ts). 그래서 열기만 해서는 AI 사용량을 쓰지 않습니다.
 *   2. 공부가 끝난 지 3시간 안이면 코치가 결과도 먼저 물어봅니다. ("25분 했네! 폰은 2번 들었어. 어땠어?")
 *   3. 말풍선 아래 칩을 누르거나 말을 쓰면 AI 가 답합니다.
 *      - 진짜 로그인: 그때 처음 서버 채팅을 열고, 지금까지의 대화를 모두 보내 AI 의 답을 받습니다.
 *      - 테스트 로그인: 서버를 못 써서 시연용 정해진 답(lib/demoCoach.ts)을 쓰고 "시연용 정해진 답" 이라고 붙입니다.
 *   4. "피곤해 · 시간 없어" 같은 핑계에는 AI 답 아래에 [▷ 10분으로 줄여서 시작] 칩을 붙입니다. (핑계 협상)
 *      행동 칩(시작 · 카드 만들기)은 누를 때만 실행합니다.
 *   5. 위기 표현이 나오면 상담 전화 한 줄을 보여 줍니다. 입력창은 닫지 않습니다. 서버가 대화를 끝냈으면(409) [새로 시작]
 *   6. [대화 끝내고 정리하기] → 통화 결과 화면(/call/result)이 통화와 똑같이 정리합니다. (진짜 로그인만)
 *
 * 모바일에서는 화면 높이를 꽉 채웁니다. 말풍선 목록만 스크롤되고, 입력창은 아래(하단 탭 위)에 붙어 있습니다.
 * ⚠️ 대화는 메모리(위의 keptChat)에만 있습니다. 브라우저 저장소에 넣지 않고, console.log 로 찍지 않습니다.
 */
export function CoachPage() {
  // 하루 1번 관리 단계를 판정해 저장합니다. ("통화가 없으면 다음 날 첫 진입 때", 기획서 5.4)
  // 첫 화면이 홈에서 코치로 바뀌어서 여기서도 부릅니다. 오늘 이미 판정했으면 아무것도 바꾸지 않습니다.
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
          {/* 음성 통화는 따로 탭 없이 여기서 엽니다. (전화 수신 화면 /call) */}
          <Link to="/call" className={chipClass}>
            <span aria-hidden>📞</span> 통화
          </Link>
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

function ChatSkeleton() {
  return (
    <div role="status" className="flex min-h-0 flex-1 flex-col gap-3 rounded-3xl bg-white p-4">
      <span className="sr-only">코치를 부르는 중이에요</span>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-24 w-4/5 rounded-[20px]" />
    </div>
  )
}

/** 코치의 첫 말 · 결과 묻기를 말풍선으로 만듭니다. */
function toCoachBubble(id: number, message: CoachMessage): ChatBubble {
  return { id, speaker: 'ai', text: message.text, chips: message.chips }
}

function CoachChat() {
  const navigate = useNavigate()
  const { token } = useAuth()
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
  // 오늘의 미션 (체크인 · 공부 기록 · 시간표로 끝났는지 봄). 컨디션 칩을 누르면 다시 계산합니다.
  const [missions, setMissions] = useState<Mission[]>(() => loadDailyMissions(todayKey))
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

  // 처음 그릴 때 한 번만 정합니다: 들고 있던 대화(없으면 코치의 첫 말) + 끝난 공부가 있으면 결과 묻기
  // + 미션 알림으로 들어왔으면 미션 이야기, 미션을 새로 끝냈으면 몇 개 끝냈는지
  const [initial] = useState(() => {
    const base = keptChat.token === token ? keptChat : EMPTY_CHAT
    let bubbles = base.bubbles
    if (bubbles.length === 0) {
      bubbles = [
        toCoachBubble(
          1,
          buildMorningBriefing({
            hour: new Date(now).getHours(),
            school,
            grade: schoolClass?.grade ?? gradeNumberOf(loadOnboardingAnswers()?.grade),
            cards: todayCards,
            checkIn: loadLocalCheckIn(todayKey),
          }),
        ),
      ]
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
    function nextBubbleId() {
      return bubbles.reduce((max, bubble) => Math.max(max, bubble.id), 0) + 1
    }
    if (recapSession) {
      const recap = buildSessionRecap(recapSession, loadPhoneLift(recapSession.id))
      // 공부를 끝내서 미션이 늘었으면 같은 말풍선에 한 줄로 붙입니다. (말풍선이 너무 많아지지 않게)
      if (hasNewMissionDone && !missionSlot) {
        recap.text += `\n✅ 오늘의 미션 ${doneMissions}/${missions.length} 끝!`
      }
      bubbles = [...bubbles, toCoachBubble(nextBubbleId(), recap)]
    }
    // 새로 연 대화의 첫 말이 이미 컨디션을 묻고 있으면(미션 ①), 미션 말풍선으로 같은 걸 또 묻지 않습니다.
    const isAskingCheckIn = base.bubbles.length === 0 && nextMission(missions)?.kind === 'checkIn'
    if (missionSlot && !isAskingCheckIn) {
      bubbles = [
        ...bubbles,
        toCoachBubble(nextBubbleId(), buildMissionBriefing(missions, missionSlot, nowCard)),
      ]
    } else if (hasNewMissionDone && !recapSession) {
      bubbles = [...bubbles, toCoachBubble(nextBubbleId(), buildMissionProgress(missions, nowCard))]
    }
    return {
      ...base,
      bubbles,
      recapSessionId: recapSession?.id ?? null,
      missionSlot,
    }
  })

  const [chatId, setChatId] = useState<string | null>(initial.chatId)
  const [bubbles, setBubbles] = useState<ChatBubble[]>(initial.bubbles)
  const [draft, setDraft] = useState('')
  // 위기 표현이 감지돼서 상담 전화 한 줄을 보여 주는 중인지
  const [isHelpShown, setIsHelpShown] = useState(initial.isHelpShown)
  // 다음 말풍선 번호
  const nextId = useRef(initial.bubbles.reduce((max, bubble) => Math.max(max, bubble.id), 0) + 1)
  const listRef = useRef<HTMLDivElement>(null)

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

  // 대화가 바뀔 때마다 메모리에 적어 둡니다. (탭을 옮겼다 돌아오면 이어서 보여 주려고)
  useEffect(() => {
    keptChat = { token, chatId, bubbles, isHelpShown }
  }, [token, chatId, bubbles, isHelpShown])

  function addBubble(bubble: Omit<ChatBubble, 'id'>, base: ChatBubble[]): ChatBubble[] {
    const next = { ...bubble, id: nextId.current }
    nextId.current += 1
    return [...base, next]
  }

  // 진짜 로그인일 때 AI 의 답을 받습니다. 채팅이 아직 안 열렸으면 그때 처음 엽니다.
  // (코치의 첫 말은 코드가 만든 것이라, 학생이 처음 말할 때까지 서버 채팅을 열지 않습니다)
  const talk = useMutation({
    mutationFn: async ({ id, lines }: { id: string | null; lines: CallLine[] }) => {
      let openId = id
      if (openId === null) {
        const opened = await startChat()
        openId = opened.chatId
        // 보내기가 실패해도 다시 보낼 때 채팅을 또 열지 않게, 연 번호를 바로 적어 둡니다.
        setChatId(openId)
      }
      const reply = await sendChatMessage(openId, lines)
      return { openId, reply }
    },
    onSuccess: ({ openId, reply }, variables) => {
      setChatId(openId)
      // 보낸 대화 뒤에 AI 의 말을 붙입니다. 학생이 핑계를 댔으면 목표를 줄이는 칩을 코드가 붙입니다.
      const studentText = variables.lines[variables.lines.length - 1]?.text ?? ''
      setBubbles((current) =>
        addBubble(
          { speaker: 'ai', text: reply.reply, chips: negotiationChipsFor(studentText) },
          current.slice(0, variables.lines.length),
        ),
      )
      if (reply.showHelp) setIsHelpShown(true)
    },
  })

  // 서버가 받는 줄 수(60)를 넘지 않게, 새 말과 AI 의 답이 들어갈 자리를 남겨 둡니다.
  const isTooLong = bubbles.length >= MAX_CHAT_LINES - 1
  // 409: 이미 끝났거나 서버가 다시 켜져 대본을 잊었습니다. 새로 시작해야 합니다.
  const needsRestart = talk.error instanceof ApiError && talk.error.status === 409
  const hasStudentLine = bubbles.some((bubble) => bubble.speaker === 'me')
  const lastBubble = bubbles[bubbles.length - 1]

  // 새 말풍선이 생기면 맨 아래로 내립니다.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [bubbles, talk.isPending])

  /** 학생의 말을 보냅니다. 진짜 로그인은 서버 AI, 테스트 로그인은 시연용 정해진 답이 답합니다. */
  function sendText(raw: string) {
    const text = raw.trim().slice(0, MAX_CHAT_TEXT_LENGTH)
    if (text === '' || talk.isPending || isTooLong) return
    const next = addBubble({ speaker: 'me', text }, bubbles)
    if (!isServerData) {
      const reply = replyDemo(text, { school, card: nowCard })
      setBubbles(
        addBubble({ speaker: 'ai', text: reply.text, chips: reply.chips, isDemo: true }, next),
      )
      if (reply.showHelp) setIsHelpShown(true)
      return
    }
    setBubbles(next)
    talk.mutate({ id: chatId, lines: toLines(next) })
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
      sendText(chip.label)
      return
    }
    if (chip.kind === 'startTitled') {
      // 제목을 붙인 카드(예: '미적분Ⅰ 복습' 10분)를 만들어 바로 시작합니다. 제목으로 복습 미션이 끝났는지 봅니다.
      const card = createInstantCardNow(todayKey, chip.minutes)
      addCard({
        ...card,
        title: chip.title,
        checklist: [{ id: `${card.id}-item-0`, text: chip.title }],
      })
      navigate(`/timer?card=${encodeURIComponent(card.id)}`)
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
    navigate(`/cards/new?date=${todayKey}`)
  }

  /** 미션 줄을 누르면 코치가 오늘의 미션을 보여 주고 다음 미션을 권합니다. */
  function handleShowMissions() {
    if (talk.isPending) return
    const message = buildMissionBriefing(missions, null, nowCard)
    setBubbles(addBubble({ speaker: 'ai', text: message.text, chips: message.chips }, bubbles))
  }

  /** 대화를 비우고 코치의 첫 말부터 다시 보여 줍니다. 메모리에 들고 있던 것도 같이 비웁니다. */
  function clearChat() {
    keptChat = { ...EMPTY_CHAT, token }
    const briefing = buildMorningBriefing({
      hour: new Date().getHours(),
      school,
      grade: schoolClass?.grade ?? gradeNumberOf(loadOnboardingAnswers()?.grade),
      cards: todayCards,
      checkIn: loadLocalCheckIn(todayKey),
    })
    setChatId(null)
    setBubbles(addBubble({ speaker: 'ai', text: briefing.text, chips: briefing.chips }, []))
    setIsHelpShown(false)
    talk.reset()
  }

  function handleFinish() {
    if (chatId === null || !hasStudentLine) {
      clearChat()
      return
    }
    // 통화와 같은 기록이라, 통화 결과 화면이 POST /calls/{chatId}/finish 로 정리합니다.
    const state: CallResultState = { callId: chatId, lines: toLines(bubbles) }
    clearChat()
    navigate('/call/result', { state })
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
          {bubbles.map((bubble) =>
            bubble.speaker === 'ai' ? (
              <li key={bubble.id}>
                <CoachBubble text={bubble.text} isDemo={bubble.isDemo} />
                {/* 칩은 가장 마지막 코치 말풍선 아래에만 보입니다. 답을 받는 중에는 숨깁니다. */}
                {bubble === lastBubble && !talk.isPending && bubble.chips && (
                  <ChipRow chips={bubble.chips} onPick={handleChip} />
                )}
              </li>
            ) : (
              <li key={bubble.id} className="flex justify-end">
                {/* max-w-[80%] + break-words: 긴 말풍선도 화면 폭을 넘지 않고 안에서 줄바꿈됩니다. */}
                <p className="bg-brand max-w-[80%] rounded-[20px] px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap text-white">
                  {bubble.text}
                </p>
              </li>
            ),
          )}
          {talk.isPending && (
            <li>
              <CoachBubble text="쓰는 중…" isStatus />
            </li>
          )}
        </ul>
      </div>

      {/* 위기 표현이 감지됐을 때 상담 전화 한 줄. 대화는 막지 않습니다. (누르면 바로 전화가 걸립니다) */}
      {isHelpShown && (
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
            {needsRestart ? (
              <button type="button" onClick={clearChat} className={chipClass}>
                새로 시작
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  talk.variables && talk.mutate({ id: chatId, lines: talk.variables.lines })
                }
                className={chipClass}
              >
                다시 보내기
              </button>
            )}
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
            disabled={talk.isPending || isTooLong}
            placeholder={
              isTooLong ? '대화가 길어졌어요. 끝내기를 눌러 정리해요.' : '코치에게 말하기'
            }
            // text-base: 아이폰은 16px 보다 작은 입력칸을 누르면 화면을 확대해서 16px 로 둡니다.
            className="focus:ring-brand/30 max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-base placeholder:text-slate-400 focus:ring-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={draft.trim() === '' || talk.isPending || isTooLong}
            className="bg-brand h-11 shrink-0 cursor-pointer rounded-2xl px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            보내기
          </button>
        </div>
        {hasStudentLine && (
          <button
            type="button"
            onClick={handleFinish}
            disabled={talk.isPending}
            className="h-10 cursor-pointer self-end rounded-full px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chatId === null ? '처음부터 다시' : '대화 끝내고 정리하기'}
          </button>
        )}
      </form>
    </div>
  )
}

// 작은 칩 버튼: 흰 바탕 + 옅은 테두리, 높이 40px
const chipClass =
  'flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-transform active:scale-[0.98]'

interface MissionBarProps {
  missions: Mission[]
  /** 누르면 코치가 미션 전체를 보여 줍니다. */
  onOpen: () => void
}

/**
 * 코치 화면 맨 위의 "오늘의 미션" 한 줄. 몇 개 끝냈는지와 다음 미션 이름을 보여 줍니다.
 * 채팅 자리를 덜 차지하려고 한 줄(높이 56px)로만 둡니다. 누르면 코치가 미션을 말풍선으로 보여 줍니다.
 */
function MissionBar({ missions, onOpen }: MissionBarProps) {
  const done = countDoneMissions(missions)
  const next = nextMission(missions)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`오늘의 미션 ${missions.length}개 중 ${done}개 끝. 눌러서 코치에게 보기`}
      className="flex min-h-14 w-full shrink-0 cursor-pointer items-center gap-3 rounded-3xl bg-white px-4 py-2 text-left transition-transform active:scale-[0.99]"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          next ? 'bg-brand-light text-brand' : 'bg-emerald-50 text-emerald-700',
        )}
      >
        {done}/{missions.length}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500">오늘의 미션</span>
        <span className="block truncate text-[15px] font-semibold text-slate-900">
          {next ? next.title : '오늘 미션 다 끝냈어요 👏'}
        </span>
      </span>
      <span aria-hidden className="text-slate-400">
        ›
      </span>
    </button>
  )
}

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
