/**
 * 홈의 "어제 한 줄" 을 만드는 규칙입니다.
 *
 * 숫자는 코드가(lib/daySummary.ts), 말은 AI 가 맡습니다. AI 가 없을 때(서버 연결 전 · 실패 · 테스트 로그인)는
 * 이 파일이 숫자를 끼워 만든 "기본 문장" 을 보여줍니다. 그래서 한 줄은 항상 나옵니다. (주간 코치 lib/weeklyCoach.ts 와 같은 방식)
 *
 * - getYesterdayLine : 기본 문장과 AI 에게 건넬 숫자를 만듭니다. (React·서버 없이 돌아가는 순수 함수)
 * - dailyCoachQuery  : 서버에 AI 문장을 물어보는 쿼리 설정입니다.
 *
 * ⚠️ 서버에는 "계산된 숫자" 만 보냅니다. 계획 내용·과목 이름 같은 원문은 보내지 않습니다.
 */
import { formatMinutes } from '@/lib/dailyRecords'
import type { DaySummary } from '@/lib/daySummary'
import { loadData, saveData } from '@/lib/storage'
import {
  fetchCoachParagraph,
  type CoachCommentRequest,
  type CoachEvidence,
} from '@/lib/weeklyCoach'
import { queryOptions } from '@tanstack/react-query'

/** 어제 한 줄의 기본 문장과 그 근거 */
export interface YesterdayLine {
  /** 숫자를 끼워 만든 기본 문장 */
  sentence: string
  /** AI 에게 건넬 숫자들. 비어 있으면 AI 에게 묻지 않습니다. (말로 풀 숫자가 없기 때문입니다) */
  evidence: CoachEvidence[]
}

/**
 * 어제의 요약으로 "어제 한 줄" 을 만듭니다.
 *
 * ■ 규칙
 *  1. 어제 공부 기록이 있고 계획도 있었으면  -> "어제 순공 3시간 10분, 계획의 79%야."  (숫자 2개)
 *  2. 기록은 있는데 계획이 없었으면         -> "어제 순공 1시간, 계획 없이도 해냈네."  (숫자 1개)
 *     계획 없이 공부한 날을 "계획의 0%" 라고 하면 못한 것처럼 들려서 다르게 말합니다.
 *  3. 어제 기록이 없으면                    -> "오늘부터 시작해 볼까?"  (숫자 없음. AI 에게 묻지 않습니다)
 *
 * ■ 예시
 *   getYesterdayLine({ studyMinutes: 190, achievementRate: 79, … }, true)
 *     -> { sentence: '어제 순공 3시간 10분, 계획의 79%야.',
 *          evidence: [{ label: '어제 순공시간', value: '3시간 10분', basis: '타이머 기록' },
 *                     { label: '어제 계획 대비 실제', value: '79%', basis: '어제 계획' }] }
 *   getYesterdayLine({ studyMinutes: 60, achievementRate: null, … }, false)
 *     -> { sentence: '어제 순공 1시간, 계획 없이도 해냈네.', evidence: [순공시간 하나] }
 *   getYesterdayLine({ studyMinutes: 0, … }, true)
 *     -> { sentence: '오늘부터 시작해 볼까?', evidence: [] }
 */
export function getYesterdayLine(summary: DaySummary, hasPlan: boolean): YesterdayLine {
  if (summary.studyMinutes <= 0) {
    return { sentence: '오늘부터 시작해 볼까?', evidence: [] }
  }

  const studyText = formatMinutes(summary.studyMinutes)
  const studyEvidence: CoachEvidence = {
    label: '어제 순공시간',
    value: studyText,
    basis: '타이머 기록',
  }

  if (hasPlan && summary.achievementRate !== null) {
    return {
      sentence: `어제 순공 ${studyText}, 계획의 ${summary.achievementRate}%야.`,
      evidence: [
        studyEvidence,
        { label: '어제 계획 대비 실제', value: `${summary.achievementRate}%`, basis: '어제 계획' },
      ],
    }
  }

  return { sentence: `어제 순공 ${studyText}, 계획 없이도 해냈네.`, evidence: [studyEvidence] }
}

/* ---------- 서버에 AI 문장 물어보기 ----------
 *
 * 홈은 하루에도 여러 번 여는 화면입니다. 열 때마다 AI 에게 물으면 같은 답에 돈만 듭니다.
 * 그래서 한 번 받은 문장은 이 브라우저에 저장해 두고, "같은 날 · 같은 숫자" 면 서버에 다시 묻지 않습니다.
 * (어제의 숫자는 하루 동안 바뀌지 않으니, 보통 하루에 한 번만 묻게 됩니다)
 */

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-daily-coach' 가 됩니다)
// 새 저장 키라서 lib/myData.ts 의 "모든 기록 지우기" 목록에도 넣어 두었습니다.
export const DAILY_COACH_STORAGE_KEY = 'daily-coach'

/** 저장해 두는 모양 */
interface SavedDailyCoach {
  /** 어느 날의 한 줄인지 (어제 날짜 'YYYY-MM-DD') */
  date: string
  /** 그때 보낸 숫자와 한도를 글자로 이어 붙인 것. 숫자나 한도가 바뀌면 다시 물어보려고 같이 저장합니다. */
  signature: string
  /** AI 가 쓴 문장 */
  paragraph: string
}

function makeSignature(request: CoachCommentRequest): string {
  return JSON.stringify([request.numbers, request.maxCareLevel, request.maxHarshness])
}

/** 저장해 둔 문장이 "이 날 · 이 숫자" 의 것이면 돌려줍니다. 아니면 null 입니다. */
function loadSavedParagraph(date: string, signature: string): string | null {
  const saved = loadData<unknown>(DAILY_COACH_STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const record = saved as Partial<SavedDailyCoach>
  if (record.date !== date || record.signature !== signature) return null
  return typeof record.paragraph === 'string' && record.paragraph !== '' ? record.paragraph : null
}

async function fetchDailyCoach(date: string, request: CoachCommentRequest): Promise<string | null> {
  const signature = makeSignature(request)
  const saved = loadSavedParagraph(date, signature)
  if (saved !== null) return saved

  const paragraph = await fetchCoachParagraph('daily', request)
  // 받았을 때만 저장합니다. 못 받았으면(null) 다음에 홈을 열 때 다시 물어봅니다.
  if (paragraph !== null) {
    const toSave: SavedDailyCoach = { date, signature, paragraph }
    saveData(DAILY_COACH_STORAGE_KEY, toSave)
  }
  return paragraph
}

/**
 * "어제 한 줄" AI 문장의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(dailyCoachQuery(어제 날짜, request)) 로 받아옵니다.
 * data 는 AI 가 쓴 문장(글자)이거나, 받지 못했을 때 null 입니다.
 *
 * - staleTime 1시간: 홈에 다시 들어와도 한 시간 안에는 저장소도 서버도 다시 보지 않습니다.
 * - retry: false — 실패는 이미 null 로 바꿔 돌려주기 때문에 다시 시도할 일이 없습니다.
 */
export function dailyCoachQuery(date: string, request: CoachCommentRequest) {
  return queryOptions({
    queryKey: ['coach', 'daily', date, request.numbers, request.maxCareLevel, request.maxHarshness],
    queryFn: () => fetchDailyCoach(date, request),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
}
