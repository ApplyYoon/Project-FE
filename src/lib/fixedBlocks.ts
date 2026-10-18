import { getWeekday } from '@/lib/routines'
import { loadData } from '@/lib/storage'
import type { FixedBlock } from '@/types'

/**
 * 고정 일정 블록(학교·학원, 「4.3 카드」, #393)을 읽는 함수들입니다.
 * 카드와 겹치는지 보는 계산은 lib/scheduleCheck.ts, 타임라인은 lib/cardTimeline.ts 에 있습니다.
 *
 * 고정 일정 입력 화면(/cards/fixed)과 서버 동기화는 시연 범위 밖이라 2026-10-18 에 지웠습니다.
 * 카드 탭 · 카드 만들기는 이제 빈 목록(NO_FIXED_BLOCKS)을 넘깁니다.
 * 타임라인 · 겹침 검사는 고정 일정을 그대로 받을 수 있어서, 학교 시간표(NEIS)를 붙일 때 그 자리에 넣으면 됩니다.
 */

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-fixed-blocks' 가 됩니다)
// 예전에 넣은 고정 일정과 시연용 가상 데이터(lib/demoData.ts)가 여기에 있습니다.
const FIXED_BLOCKS_KEY = 'fixed-blocks'

/** 카드 탭 · 카드 만들기 화면이 넘기는 빈 고정 일정 목록 (렌더링마다 새 배열을 만들지 않으려고 하나를 같이 씁니다) */
export const NO_FIXED_BLOCKS: FixedBlock[] = []

/** 저장해 둔 고정 일정. 없거나 깨져 있으면 빈 배열. 분석 숫자(hooks/useAnalysisMaterial.ts)가 읽습니다. */
export function loadFixedBlocks(): FixedBlock[] {
  const saved = loadData<unknown>(FIXED_BLOCKS_KEY, [])
  return Array.isArray(saved) ? (saved as FixedBlock[]) : []
}

/**
 * 그 날짜(요일)에 있는 고정 일정을 시작 시각 순서로 돌려줍니다.
 *
 *   (2026-10-12 는 월요일) 학교(월~금 08:00~16:30), 학원(화·목 18:00~21:00)
 *   getFixedBlocksOnDate([학교, 학원], '2026-10-12') -> [학교]
 */
export function getFixedBlocksOnDate(blocks: FixedBlock[], dateKey: string): FixedBlock[] {
  const weekday = getWeekday(dateKey)
  return blocks
    .filter((block) => block.repeatDays.includes(weekday))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}
