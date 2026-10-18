import { moveDateKey } from '@/lib/date'
import {
  MAX_LONG_PLAN_DAYS,
  MAX_PLAN_TEXT_LENGTH,
  summarizePlan,
  type PlanReply,
} from '@/lib/coachPlan'

/**
 * AI 통화 중에 쓰는 "도구" 입니다. (2026-10-18, 이슈 #577)
 * 학생이 통화에서 "계획 짜 줘" 라고 하면 AI 가 도구를 부르고, 앱이 계획을 짜서 통화 화면에 계획 카드를 띄웁니다.
 * 그다음 앱이 "화면에 띄웠어" 라는 결과를 AI 에게 돌려주면, AI 가 이어서 말로 설명하고 고칠 곳을 묻습니다.
 * React 를 쓰지 않는 순수 함수만 둡니다. 연결 쪽은 lib/realtimeCall.ts, 화면은 pages/CallActivePage.tsx 입니다.
 *
 * OpenAI Realtime API 의 함수 호출(function calling) 순서 (공식 문서 "Realtime conversations" 의 Function calling 기준)
 *   1. 앱 → session.update 로 도구 목록을 알림
 *   2. AI → response.function_call_arguments.done { call_id, name, arguments: 'JSON 글' }
 *   3. 앱 → conversation.item.create { item: { type: 'function_call_output', call_id, output } } → response.create
 * ⚠️ 진짜 서버(GPT 음성)로는 아직 확인하지 못했습니다. 문서와 다르면 이 파일과 realtimeCall.ts 만 고치면 됩니다.
 */

/** AI 에게 알려 주는 도구 하나 (Realtime API 의 tools 칸 모양) */
export interface RealtimeTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** AI 가 부른 도구 하나 */
export interface ToolCall {
  /** 결과를 돌려줄 때 같이 보내는 번호 */
  callId: string
  name: string
  /** AI 가 채운 값 (JSON 글을 읽은 것). 읽지 못했으면 빈 객체 */
  args: Record<string, unknown>
}

/**
 * 통화에서 쓰는 도구 3개. 오늘 날짜를 알려 줘야 AI 가 "다음 주 금요일" 같은 말을 날짜로 바꿀 수 있습니다.
 *   show_day_plan  — 오늘 계획을 짜서 화면에 띄움
 *   show_long_plan — 시험 · 대회 날까지의 계획(최대 30일)을 짜서 화면에 띄움
 *   revise_plan    — 화면에 띄운 계획을 학생 말대로 고침
 */
export function buildCallTools(todayKey: string): RealtimeTool[] {
  return [
    {
      type: 'function',
      name: 'show_day_plan',
      description:
        '학생이 오늘 공부 계획을 짜 달라고 하면 부른다. 앱이 오늘 계획을 짜서 학생 화면에 띄운다. 계획 내용은 앱이 정한다.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      type: 'function',
      name: 'show_long_plan',
      description: `학생이 시험 · 대회 · 수행평가 같은 날까지의 계획을 짜 달라고 하면, 무엇을 언제까지 준비하는지 확인한 뒤 부른다. 오늘은 ${todayKey} 이고, 날짜는 내일부터 ${MAX_LONG_PLAN_DAYS}일 뒤까지만 된다. 앱이 계획을 짜서 학생 화면에 띄운다.`,
      parameters: {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            description: '준비하는 것 한 줄 (예: 중간고사 미적분 1~3단원)',
          },
          endDate: { type: 'string', description: '시험 · 마감 날 YYYY-MM-DD' },
        },
        required: ['goal', 'endDate'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'revise_plan',
      description:
        '화면에 띄운 계획을 학생이 고쳐 달라고 하면 부른다. 예: 주말은 빼 줘, 하루 30분으로, 8시부터, 영어는 빼 줘.',
      parameters: {
        type: 'object',
        properties: {
          request: { type: 'string', description: '학생의 요청 한 줄' },
        },
        required: ['request'],
        additionalProperties: false,
      },
    },
  ]
}

/**
 * 데이터 채널로 온 이벤트가 "도구를 불렀다" 는 이벤트면 꺼냅니다. 아니면 null
 *
 *   { type: 'response.function_call_arguments.done', call_id: 'c1', name: 'show_day_plan', arguments: '{}' }
 *   -> { callId: 'c1', name: 'show_day_plan', args: {} }
 */
export function parseToolCallEvent(data: unknown): ToolCall | null {
  if (typeof data !== 'string') return null
  let event: unknown
  try {
    event = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof event !== 'object' || event === null) return null
  const record = event as Record<string, unknown>
  if (record.type !== 'response.function_call_arguments.done') return null
  if (typeof record.call_id !== 'string' || typeof record.name !== 'string') return null
  let args: Record<string, unknown> = {}
  if (typeof record.arguments === 'string') {
    try {
      const parsed: unknown = JSON.parse(record.arguments)
      if (typeof parsed === 'object' && parsed !== null) args = parsed as Record<string, unknown>
    } catch {
      args = {}
    }
  }
  return { callId: record.call_id, name: record.name, args }
}

/**
 * show_long_plan 의 값을 확인합니다. 목표가 비었거나 날짜가 내일 ~ 30일 뒤가 아니면 null
 *
 *   readLongPlanArgs({ goal: '중간고사 미적분', endDate: '2026-11-02' }, '2026-10-18') -> { goal, endDate }
 *   readLongPlanArgs({ goal: '중간고사', endDate: '2026-12-25' }, '2026-10-18')       -> null (30일 넘음)
 */
export function readLongPlanArgs(
  args: Record<string, unknown>,
  todayKey: string,
): { goal: string; endDate: string } | null {
  const goal = typeof args.goal === 'string' ? args.goal.trim().slice(0, MAX_PLAN_TEXT_LENGTH) : ''
  const endDate = typeof args.endDate === 'string' ? args.endDate.trim() : ''
  if (goal === '' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null
  if (endDate < moveDateKey(todayKey, 1) || endDate > moveDateKey(todayKey, MAX_LONG_PLAN_DAYS)) {
    return null
  }
  return { goal, endDate }
}

/** revise_plan 의 요청 한 줄. 비었으면 null */
export function readReviseArgs(args: Record<string, unknown>): string | null {
  const request =
    typeof args.request === 'string' ? args.request.trim().slice(0, MAX_PLAN_TEXT_LENGTH) : ''
  return request === '' ? null : request
}

/**
 * 계획을 짜거나 고친 결과를 AI 에게 돌려줄 한두 문장. AI 는 이 글을 보고 이어서 말합니다.
 *
 *   -> '학생 화면에 계획을 띄웠어: 10/19~11/1 · 공부 12일 · 하루 60분. 화면을 보고 [이대로 할게] 를 누르거나 고칠 곳을 말해 달라고 해.'
 */
export function planOutputForAi(result: PlanReply): string {
  if (result.showHelp) {
    return '계획은 미루자. 학생이 힘든 이야기를 했으니 공부 이야기는 그만하고 마음을 먼저 들어 줘.'
  }
  if (result.plan === null) {
    return `계획을 화면에 띄우지 못했어. 앱이 한 말: "${result.reply}" 학생에게 다르게 말해 달라고 해.`
  }
  return `학생 화면에 계획을 띄웠어: ${summarizePlan(result.plan)}. 화면을 보고 [이대로 할게] 를 누르거나 고칠 곳을 말해 달라고 해.`
}

/** AI 에게 도구 결과를 돌려주는 이벤트 2개 (결과 → 이어서 말하기) */
export function toolOutputEvents(callId: string, output: string): Record<string, unknown>[] {
  return [
    {
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    },
    { type: 'response.create' },
  ]
}
