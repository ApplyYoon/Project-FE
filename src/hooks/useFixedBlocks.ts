import { FIXED_BLOCKS_CHANGED_EVENT, loadFixedBlocks, saveFixedBlocks } from '@/lib/fixedBlocks'
import type { FixedBlock } from '@/types'
import { useEffect, useState } from 'react'

/**
 * 고정 일정 블록(학교·학원, #393)을 들고 있습니다.
 * 고칠 때는 저장소의 최신 목록을 고쳐서 바로 저장합니다(saveFixedBlocks). 저장하면 이벤트가 나가서,
 * 같은 목록을 들고 있는 다른 화면도 다시 읽고 서버로도 보냅니다. (hooks/useFixedBlockSync.ts, #516)
 *
 *   const { blocks, addBlock, deleteBlock } = useFixedBlocks()
 */
export function useFixedBlocks() {
  // 처음 한 번만 저장소에서 불러옵니다.
  const [blocks, setBlocks] = useState<FixedBlock[]>(loadFixedBlocks)

  // 다른 화면이나 서버 맞추기에서 저장되면 다시 읽습니다.
  useEffect(() => {
    function handleChanged() {
      setBlocks(loadFixedBlocks())
    }
    window.addEventListener(FIXED_BLOCKS_CHANGED_EVENT, handleChanged)
    // 화면을 떠날 때 듣기를 멈춥니다.
    return () => window.removeEventListener(FIXED_BLOCKS_CHANGED_EVENT, handleChanged)
  }, [])

  /** 새 고정 일정을 목록 맨 뒤에 붙입니다. */
  function addBlock(block: FixedBlock) {
    saveFixedBlocks([...loadFixedBlocks(), block])
  }

  /** 고정 일정을 지웁니다. */
  function deleteBlock(blockId: string) {
    saveFixedBlocks(loadFixedBlocks().filter((block) => block.id !== blockId))
  }

  return { blocks, addBlock, deleteBlock }
}
