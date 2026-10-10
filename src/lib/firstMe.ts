import { getDaysUntil } from '@/lib/exams'

/**
 * 홈의 "처음의 나" 카드에 보여줄 내용입니다. (#243)
 * 온보딩에서 내가 직접 적은 시험 날짜와 "공부하는 이유" 를 꺼내 옵니다.
 */
export interface FirstMe {
  /** 준비하는 시험 이름. 안 적었으면 '시험' */
  examName: string
  /** 시험까지 남은 날 (오늘이면 0). 시험 날짜가 없거나 이미 지났으면 null */
  daysUntilExam: number | null
  /** 온보딩에서 적은 "공부하는 이유". 안 적었으면 빈 글자 */
  reason: string
  /** 온보딩 설문을 끝낸 적이 있는지 (없으면 설문으로 가는 버튼을 보여줍니다) */
  hasAnswers: boolean
}

/** 값이 글자면 앞뒤 빈칸을 뗀 글자를, 아니면 빈 글자를 돌려줍니다. */
function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 저장해 둔 온보딩 답(answers)에서 "처음의 나" 카드에 쓸 값을 꺼냅니다.
 * React 를 쓰지 않는 순수 함수라서 같은 입력이면 항상 같은 결과가 나옵니다.
 *
 * - answers: loadData('onboarding-answers', null) 로 읽은 값. 설문을 안 했으면 null 입니다.
 *   저장소에서 꺼낸 값은 모양이 깨져 있을 수 있어서 unknown 으로 받고 하나씩 확인합니다.
 * - today: 오늘 날짜 (D-day 계산에 씁니다)
 *
 * ■ 예시 (today = 2026-10-10)
 *   { targetExam: '수능', targetExamDate: '2026-11-18', motivationReason: '하고 싶은 일을 하려고' }
 *     -> { examName: '수능', daysUntilExam: 39, reason: '하고 싶은 일을 하려고', hasAnswers: true }
 *   { targetExamDate: '2026-10-01' }  (이미 지난 시험)
 *     -> { examName: '시험', daysUntilExam: null, reason: '', hasAnswers: true }
 *   null  (설문을 안 함)
 *     -> { examName: '시험', daysUntilExam: null, reason: '', hasAnswers: false }
 */
export function getFirstMe(answers: unknown, today: Date): FirstMe {
  if (typeof answers !== 'object' || answers === null) {
    return { examName: '시험', daysUntilExam: null, reason: '', hasAnswers: false }
  }
  const saved = answers as Record<string, unknown>

  // 날짜는 'YYYY-MM-DD' 모양일 때만 계산합니다. (다른 글자가 들어 있으면 D-day 가 NaN 이 됩니다)
  const examDate = toText(saved.targetExamDate)
  let daysUntilExam: number | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    const days = getDaysUntil(examDate, today)
    // 이미 지난 시험은 "남은 날" 이 없으므로 보여주지 않습니다.
    if (days >= 0) daysUntilExam = days
  }

  return {
    examName: toText(saved.targetExam) || '시험',
    daysUntilExam,
    reason: toText(saved.motivationReason),
    hasAnswers: true,
  }
}
