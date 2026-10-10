import { mockSuggestions } from '@/lib/mock'
import { loadList, saveData } from '@/lib/storage'
import type { Suggestion } from '@/types'
import { useEffect, useState } from 'react'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-suggestions' 가 됩니다)
const STORAGE_KEY = 'suggestions'

// 동시에 도전할 수 있는 개선안은 최대 2개입니다.
const MAX_ACTIVE_COUNT = 2

/** 오늘 날짜를 'YYYY-MM-DD' 문자열로 돌려줍니다. */
function todayKey(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 개선안 목록을 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 * 새로고침해도 도전 중인 개선안이 유지되고, 처음 들어온 사람은 예시 개선안 3개로 시작합니다.
 *
 *   const { suggestions, activeCount, startChallenge } = useSuggestions()
 */
export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() =>
    loadList(STORAGE_KEY, mockSuggestions),
  )

  useEffect(() => {
    saveData(STORAGE_KEY, suggestions)
  }, [suggestions])

  const activeCount = suggestions.filter((suggestion) => suggestion.status === 'active').length

  /**
   * 개선안 하나를 골라 도전을 시작합니다. 이미 2개를 도전 중이면 그대로 두고 false 를 돌려줍니다.
   */
  function startChallenge(id: string, days: number): boolean {
    if (activeCount >= MAX_ACTIVE_COUNT) return false

    setSuggestions((prev) =>
      prev.map((suggestion) =>
        suggestion.id === id
          ? { ...suggestion, status: 'active', startDate: todayKey(), days }
          : suggestion,
      ),
    )
    return true
  }

  /**
   * 끝난 실험의 기간을 늘립니다. (결과가 "애매" 일 때 "1주 더 해보기", #93)
   * 시작일은 그대로 두고 기간(days)만 extraDays 만큼 늘려서, 지금까지의 이행 기록과 이어서 셉니다.
   */
  function extendChallenge(id: string, extraDays: number) {
    setSuggestions((prev) =>
      prev.map((suggestion) =>
        suggestion.id === id && suggestion.days !== undefined
          ? { ...suggestion, days: suggestion.days + extraDays }
          : suggestion,
      ),
    )
  }

  /**
   * 도전을 마무리합니다. (#93)
   *  - done: 효과를 확인하고 나 사용설명서에 올렸을 때
   *  - dropped: 효과가 없어서 다른 방법을 고르러 갈 때
   * 마무리한 개선안은 더 이상 "도전 중" 이 아니라서 진행 카드와 결과 카드에서 빠집니다.
   */
  function finishChallenge(id: string, status: 'done' | 'dropped') {
    setSuggestions((prev) =>
      prev.map((suggestion) => (suggestion.id === id ? { ...suggestion, status } : suggestion)),
    )
  }

  return {
    suggestions,
    activeCount,
    maxActiveCount: MAX_ACTIVE_COUNT,
    startChallenge,
    extendChallenge,
    finishChallenge,
  }
}
