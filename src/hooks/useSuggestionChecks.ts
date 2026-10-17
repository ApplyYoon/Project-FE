import { loadList, saveData } from '@/lib/storage'
import type { SuggestionCheck } from '@/types'
import { useEffect, useState } from 'react'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-suggestion-checks' 가 됩니다)
const STORAGE_KEY = 'suggestion-checks'

/**
 * 개선안을 날마다 지켰는지 적은 기록(이행 기록)을 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 * 같은 개선안 · 같은 날짜로 다시 저장하면 덮어씁니다. (잘못 눌렀을 때 고칠 수 있는 이유)
 *
 *   const { getCheck, saveCheck } = useSuggestionChecks()
 *   const check = getCheck('suggestion-1', '2026-09-28')   // 아직 안 적었으면 undefined
 *
 * 이행률을 낼 때는 checks 를 그 개선안 것만 골라서 lib/suggestionRate.ts 의 getSuggestionRate 에 넘기면 됩니다.
 */
export function useSuggestionChecks() {
  const [checks, setChecks] = useState<SuggestionCheck[]>(() =>
    loadList<SuggestionCheck>(STORAGE_KEY),
  )

  useEffect(() => {
    saveData(STORAGE_KEY, checks)
  }, [checks])

  /** 그 개선안의 그 날짜 기록을 돌려줍니다. 아직 안 적었으면 undefined 입니다. */
  function getCheck(suggestionId: string, date: string): SuggestionCheck | undefined {
    return checks.find((check) => check.suggestionId === suggestionId && check.date === date)
  }

  /** 기록을 저장합니다. 같은 개선안 · 같은 날짜 기록이 이미 있으면 빼고 새 것으로 바꿉니다. */
  function saveCheck(next: SuggestionCheck) {
    setChecks((prev) => [
      ...prev.filter(
        (check) => !(check.suggestionId === next.suggestionId && check.date === next.date),
      ),
      next,
    ])
  }

  return { checks, getCheck, saveCheck }
}
