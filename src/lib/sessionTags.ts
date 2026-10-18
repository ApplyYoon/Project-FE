import { toReasonList } from '@/lib/reasons'
import type {
  GoodReason,
  PauseTag,
  SessionEndReport,
  SessionPause,
  ShortfallReason,
  WithWhat,
} from '@/types'

/**
 * 타이머 팝업의 1탭 태그 이름표와 분류를 한 곳에 모아 둡니다. (최종 기획서 「4.4 타이머」, #380)
 * 버튼은 배열 순서대로 보입니다. BE(Project-BE#224)도 같은 값과 분류를 씁니다.
 */

/**
 * 원인이 어디서 왔는지 — 귀인(1번 오류) 비율을 셀 때 씁니다.
 * - internal: 내 행동·선택에서 나옴 (폰 확인, 딴생각 …)
 * - external: 바깥에서 옴 (가족이 부름, 운 …)
 * - basic: 화장실·물처럼 누구나 필요한 것. 귀인 비율을 셀 때는 뺍니다
 */
export type CauseSource = 'internal' | 'external' | 'basic'

/** 일시정지 이유 7개 (「4.4 타이머」 일시정지). '기타' 는 글만 받고, 나중에 AI 가 내부/외부로 나눕니다 */
export const PAUSE_TAGS: { key: PauseTag; label: string; source: CauseSource | 'unknown' }[] = [
  { key: 'toilet', label: '화장실', source: 'basic' },
  { key: 'snack', label: '물/간식', source: 'basic' },
  { key: 'phone', label: '폰 확인', source: 'internal' },
  { key: 'mindWander', label: '딴생각', source: 'internal' },
  { key: 'stuck', label: '막힘', source: 'internal' },
  { key: 'external', label: '외부 방해(가족 등)', source: 'external' },
  { key: 'other', label: '기타', source: 'unknown' },
]

/** 체크리스트를 다 못 했을 때의 이유 */
export const SHORTFALL_REASONS: { key: ShortfallReason; label: string }[] = [
  { key: 'tooMuch', label: '계획이 많았음' },
  { key: 'stuck', label: '막힘' },
  { key: 'phone', label: '폰·SNS' },
  { key: 'mindWander', label: '딴생각' },
  { key: 'tired', label: '피곤함' },
  { key: 'external', label: '외부 방해' },
  { key: 'etc', label: '기타' },
]

/**
 * 잘 된 이유 6개. 성공을 내 덕으로 보는지 밖의 덕으로 보는지 셉니다.
 * 컨디션은 내가 정할 수 없는 것이라 바깥(external)으로 셉니다.
 */
export const GOOD_REASONS: { key: GoodReason; label: string; source: CauseSource }[] = [
  { key: 'focus', label: '집중 잘 됨', source: 'internal' },
  { key: 'goodPlan', label: '계획이 적당함', source: 'internal' },
  { key: 'condition', label: '컨디션 좋음', source: 'external' },
  { key: 'environment', label: '환경이 좋았음', source: 'external' },
  { key: 'helped', label: '누가 도와줌', source: 'external' },
  { key: 'luck', label: '운이 좋았음', source: 'external' },
]

/** 같이 한 것 */
export const WITH_WHAT_OPTIONS: { key: WithWhat; label: string }[] = [
  { key: 'music', label: '음악' },
  { key: 'video', label: '영상 틀어둠' },
  { key: 'none', label: '없음' },
]

/**
 * 일시정지 이유가 어디서 왔는지 돌려줍니다. '기타' 는 아직 모름(unknown)입니다.
 *
 *   getPauseSource('phone')    -> 'internal'
 *   getPauseSource('external') -> 'external'
 *   getPauseSource('toilet')   -> 'basic'
 *   getPauseSource('other')    -> 'unknown'
 */
export function getPauseSource(tag: PauseTag): CauseSource | 'unknown' {
  return PAUSE_TAGS.find((item) => item.key === tag)?.source ?? 'unknown'
}

/**
 * 일시정지 한 번에 고른 이유 모두. 예전 기록(tag 하나)도 [하나] 로 돌려줍니다. (lib/reasons.ts)
 *
 *   getPauseTags({ tag: 'phone', tags: ['phone', 'mindWander'] }) -> ['phone', 'mindWander']
 *   getPauseTags({ tag: 'toilet' })                               -> ['toilet']
 */
export function getPauseTags(pause: Pick<SessionPause, 'tag' | 'tags'>): PauseTag[] {
  return toReasonList(pause.tags, pause.tag)
}

/**
 * 종료 팝업에서 고른 "다 못 한 이유" 모두. 예전 기록(하나)도 [하나] 로, 없으면 빈 목록입니다.
 *
 *   getShortfallReasons({ checked: {}, shortfallReason: 'stuck', shortfallReasons: ['stuck', 'tired'] }) -> ['stuck', 'tired']
 *   getShortfallReasons({ checked: {}, shortfallReason: 'phone' }) -> ['phone']
 *   getShortfallReasons(undefined) -> []
 */
export function getShortfallReasons(
  report: Pick<SessionEndReport, 'shortfallReason' | 'shortfallReasons'> | undefined,
): ShortfallReason[] {
  return toReasonList(report?.shortfallReasons, report?.shortfallReason)
}
