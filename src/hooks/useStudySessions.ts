import { loadData, saveData } from '@/lib/storage'
import type { StudySession } from '@/types'
import { useEffect, useState } from 'react'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-sessions' 가 됩니다)
const STORAGE_KEY = 'sessions'

/**
 * 타이머로 끝낸 기록을 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 * 새로고침해도 기록이 남아 있고, 처음 들어온 사람은 빈 목록으로 시작합니다.
 *
 *   const { sessions, allSessions, addSession } = useStudySessions()
 *
 * - sessions: 공부 기록만. 순공 · 달성률 같은 계산에는 이것을 씁니다.
 * - allSessions: 공부 기록 + 노는 기록. 계획별 실제 시간(`32 / 50분`)처럼 노는 기록도 필요한 곳에서만 씁니다. (#238)
 */
export function useStudySessions() {
  // 저장소에는 공부 기록과 노는 기록이 같이 들어 있습니다.
  const [allSessions, setAllSessions] = useState<StudySession[]>(() => loadData(STORAGE_KEY, []))

  useEffect(() => {
    saveData(STORAGE_KEY, allSessions)
  }, [allSessions])

  // 노는 기록(kind 가 'play')을 뺀 공부 기록입니다.
  const sessions = allSessions.filter((session) => session.kind !== 'play')

  /** 새 기록을 목록 맨 뒤에 붙입니다. (공부 기록, 노는 기록 모두) */
  function addSession(session: StudySession) {
    setAllSessions((prev) => [...prev, session])
  }

  return { sessions, allSessions, addSession }
}
