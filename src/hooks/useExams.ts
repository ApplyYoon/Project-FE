import { isExam } from '@/lib/exams'
import { loadData, saveData } from '@/lib/storage'
import type { Exam } from '@/types'
import { useEffect, useState } from 'react'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-exams' 가 됩니다)
// "모든 기록 지우기" 가 이 키도 지웁니다. 이름을 바꾸면 src/lib/myData.ts 도 같이 바꾸세요.
const STORAGE_KEY = 'exams'

/** 저장소에서 시험 목록을 불러옵니다. 모양이 깨진 항목은 버립니다. */
function loadExams(): Exam[] {
  const saved = loadData<unknown>(STORAGE_KEY, [])
  return Array.isArray(saved) ? saved.filter(isExam) : []
}

/**
 * 시험 목록을 들고 있고, 바뀔 때마다 localStorage 에 저장합니다. (#80)
 * 새로고침해도 시험이 남아 있고, 처음 들어온 사람은 빈 목록으로 시작합니다.
 *
 *   const { exams, addExam, updateExam, deleteExam } = useExams()
 */
export function useExams() {
  const [exams, setExams] = useState<Exam[]>(loadExams)

  // 시험이 바뀔 때마다 저장합니다.
  useEffect(() => {
    saveData(STORAGE_KEY, exams)
  }, [exams])

  /** 새 시험을 목록 맨 뒤에 붙입니다. */
  function addExam(exam: Exam) {
    setExams((prev) => [...prev, exam])
  }

  /** 같은 id 의 시험을 새 내용으로 바꿉니다. (나머지는 그대로) */
  function updateExam(updated: Exam) {
    setExams((prev) => prev.map((exam) => (exam.id === updated.id ? updated : exam)))
  }

  /** 그 시험을 지웁니다. */
  function deleteExam(examId: string) {
    setExams((prev) => prev.filter((exam) => exam.id !== examId))
  }

  return { exams, addExam, updateExam, deleteExam }
}
