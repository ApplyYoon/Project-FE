import { ApiError, api } from '@/lib/api'
import { FIXED_BLOCK_TITLE_MAX_LENGTH, loadFixedBlocks, saveFixedBlocks } from '@/lib/fixedBlocks'
import { loadData, saveData } from '@/lib/storage'
import { queryOptions } from '@tanstack/react-query'
import type { FixedBlock } from '@/types'

/**
 * 이 기기의 고정 일정(학교 · 학원)을 서버(BE `/api/v1/fixed-blocks`, docs/API.md 「고정 일정」)와 맞춥니다. (#516)
 * 카드(lib/cardSync.ts)와 같은 규칙입니다. 고정 일정은 작아서 서버와 주고받는 함수도 이 파일에 같이 둡니다.
 *
 *   - 저장하면 바뀐 것을 "보낼 목록" 에 적고 서버로 보냅니다. 못 보내면 다음에 앱을 열 때 다시 보냅니다.
 *   - 앱을 열 때 서버의 고정 일정을 받아, 다른 기기에서 만들거나 지운 것을 이 기기에도 반영합니다.
 *   - AI 하루 계획이 이 시간을 빼고 빈 시간에 카드를 넣으려고 서버에 둡니다.
 *   - 테스트 로그인은 서버를 쓰지 않습니다. (hooks/useFixedBlockSync.ts 가 진짜 로그인일 때만 부릅니다)
 */

/** 서버를 기다리는 최대 시간(밀리초) */
const REQUEST_TIMEOUT_MS = 10000

/** 서버가 주는 고정 일정 한 개 */
export interface ServerFixedBlock {
  id: string
  title: string
  repeatDays: number[]
  startTime: string
  endTime: string
  createdAt: number
}

function isServerFixedBlock(value: unknown): value is ServerFixedBlock {
  if (typeof value !== 'object' || value === null) return false
  const block = value as Record<string, unknown>
  return (
    typeof block.id === 'string' &&
    typeof block.title === 'string' &&
    Array.isArray(block.repeatDays) &&
    typeof block.startTime === 'string' &&
    typeof block.endTime === 'string'
  )
}

/** 서버로 보낼 본문. 이름은 20자까지, 요일은 겹치지 않게 작은 숫자부터 보냅니다. (서버 규칙) */
export function toServerFixedBlockBody(block: FixedBlock): Record<string, unknown> {
  return {
    title: block.title.trim().slice(0, FIXED_BLOCK_TITLE_MAX_LENGTH),
    repeatDays: [...new Set(block.repeatDays)].sort((a, b) => a - b),
    startTime: block.startTime,
    endTime: block.endTime,
  }
}

/** 서버의 고정 일정을 이 기기의 모양으로 바꿉니다. local 이 있으면 이 기기의 id 를 그대로 씁니다. */
export function fromServerFixedBlock(server: ServerFixedBlock, local?: FixedBlock): FixedBlock {
  return {
    id: local?.id ?? `fixed-s${server.id}`,
    serverId: server.id,
    title: server.title,
    repeatDays: server.repeatDays,
    startTime: server.startTime,
    endTime: server.endTime,
    createdAt: local?.createdAt ?? server.createdAt,
  }
}

/** 내 고정 일정 전부를 서버에서 받습니다. 실패하면 에러를 던집니다. */
export async function fetchServerFixedBlocks(): Promise<ServerFixedBlock[]> {
  const result = await api<unknown>('/fixed-blocks', {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return Array.isArray(result) ? result.filter(isServerFixedBlock) : []
}

/** 서버의 고정 일정 목록 쿼리 설정입니다. 앱을 열 때 한 번 받아 이 기기의 것과 맞춥니다. (hooks/useFixedBlockSync.ts) */
export function serverFixedBlocksQuery() {
  return queryOptions({
    queryKey: ['server-fixed-blocks'],
    queryFn: fetchServerFixedBlocks,
    // 앱을 쓰는 동안에는 이 기기에서 바꾼 것을 바로 보내므로, 자주 다시 받지 않습니다.
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// ── 보낼 목록 ── (실제 키는 'study-fixed-block-sync-pending')
export const FIXED_BLOCK_SYNC_KEY = 'fixed-block-sync-pending'

export interface PendingFixedBlockSync {
  /** 만들거나 바꿔서 올릴 것 (이 기기의 id) */
  upserts: string[]
  /** 서버에서도 지울 것 (서버 번호) */
  deletes: string[]
}

export function loadPendingFixedBlocks(): PendingFixedBlockSync {
  const saved = loadData<unknown>(FIXED_BLOCK_SYNC_KEY, null)
  if (typeof saved !== 'object' || saved === null) return { upserts: [], deletes: [] }
  const record = saved as Record<string, unknown>
  const toList = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return { upserts: toList(record.upserts), deletes: toList(record.deletes) }
}

function savePending(pending: PendingFixedBlockSync): void {
  saveData(FIXED_BLOCK_SYNC_KEY, {
    upserts: [...new Set(pending.upserts)],
    deletes: [...new Set(pending.deletes)],
  })
}

/** 서버 번호를 뺀 내용이 같은지 */
function isSameContent(a: FixedBlock, b: FixedBlock): boolean {
  return (
    JSON.stringify({ ...a, serverId: undefined }) === JSON.stringify({ ...b, serverId: undefined })
  )
}

/**
 * 바뀌기 전 · 뒤의 목록에서 서버에 보낼 것을 찾습니다. (카드의 diffCardChanges 와 같은 규칙)
 *
 *   prev [학교], next [학교, 학원]        -> { upserts: ['학원'], deletes: [] }
 *   prev [학교(서버 3)], next []          -> { upserts: [], deletes: ['3'] }
 */
export function diffFixedBlockChanges(
  prev: FixedBlock[],
  next: FixedBlock[],
): PendingFixedBlockSync {
  const upserts = next
    .filter((block) => {
      const before = prev.find((item) => item.id === block.id)
      return !before || !isSameContent(before, block)
    })
    .map((block) => block.id)
  const deletes = prev
    .filter((block) => block.serverId && !next.some((item) => item.id === block.id))
    .map((block) => block.serverId as string)
  return { upserts, deletes }
}

/**
 * 서버에서 받은 고정 일정으로 이 기기의 목록을 맞춥니다. (카드의 mergeServerCards 와 같은 규칙)
 *   - 서버 번호가 있는 것: 보낼 목록에 있으면 이 기기의 것, 아니면 서버의 것. 서버에 없으면 다른 기기에서 지운 것이라 뺍니다.
 *   - 서버 번호가 없는 것: 그대로 두고 올릴 목록에 더합니다.
 *   - 이 기기에 없는 서버의 것: 다른 기기에서 만든 것이라 더합니다. (이 기기에서 지우는 중인 것은 빼고)
 */
export function mergeServerFixedBlocks(
  local: FixedBlock[],
  server: ServerFixedBlock[],
  pending: PendingFixedBlockSync,
): { blocks: FixedBlock[]; toUpload: string[] } {
  const blocks: FixedBlock[] = []
  const toUpload: string[] = []
  for (const block of local) {
    if (!block.serverId) {
      blocks.push(block)
      toUpload.push(block.id)
      continue
    }
    const serverBlock = server.find((item) => item.id === block.serverId)
    if (pending.upserts.includes(block.id)) blocks.push(block)
    else if (serverBlock) blocks.push(fromServerFixedBlock(serverBlock, block))
  }
  for (const serverBlock of server) {
    const isLinked = local.some((block) => block.serverId === serverBlock.id)
    if (!isLinked && !pending.deletes.includes(serverBlock.id)) {
      blocks.push(fromServerFixedBlock(serverBlock))
    }
  }
  return { blocks, toUpload }
}

/** 이 기기에서 바꿨을 때 보낼 목록에 적습니다. */
export function markFixedBlockChanges(prev: FixedBlock[], next: FixedBlock[]): void {
  const pending = loadPendingFixedBlocks()
  const more = diffFixedBlockChanges(prev, next)
  savePending({
    upserts: [...pending.upserts, ...more.upserts],
    deletes: [...pending.deletes, ...more.deletes],
  })
}

/** 서버에서 받은 것을 이 기기에 반영하고, 아직 서버에 없는 것을 보낼 목록에 더합니다. */
export function applyServerFixedBlocks(server: ServerFixedBlock[]): void {
  const local = loadFixedBlocks()
  const pending = loadPendingFixedBlocks()
  const { blocks, toUpload } = mergeServerFixedBlocks(local, server, pending)
  if (JSON.stringify(blocks) !== JSON.stringify(local)) saveFixedBlocks(blocks, 'server')
  savePending({ ...pending, upserts: [...pending.upserts, ...toUpload] })
}

/** 서버가 "값이 틀렸다(400)" 고 하면 다시 보내도 같아서 목록에서 뺍니다. */
function isRejected(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400
}

/** 하나를 서버에 만들거나(POST) 바꿉니다(PATCH). 서버에서 사라졌으면(404) 다시 만듭니다. */
async function upload(block: FixedBlock): Promise<ServerFixedBlock> {
  const send = (path: string, method: 'POST' | 'PATCH') =>
    api<unknown>(path, {
      method,
      body: JSON.stringify(toServerFixedBlockBody(block)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  let result: unknown
  if (block.serverId) {
    try {
      result = await send(`/fixed-blocks/${encodeURIComponent(block.serverId)}`, 'PATCH')
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error
      result = await send('/fixed-blocks', 'POST')
    }
  } else {
    result = await send('/fixed-blocks', 'POST')
  }
  if (!isServerFixedBlock(result)) throw new Error('서버가 준 고정 일정의 모양이 달라요')
  return result
}

// 지금 보내는 중인지. 보내는 중에 또 부르면 끝난 뒤 한 번 더 보냅니다.
let isPushing = false
let pushAgain = false

/** 보낼 목록을 하나씩 서버로 보냅니다. 서버에 닿지 못하면 멈추고 남은 것은 다음에 보냅니다. */
export async function pushPendingFixedBlocks(): Promise<void> {
  if (isPushing) {
    pushAgain = true
    return
  }
  isPushing = true
  try {
    for (const blockId of loadPendingFixedBlocks().upserts) {
      const dropUpsert = () => {
        const pending = loadPendingFixedBlocks()
        savePending({ ...pending, upserts: pending.upserts.filter((id) => id !== blockId) })
      }
      const block = loadFixedBlocks().find((item) => item.id === blockId)
      if (!block) {
        dropUpsert()
        continue
      }
      try {
        const saved = await upload(block)
        const current = loadFixedBlocks().find((item) => item.id === blockId)
        if (current) {
          saveFixedBlocks(
            loadFixedBlocks().map((item) =>
              item.id === blockId ? { ...item, serverId: saved.id } : item,
            ),
            'server',
          )
        }
        // 보내는 사이에 또 고쳤으면 다음에 한 번 더 보냅니다.
        if (!current || isSameContent(current, block)) dropUpsert()
      } catch (error) {
        if (!isRejected(error)) return
        dropUpsert()
      }
    }
    for (const serverId of loadPendingFixedBlocks().deletes) {
      try {
        await api<unknown>(`/fixed-blocks/${encodeURIComponent(serverId)}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        // 이미 없으면(404) 지운 것으로 봅니다.
        if (!(error instanceof ApiError && (error.status === 404 || error.status === 400))) return
      }
      const pending = loadPendingFixedBlocks()
      savePending({ ...pending, deletes: pending.deletes.filter((id) => id !== serverId) })
    }
  } finally {
    isPushing = false
    if (pushAgain) {
      pushAgain = false
      void pushPendingFixedBlocks()
    }
  }
}
