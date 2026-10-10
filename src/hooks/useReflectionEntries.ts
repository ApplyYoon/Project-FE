import { loadData, saveData } from '@/lib/storage'
import type { ReflectionEntry } from '@/types'
import { useEffect, useState } from 'react'

/** 날짜('YYYY-MM-DD')마다 그날의 성찰 답을 하나씩 모아 둔 모양입니다. */
type EntriesByDate = Record<string, ReflectionEntry>

// 저장소에 넣는 이름입니다. 설정 화면의 "일기만 지우기" 가 이 키도 같이 지웁니다. (src/lib/myData.ts 참고)
const STORAGE_KEY = 'reflection-entries'

/**
 * 성찰 일기 답을 날짜별로 하나씩 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 * 같은 날 다시 쓰면 그 날의 답을 덮어씁니다.
 *
 *   const { allEntries, getEntry, saveEntry } = useReflectionEntries()
 *   const todayEntry = getEntry('2026-09-28')
 */
export function useReflectionEntries() {
  const [entriesByDate, setEntriesByDate] = useState<EntriesByDate>(() => loadData(STORAGE_KEY, {}))

  useEffect(() => {
    saveData(STORAGE_KEY, entriesByDate)
  }, [entriesByDate])

  /** 그 날짜의 성찰 답을 돌려줍니다. 아직 안 썼으면 undefined 입니다. */
  function getEntry(date: string): ReflectionEntry | undefined {
    return entriesByDate[date]
  }

  /** 그 날짜의 성찰 답을 저장합니다. 이미 있으면 덮어씁니다. */
  function saveEntry(entry: ReflectionEntry) {
    setEntriesByDate((prev) => ({ ...prev, [entry.date]: entry }))
  }

  const allEntries: ReflectionEntry[] = Object.values(entriesByDate)

  return { allEntries, getEntry, saveEntry }
}
