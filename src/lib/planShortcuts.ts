import { moveDateKey } from '@/lib/date'
import type { StudyPlan } from '@/types'

/**
 * 계획을 "한 번 눌러서" 넣는 데 쓰는 순수 함수들입니다. (#235)
 * React 를 쓰지 않아서 같은 입력이면 항상 같은 결과가 나옵니다.
 */

/** 자주 쓰는 계획을 찾을 때 며칠 전까지 볼지 */
export const FREQUENT_LOOKBACK_DAYS = 14
/** 자주 쓰는 계획을 몇 개까지 보여줄지 */
export const FREQUENT_MAX_COUNT = 5

/** 자주 쓰는 계획 하나. 과목 · 할 일 · 시간이 모두 같은 계획을 한 묶음으로 셉니다. */
export interface FrequentPlan {
  subjectId: string
  content: string
  targetMinutes: number
  /** 최근 14일 동안 이 조합을 몇 번 썼는지 */
  count: number
}

/**
 * 다른 날의 계획을 targetDate 로 가져올 때 쓸 새 계획 목록을 만듭니다.
 * 원래 날의 계획은 바꾸지 않고, 새 id · 새 날짜 · "아직 안 함" 으로 복사합니다.
 *
 * - validSubjectIds: 지금 남아 있는 과목의 id 목록. 지워진 과목의 계획은 가져오지 않습니다.
 * - now: id 를 만드는 데 쓰는 지금 시각(Date.now()). 한 번에 여러 개를 만들어도 겹치지 않게 순서 번호를 붙입니다.
 *
 * 예) 어제 계획이 [수학 60분(완료), 영어 30분(완료), 한국사 40분(과목이 지워짐)] 이면
 *     copyPlans(어제 계획, '2026-10-10', ['math', 'english'], 1000)
 *     -> [ { id: 'plan-1000-0', date: '2026-10-10', 수학 60분, done: false },
 *          { id: 'plan-1000-1', date: '2026-10-10', 영어 30분, done: false } ]
 */
export function copyPlans(
  sourcePlans: StudyPlan[],
  targetDate: string,
  validSubjectIds: string[],
  now: number,
): StudyPlan[] {
  return sourcePlans
    .filter((plan) => validSubjectIds.includes(plan.subjectId))
    .map((plan, index) => ({
      id: `plan-${now}-${index}`,
      date: targetDate,
      subjectId: plan.subjectId,
      content: plan.content,
      targetMinutes: plan.targetMinutes,
      done: false,
    }))
}

/**
 * 최근 14일(오늘 포함)의 계획에서 자주 쓴 조합을 많이 쓴 순으로 5개까지 고릅니다.
 *
 * ■ 규칙
 * 1. 과목 · 할 일 · 목표 시간이 모두 같아야 같은 조합입니다. ("단어 50개 30분" 과 "단어 50개 40분" 은 다른 조합)
 * 2. todayKey 에서 13일 전 ~ todayKey 사이 날짜의 계획만 셉니다. 앞으로의 계획은 세지 않습니다.
 * 3. 많이 쓴 순서. 횟수가 같으면 더 최근에 쓴 조합이 앞에 옵니다.
 * 4. 지워진 과목(validSubjectIds 에 없는 과목)의 계획은 뺍니다.
 *
 * ■ 예시 (todayKey = '2026-10-10')
 *   10/8 수학 문제집 60분, 10/9 수학 문제집 60분, 10/9 영어 단어 30분, 9/20 국어 비문학 50분(14일보다 전)
 *   -> [ { 수학, 문제집, 60, count: 2 }, { 영어, 단어, 30, count: 1 } ]
 */
export function getFrequentPlans(
  allPlans: StudyPlan[],
  todayKey: string,
  validSubjectIds: string[],
): FrequentPlan[] {
  const fromKey = moveDateKey(todayKey, -(FREQUENT_LOOKBACK_DAYS - 1))

  // 조합마다 몇 번 썼는지, 마지막으로 쓴 날짜가 언제인지 모읍니다.
  const groups = new Map<string, FrequentPlan & { lastDate: string }>()
  for (const plan of allPlans) {
    // 'YYYY-MM-DD' 는 글자로 비교해도 날짜 순서와 같습니다.
    if (plan.date < fromKey || plan.date > todayKey) continue
    if (!validSubjectIds.includes(plan.subjectId)) continue

    // 과목 · 내용 · 시간을 이어 붙인 글자를 "같은 조합인지" 구분하는 이름표로 씁니다.
    const key = `${plan.subjectId}|${plan.content}|${plan.targetMinutes}`
    const group = groups.get(key)
    if (group) {
      group.count += 1
      if (plan.date > group.lastDate) group.lastDate = plan.date
    } else {
      groups.set(key, {
        subjectId: plan.subjectId,
        content: plan.content,
        targetMinutes: plan.targetMinutes,
        count: 1,
        lastDate: plan.date,
      })
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1))
    .slice(0, FREQUENT_MAX_COUNT)
    .map(({ subjectId, content, targetMinutes, count }) => ({
      subjectId,
      content,
      targetMinutes,
      count,
    }))
}
