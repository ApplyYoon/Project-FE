import { toDayMinutes } from '@/lib/planConflict'
import { getWeekday } from '@/lib/routines'
import { loadData, saveData } from '@/lib/storage'
import type { FixedBlock } from '@/types'

/**
 * 고정 일정 블록(학교·학원, 「4.3 카드」, #393)을 읽고 저장하는 함수들입니다.
 * 블록을 들고 있는 훅은 hooks/useFixedBlocks.ts, 입력 화면은 pages/FixedBlocksPage.tsx 입니다.
 * 카드와 겹치는지 보는 계산은 lib/scheduleCheck.ts 에 있습니다.
 */

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-fixed-blocks' 가 됩니다)
export const FIXED_BLOCKS_KEY = 'fixed-blocks'

export const FIXED_BLOCK_TITLE_MAX_LENGTH = 20

/** 저장해 둔 고정 일정. 없거나 깨져 있으면 빈 배열 */
export function loadFixedBlocks(): FixedBlock[] {
  const saved = loadData<unknown>(FIXED_BLOCKS_KEY, [])
  return Array.isArray(saved) ? (saved as FixedBlock[]) : []
}

export function saveFixedBlocks(blocks: FixedBlock[]): void {
  saveData(FIXED_BLOCKS_KEY, blocks)
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

/** 입력 폼에서 틀린 칸과 안내 문구 */
export type FixedBlockFormErrors = Partial<Record<'title' | 'repeatDays' | 'time', string>>

/**
 * 고정 일정 입력이 맞는지 봅니다. 빈 객체면 저장해도 됩니다.
 * 끝 시각은 시작보다 뒤여야 합니다. (하루는 새벽 4시에 시작하므로 23:00~01:00 도 됩니다)
 *
 *   { title: '', … }                                  -> { title: '무슨 일정인지 적어 주세요' }
 *   { repeatDays: [] , … }                            -> { repeatDays: '요일을 하나 이상 골라 주세요' }
 *   { startTime: '18:00', endTime: '17:00', … }       -> { time: '끝 시각은 시작보다 뒤여야 해요' }
 *   { title: '학원', repeatDays: [2], '18:00'~'21:00' } -> {}
 */
export function validateFixedBlock(
  values: Pick<FixedBlock, 'title' | 'repeatDays' | 'startTime' | 'endTime'>,
): FixedBlockFormErrors {
  const errors: FixedBlockFormErrors = {}
  if (values.title.trim() === '') errors.title = '무슨 일정인지 적어 주세요'
  if (values.repeatDays.length === 0) errors.repeatDays = '요일을 하나 이상 골라 주세요'

  const start = toDayMinutes(values.startTime)
  const end = toDayMinutes(values.endTime)
  if (start === null || end === null) {
    errors.time = '시작과 끝 시각을 정해 주세요'
  } else if (end <= start) {
    errors.time = '끝 시각은 시작보다 뒤여야 해요'
  }
  return errors
}
