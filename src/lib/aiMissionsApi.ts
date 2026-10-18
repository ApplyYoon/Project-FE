/**
 * "AI 가 짜는 오늘의 미션" 을 서버(BE)에 부탁합니다. (2026-10-18, BE `POST /ai/daily-missions`)
 * AI 키는 서버에만 있고, 여기서는 오늘 시간표 과목 · 가까운 시험 · 내가 준비하는 것 · 오늘 컨디션만 보냅니다.
 *
 *   요청 { date, focus: { kind, name } | null, subjects: string[], exam: { name, dDay } | null, condition: 1~5 | null }
 *   응답 { showHelp, missions: [{ title, minutes, subject }] (1~3개) | null }
 *     - missions 가 null 이면 AI 가 못 만든 것(꺼짐 · 하루 한도 · 실패)이라, 화면은 규칙 미션을 씁니다.
 *     - showHelp 가 true 면 이름 한 줄에 위기 표현이 있어서 AI 를 쓰지 않은 것입니다. 이때도 규칙 미션입니다.
 *
 * 하루에 한 번만 부르려고, 받은 미션을 날짜 · 입력과 같이 저장해 둡니다. (study-ai-missions)
 * 날짜와 입력이 같으면 서버에 다시 묻지 않고 저장해 둔 것을 씁니다. 컨디션은 보내지만 같은 입력인지 볼 때는 빼서,
 * 컨디션을 고른 뒤에 한 번만 부릅니다. (lib/dailyMission.ts 가 저장해 둔 것을 읽어 미션을 만듭니다)
 * 테스트 로그인(가짜 토큰)이면 서버를 부르지 않습니다.
 */
import { queryOptions } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { isServerDataMode } from '@/lib/dataMode'
import { loadData, saveData } from '@/lib/storage'
import type { StudyFocus } from '@/lib/studyFocus'

// 서버가 GPT 를 최대 10초 기다리므로 그보다 조금 더 기다립니다.
const REQUEST_TIMEOUT_MS = 12000
// 저장소에 넣는 이름 (실제 키는 'study-ai-missions')
const STORAGE_KEY = 'ai-missions'

/** AI 가 정한 공부 미션 하나 */
export interface AiMission {
  /** 미션 이름 (30자까지). 예: '수능 기출 미적분 3문제' */
  title: string
  /** 길이 (5 ~ 60분) */
  minutes: number
  /** 오늘 시간표 과목과 이어지면 그 과목. 아니면 null */
  subject: string | null
}

/** 서버에 보내는 것 (날짜 빼고) */
export interface AiMissionsInput {
  focus: StudyFocus | null
  subjects: string[]
  exam: { name: string; dDay: number } | null
  condition: number | null
}

/** 같은 입력인지 볼 때 쓰는 글자. 컨디션은 뺍니다. (컨디션만 바뀌었다고 다시 묻지 않게) */
export function aiMissionsInputKey(input: AiMissionsInput): string {
  return JSON.stringify({ focus: input.focus, subjects: input.subjects, exam: input.exam })
}

/** 서버가 준 미션 하나를 확인합니다. 모양이 틀리면 null (서버 응답도 그대로 믿지 않습니다) */
function toMission(value: unknown): AiMission | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.title !== 'string' || record.title.trim() === '') return null
  const minutes = record.minutes
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 5 || minutes > 60) {
    return null
  }
  const subject =
    typeof record.subject === 'string' && record.subject.trim() !== '' ? record.subject : null
  return { title: record.title.trim().slice(0, 30), minutes, subject }
}

/** 저장해 둔 오늘의 AI 미션. 날짜나 입력이 다르면 undefined (아직 안 물어봄) · null 이면 물어봤는데 못 받음 */
export function loadCachedAiMissions(
  dateKey: string,
  inputKey?: string,
): AiMission[] | null | undefined {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return undefined
  const record = saved as Record<string, unknown>
  if (record.date !== dateKey) return undefined
  if (inputKey !== undefined && record.inputKey !== inputKey) return undefined
  if (record.missions === null) return null
  if (!Array.isArray(record.missions)) return undefined
  return record.missions.map(toMission).filter((mission): mission is AiMission => mission !== null)
}

function saveCachedAiMissions(dateKey: string, inputKey: string, missions: AiMission[] | null) {
  saveData(STORAGE_KEY, { date: dateKey, inputKey, missions })
}

/**
 * 오늘의 AI 미션을 받습니다. 저장해 둔 것이 있으면 그것, 없으면 서버에 묻고 저장합니다.
 * 못 받으면(테스트 로그인 · AI 꺼짐 · 실패) null 이고, 화면은 규칙 미션을 씁니다.
 */
export async function fetchAiMissions(
  dateKey: string,
  input: AiMissionsInput,
): Promise<AiMission[] | null> {
  if (!isServerDataMode()) return null
  const inputKey = aiMissionsInputKey(input)
  const cached = loadCachedAiMissions(dateKey, inputKey)
  if (cached !== undefined) return cached
  try {
    const result = await api<unknown>('/ai/daily-missions', {
      method: 'POST',
      body: JSON.stringify({
        date: dateKey,
        focus: input.focus,
        subjects: input.subjects.slice(0, 8).map((subject) => subject.slice(0, 20)),
        exam: input.exam ? { name: input.exam.name.slice(0, 40), dDay: input.exam.dDay } : null,
        condition: input.condition,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const record = (typeof result === 'object' && result !== null ? result : {}) as Record<
      string,
      unknown
    >
    const missions =
      record.showHelp !== true && Array.isArray(record.missions)
        ? record.missions
            .map(toMission)
            .filter((mission): mission is AiMission => mission !== null)
            .slice(0, 3)
        : null
    const usable = missions !== null && missions.length > 0 ? missions : null
    // 못 받은 것도 저장해서 같은 날 같은 입력으로 다시 묻지 않습니다. (하루 한도를 아끼려고)
    saveCachedAiMissions(dateKey, inputKey, usable)
    return usable
  } catch (error) {
    // 401 은 api() 가 이미 로그인 화면으로 보냅니다. 그 밖의 실패(연결 · 서버 준비 전 404 등)는 규칙 미션으로 갑니다.
    if (error instanceof ApiError && error.status === 401) throw error
    return null
  }
}

/** 오늘의 AI 미션 쿼리. 같은 날 같은 입력이면 다시 부르지 않습니다. */
export function aiMissionsQuery(dateKey: string, input: AiMissionsInput) {
  return queryOptions({
    queryKey: ['ai', 'daily-missions', dateKey, aiMissionsInputKey(input)],
    queryFn: () => fetchAiMissions(dateKey, input),
    staleTime: Infinity,
    retry: false,
  })
}
