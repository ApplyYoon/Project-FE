/**
 * 생각 습관 테스트 결과를 서버(BE)에도 저장하는 함수들입니다. (BE 저장소 docs/API.md "생각 습관 테스트")
 *
 *   POST /thinking-tests   { testVersion, scores: [{ habit, average }] 8개, weaknesses: [...] }   -> 201
 *   서버는 문장별 답이 아니라 습관마다의 평균만 받습니다. "기타" 에 쓴 글은 보내지 않습니다.
 *   다시 하면 서버는 덮어쓰지 않고 새로 쌓습니다. (처음과 지금을 견줄 수 있게)
 *
 * ■ 왜 서버에도 저장하나요?
 *   AI 통화의 첫 질문 · 체크리스트 추천의 "계획 성향" · 시험 결과의 "내 생각 vs 현실" 은 서버가 이 결과를 읽어서 만듭니다.
 *   이 기기에만 있으면 서버의 분석 기능이 쓸 데이터가 없습니다. (2026-10-17 "데이터가 쌓여야 AI 가 객관적으로 분석한다")
 *
 * ■ 이 기기의 저장소(study-thinking-test)는 그대로 씁니다. 이 기기에 먼저 저장하고(saveThinkingTest) 서버로도 보냅니다.
 *   못 보내면 다음에 앱을 열 때 다시 보냅니다. (useThinkingTestSync)
 *   "보냈다" 는 표시로 보낸 결과의 서명(날짜 · 답 · 약점)을 적어 둡니다. 표시가 없거나 결과가 바뀌었으면 아직 안 보낸 것입니다.
 *   그래서 예전에 이 기기에만 저장해 둔 결과도 한 번 서버로 갑니다.
 *
 * ■ 테스트 로그인(서버가 모르는 가짜 토큰)일 때는 서버를 부르지 않습니다. (canSyncThinkingTest)
 *
 * ⚠️ "기타" 글과 답은 console.log 로 찍지 않습니다.
 */
import { api } from '@/lib/api'
import { TEST_TOKEN } from '@/lib/testLogin'
import { loadData, saveData } from '@/lib/storage'
import {
  TEST_VERSION,
  loadThinkingTest,
  scoreThinkingTest,
  type SavedThinkingTest,
  type ThinkingHabitKey,
  type WeaknessKey,
} from '@/lib/thinkingTest'

/** 서버 응답을 기다리는 최대 시간(밀리초) */
const REQUEST_TIMEOUT_MS = 10000

/** 서버에 보낸 결과의 서명을 적어 두는 저장 키 */
export const THINKING_TEST_SENT_KEY = 'thinking-test-sent'

/** 서버로 보내는 모양 (POST 본문) */
export interface ThinkingTestBody {
  testVersion: number
  scores: { habit: ThinkingHabitKey; average: number }[]
  weaknesses: WeaknessKey[]
}

/** 이 토큰으로 서버에 저장할 수 있는지. 로그아웃 상태와 테스트 로그인은 false 입니다. */
export function canSyncThinkingTest(token: string | null): boolean {
  return token !== null && token !== TEST_TOKEN
}

/** 이 기기에 저장된 결과를 서버로 보낼 모양으로 바꿉니다. 습관 8개의 평균과 고른 약점 칩만 담습니다. */
export function toThinkingTestBody(saved: SavedThinkingTest): ThinkingTestBody {
  return {
    testVersion: TEST_VERSION,
    scores: scoreThinkingTest(saved.answers).scores.map((score) => ({
      habit: score.key,
      average: score.average,
    })),
    weaknesses: saved.weaknesses,
  }
}

/** 결과 하나의 서명. 같은 결과면 같은 글자입니다. (날짜 · 답 · 약점) */
export function signatureOf(saved: SavedThinkingTest): string {
  const answers = Object.keys(saved.answers)
    .sort()
    .map((id) => `${id}:${saved.answers[id]}`)
    .join(',')
  return `${saved.takenAt}|${answers}|${[...saved.weaknesses].sort().join(',')}`
}

/** 이 기기의 결과가 아직 서버에 안 갔는지. 결과가 없으면 false 입니다. */
export function needsSendingThinkingTest(): boolean {
  const saved = loadThinkingTest()
  return saved !== null && loadData<unknown>(THINKING_TEST_SENT_KEY, null) !== signatureOf(saved)
}

/**
 * 이 기기의 결과를 서버로 보내고, 보냈다고 표시합니다. 보낼 것이 없으면 아무것도 하지 않습니다.
 * 실패하면 에러를 던집니다. 이 기기의 결과는 그대로라서 다음에 다시 보낼 수 있습니다.
 */
export async function sendThinkingTest(): Promise<void> {
  const saved = loadThinkingTest()
  if (saved === null || !needsSendingThinkingTest()) return
  await api<unknown>('/thinking-tests', {
    method: 'POST',
    body: JSON.stringify(toThinkingTestBody(saved)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  saveData(THINKING_TEST_SENT_KEY, signatureOf(saved))
}

/** 서버가 "값이 틀렸다(400)" 고 해서 다시 보내도 소용없을 때, 이 결과는 보낸 것으로 쳐서 다시 보내지 않게 합니다. */
export function markThinkingTestHandled(): void {
  const saved = loadThinkingTest()
  if (saved !== null) saveData(THINKING_TEST_SENT_KEY, signatureOf(saved))
}
