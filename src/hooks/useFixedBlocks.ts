import { loadFixedBlocks, saveFixedBlocks } from '@/lib/fixedBlocks'
import type { FixedBlock } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 고정 일정 블록(학교·학원, #393)을 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 *
 *   const { blocks, addBlock, deleteBlock } = useFixedBlocks()
 */
export function useFixedBlocks() {
  // 처음 한 번만 저장소에서 불러옵니다.
  const [blocks, setBlocks] = useState<FixedBlock[]>(loadFixedBlocks)

  // 블록이 바뀔 때마다 저장합니다.
  useEffect(() => {
    saveFixedBlocks(blocks)
  }, [blocks])

  /** 새 고정 일정을 목록 맨 뒤에 붙입니다. */
  function addBlock(block: FixedBlock) {
    setBlocks((prev) => [...prev, block])
  }

  /** 고정 일정을 지웁니다. */
  function deleteBlock(blockId: string) {
    setBlocks((prev) => prev.filter((block) => block.id !== blockId))
  }

  return { blocks, addBlock, deleteBlock }
}
