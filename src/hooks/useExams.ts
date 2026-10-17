import { EXAMS_STORAGE_KEY, loadExams } from '@/lib/exams'
import { saveData } from '@/lib/storage'
import type { Exam } from '@/types'
import { useEffect, useState } from 'react'

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
    saveData(EXAMS_STORAGE_KEY, exams)
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
