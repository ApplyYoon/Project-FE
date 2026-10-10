import { loadData, saveData } from '@/lib/storage'
import type { DiaryEntry } from '@/types'
import { useEffect, useState } from 'react'

/** 날짜('YYYY-MM-DD')마다 그날의 일기를 하나씩 모아 둔 모양입니다. */
type EntriesByDate = Record<string, DiaryEntry>

// 저장소에 넣는 이름입니다. 설정 화면의 "일기만 지우기" 가 이 키를 지우므로 이름을 바꾸면 안 됩니다. (src/lib/myData.ts 참고)
const STORAGE_KEY = 'diary'

/**
 * 일기를 날짜별로 하나씩 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 * 같은 날 다시 쓰면 그 날의 일기를 덮어씁니다.
 *
 *   const { allEntries, getEntry, saveEntry } = useDiaryEntries()
 *   const todayEntry = getEntry('2026-09-28')
 */
export function useDiaryEntries() {
  // 처음 한 번만 저장소에서 불러옵니다. 저장된 게 없으면 빈 객체({})라서 쓴 일기가 없는 상태입니다.
  const [entriesByDate, setEntriesByDate] = useState<EntriesByDate>(() => loadData(STORAGE_KEY, {}))

  // 일기가 바뀔 때마다 저장합니다.
  useEffect(() => {
    saveData(STORAGE_KEY, entriesByDate)
  }, [entriesByDate])

  /** 그 날짜의 일기를 돌려줍니다. 아직 안 썼으면 undefined 입니다. */
  function getEntry(date: string): DiaryEntry | undefined {
    return entriesByDate[date]
  }

  /** 그 날짜의 일기를 저장합니다. 이미 있으면 덮어씁니다. */
  function saveEntry(entry: DiaryEntry) {
    setEntriesByDate((prev) => ({ ...prev, [entry.date]: entry }))
  }

  /** 모든 일기를 최신 날짜가 먼저 오도록 정렬해서 돌려줍니다. (지난 일기 목록에 씁니다) */
  const allEntries: DiaryEntry[] = Object.values(entriesByDate).sort((a, b) =>
    b.date.localeCompare(a.date),
  )

  return { allEntries, getEntry, saveEntry }
}
