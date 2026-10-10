import { loadData, saveData } from '@/lib/storage'
import type { StudySession } from '@/types'
import { useEffect, useState } from 'react'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-sessions' 가 됩니다)
const STORAGE_KEY = 'sessions'

/**
 * 타이머로 끝낸 공부 기록을 들고 있고, 바뀔 때마다 localStorage 에 저장합니다.
 * 새로고침해도 기록이 남아 있고, 처음 들어온 사람은 빈 목록으로 시작합니다.
 *
 *   const { sessions, addSession } = useStudySessions()
 */
export function useStudySessions() {
  const [sessions, setSessions] = useState<StudySession[]>(() => loadData(STORAGE_KEY, []))

  useEffect(() => {
    saveData(STORAGE_KEY, sessions)
  }, [sessions])

  /** 새 공부 기록을 목록 맨 뒤에 붙입니다. */
  function addSession(session: StudySession) {
    setSessions((prev) => [...prev, session])
  }

  return { sessions, addSession }
}
