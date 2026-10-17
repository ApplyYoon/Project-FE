/**
 * 카드(#379)를 저장소에서 불러오고, 옛 계획·루틴을 카드로 옮기는 함수들입니다.
 * React 없이 돌아가는 함수라서 lib/ 에 둡니다. 카드를 들고 고치는 훅은 hooks/useCards.ts 입니다.
 *
 * ■ 옮기기 규칙 (처음 한 번만. 'cards' 가 저장돼 있으면 다시 옮기지 않습니다)
 *  - 옛 계획(study-plans) 하나 → 1회성 카드 하나. 제목 = content, 체크리스트 = [content] 1개
 *  - 옛 루틴(study-routines) 하나 → 반복 카드 하나. 요일은 repeatDays 로
 *  - 루틴이 날마다 만들어 둔 계획은 옮기지 않습니다. 반복 카드 하나가 그 일을 대신하기 때문입니다. (날마다 복사하지 않음)
 *    단, 루틴을 이미 지웠으면 그 계획은 1회성 카드로 옮깁니다.
 *  - 노는 계획·노는 루틴(kind 'play')은 옮기지 않습니다. 카드는 자습·인강만 있고, 놀기는 따로 다룹니다. (기획서 4.4 놀기 타이머)
 *  - 옛 키는 지우지 않습니다. 옛 화면(계획 탭)이 아직 그 키를 쓰기 때문입니다.
 */
import { loadRoutines } from '@/lib/routines'
import { loadData, loadRecord, saveData } from '@/lib/storage'
import type { Card, Routine, StudyPlan } from '@/types'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-cards' 가 됩니다)
export const CARDS_KEY = 'cards'
// 옛 계획의 저장 이름 (hooks/usePlans.ts 와 같은 값)
const PLANS_KEY = 'plans'

/** 알림의 기본 문구 (기획서 4.3: 알림 기본값은 "시작 정각 · 메시지 · 기본 문구") */
export const DEFAULT_ALERT_TEXT = '카드를 시작할 시간이에요'

/** 옛 계획·루틴에 공통으로 있는 칸 */
type OldPlanLike = Pick<StudyPlan, 'id' | 'content' | 'targetMinutes' | 'startTime'>

/**
 * 옛 계획·루틴 하나에서 카드의 "기본값 칸" 들을 채웁니다. 날짜·요일은 부르는 쪽이 채웁니다.
 * 체크리스트 항목의 id 는 '<카드 id>-1' 입니다. (옮길 때마다 같은 id 가 나오게)
 */
function toCardBase(old: OldPlanLike): Omit<Card, 'date' | 'repeatDays'> {
  return {
    id: old.id,
    title: old.content,
    startTime: old.startTime ?? null,
    durationMinutes: old.targetMinutes,
    checklist: [{ id: `${old.id}-1`, text: old.content }],
    goalId: null,
    priority: 'flexible',
    type: 'self',
    // 체크리스트가 1개라서 예상 달성 개수도 1개입니다.
    expectedDone: 1,
    expectedDoneReason: null,
    expectedFailCauses: [],
    alertMethod: 'message',
    alertMinutesBefore: 0,
    alertText: DEFAULT_ALERT_TEXT,
    planningMs: 0,
    postponeCount: 0,
  }
}

/**
 * 옛 계획 하나를 1회성 카드로 바꿉니다.
 * 옛 계획의 "다 했어요"(done)는 언제 했는지 몰라서 doneAt 으로 옮기지 않습니다. (공부 기록은 따로 남아 있습니다)
 *
 *   planToCard({ id: 'p1', date: '2026-10-17', subjectId: 's1', content: '수학 3단원', targetMinutes: 50, done: false, startTime: '19:00' })
 *   -> { id: 'p1', title: '수학 3단원', date: '2026-10-17', repeatDays: null, startTime: '19:00', durationMinutes: 50,
 *        checklist: [{ id: 'p1-1', text: '수학 3단원' }], goalId: null, priority: 'flexible', type: 'self',
 *        expectedDone: 1, expectedDoneReason: null, expectedFailCauses: [],
 *        alertMethod: 'message', alertMinutesBefore: 0, alertText: '카드를 시작할 시간이에요', planningMs: 0, postponeCount: 0 }
 */
export function planToCard(plan: StudyPlan): Card {
  return { ...toCardBase(plan), date: plan.date, repeatDays: null }
}

/**
 * 옛 루틴 하나를 반복 카드로 바꿉니다.
 *
 *   routineToCard({ id: 'r1', weekdays: [1, 3, 5], kind: 'study', subjectId: 's1', content: '영어 단어', targetMinutes: 30, startTime: '07:00' })
 *   -> { id: 'r1', title: '영어 단어', date: null, repeatDays: [1, 3, 5], startTime: '07:00', durationMinutes: 30,
 *        checklist: [{ id: 'r1-1', text: '영어 단어' }], ...나머지는 planToCard 와 같은 기본값 }
 */
export function routineToCard(routine: Routine): Card {
  return { ...toCardBase(routine), date: null, repeatDays: [...routine.weekdays] }
}

/**
 * 옛 계획(날짜별)과 루틴을 모두 카드로 바꿉니다. 루틴 카드가 먼저, 그다음 계획 카드가 날짜 순서로 옵니다.
 * 위 "옮기기 규칙" 을 따릅니다.
 *
 *   migrateToCards(
 *     { '2026-10-16': [수학 계획(p1)], '2026-10-17': [루틴 r1 이 만든 계획(p2), 놀기 계획(p3)] },
 *     [루틴 r1(월·수·금 영어 단어)],
 *   )
 *   -> [r1 반복 카드, p1 1회성 카드]   (p2 는 r1 카드가 대신하고, p3 는 노는 계획이라 뺍니다)
 */
export function migrateToCards(
  plansByDate: Record<string, StudyPlan[]>,
  routines: Routine[],
): Card[] {
  const studyRoutines = routines.filter((routine) => routine.kind !== 'play')
  const routineIds = new Set(studyRoutines.map((routine) => routine.id))

  const cards: Card[] = studyRoutines.map(routineToCard)

  // 'YYYY-MM-DD' 는 글자 순서가 날짜 순서와 같아서 그대로 정렬합니다.
  const dates = Object.keys(plansByDate).sort()
  for (const date of dates) {
    const plans = plansByDate[date]
    // 저장된 값이 깨져서 배열이 아니면 그 날은 건너뜁니다.
    if (!Array.isArray(plans)) continue

    for (const plan of plans) {
      if (plan.kind === 'play') continue
      // 남아 있는 루틴이 만든 계획은 반복 카드가 대신합니다.
      if (plan.routineId !== undefined && routineIds.has(plan.routineId)) continue
      cards.push(planToCard(plan))
    }
  }
  return cards
}

/**
 * 저장된 카드를 불러옵니다.
 * 아직 카드를 한 번도 저장한 적이 없으면, 옛 계획·루틴을 카드로 옮겨서 저장한 뒤 돌려줍니다. (처음 한 번만)
 * 저장된 값이 배열이 아니면(깨졌으면) 빈 목록입니다.
 */
export function loadCards(): Card[] {
  // null: "아직 저장한 적 없음" 을 알아보려고 쓰는 기본값입니다. (빈 배열 [] 은 "카드를 다 지웠음" 이라 다릅니다)
  const saved = loadData<unknown>(CARDS_KEY, null)
  if (saved !== null) return Array.isArray(saved) ? (saved as Card[]) : []

  const cards = migrateToCards(loadRecord<StudyPlan[]>(PLANS_KEY), loadRoutines())
  saveData(CARDS_KEY, cards)
  return cards
}
