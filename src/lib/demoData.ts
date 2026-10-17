import { loadAiMessages, saveAiMessages } from '@/lib/aiMessages'
import { getTodayKey } from '@/lib/date'
import { DEMO_ID_PREFIX, buildDemoOnboarding, buildDemoPersona } from '@/lib/demoPersona'
import { mockAiMessages } from '@/lib/mock'
import { loadData, removeData, saveData } from '@/lib/storage'
import type { StudySession } from '@/types'

/**
 * 발표 시연용 "가상 사용자 28일" 을 저장소에 넣고 빼는 함수입니다. (FE#418)
 * 어떤 사람 · 어떤 하루하루인지는 lib/demoPersona.ts 가 정합니다.
 * 설정 화면의 '시연용 가상 데이터' 카드(설정 주소 끝에 ?demo=on)에서 부릅니다.
 *
 * ■ 넣을 때
 *   - 카드 · 세션 · 목표 같은 목록은 내 기록 뒤에 붙입니다. 가상 데이터의 id 는 모두 'demo-' 로 시작합니다.
 *   - 체크인 · 관리 단계 기록처럼 날짜별로 저장하는 값은, 내 기록이 없는 날짜에만 넣습니다.
 *   - 온보딩 답 · 심리검사처럼 하나뿐인 값은, 비어 있을 때만 넣습니다. (온보딩을 끝낸 사람의 답은 건드리지 않음)
 *   - 무엇을 넣었는지 'demo-manifest' 에 적어 둡니다.
 * ■ 뺄 때
 *   - 'demo-' 로 시작하는 것과, 'demo-manifest' 에 적힌 것만 지웁니다. 내가 직접 만든 기록은 남습니다.
 */

const MANIFEST_KEY = 'demo-manifest'

/** 무엇을 넣었는지 적어 두는 표. 뺄 때 이 표에 적힌 것만 지웁니다. */
interface DemoManifest {
  /** 넣은 시각 */
  seededAt: number
  /** 비어 있어서 통째로 넣은 키들 (온보딩 답 등) */
  setKeys: string[]
  /** 날짜별 저장값에 넣은 날짜들 */
  checkinDates: string[]
  careStageDates: string[]
  restDates: string[]
  /** 지난 주들의 예측 · 회고를 넣은 주 (그 주의 월요일 날짜) */
  predictionWeeks: string[]
  reviewWeeks: string[]
  /** 인사이트 반응을 넣은 인사이트 id */
  insightIds: string[]
}

/** id 가 있는 목록에 가상 항목을 붙여 저장합니다. */
function appendList<T>(key: string, items: T[]): void {
  saveData(key, [...loadData<T[]>(key, []), ...items])
}

/** id 가 'demo-' 로 시작하는 항목을 목록에서 뺍니다. idOf 로 어느 칸을 볼지 정합니다. */
function removeDemoItems<T>(key: string, idOf: (item: T) => string): void {
  const items = loadData<unknown>(key, [])
  if (!Array.isArray(items)) return
  saveData(
    key,
    (items as T[]).filter((item) => {
      const id = idOf(item)
      return typeof id !== 'string' || !id.startsWith(DEMO_ID_PREFIX)
    }),
  )
}

/** 시연용 가상 데이터가 들어 있는지 (설정 카드가 '지우기' 를 보여 줄지 정합니다) */
export function isDemoSeeded(): boolean {
  return loadData<unknown>(MANIFEST_KEY, null) !== null
}

/**
 * 가상 사용자 28일을 넣습니다. 이미 들어 있으면 먼저 빼고 다시 넣습니다. (두 번 눌러도 두 배가 되지 않게)
 * 화면들은 저장소를 처음 열 때만 읽으므로, 부른 뒤 새로고침해야 보입니다.
 */
export function addDemoData(): void {
  removeDemoData()

  const now = Date.now()
  const todayKey = getTodayKey()
  const persona = buildDemoPersona(todayKey, now)
  const manifest: DemoManifest = {
    seededAt: now,
    setKeys: [],
    checkinDates: [],
    careStageDates: [],
    restDates: [],
    predictionWeeks: [],
    reviewWeeks: [],
    insightIds: [],
  }

  // 1) id 가 있는 목록 — 내 기록 뒤에 붙입니다.
  appendList('cards', persona.cards)
  appendList('sessions', persona.sessions)
  appendList('goals', persona.goals)
  appendList('fixed-blocks', persona.fixedBlocks)
  appendList('card-day-marks', persona.marks)
  appendList('experiments', persona.experiments)
  appendList('manual-items', persona.manualItems)

  // 홈 화면이 아직 읽는 옛 계획 (날짜 → 계획 목록)
  const plansByDate = loadData<Record<string, unknown[]>>('plans', {})
  for (const [dateKey, plans] of Object.entries(persona.plansByDate)) {
    plansByDate[dateKey] = [...(plansByDate[dateKey] ?? []), ...plans]
  }
  saveData('plans', plansByDate)

  // 2) id 가 없는 목록 — 내 기록과 날짜가 겹치지 않는 것만 넣고, 무엇을 넣었는지 적어 둡니다.
  const restDays = loadData<{ date: string }[]>('rest-days', [])
  const newRestDays = persona.restDays.filter(
    (day) => !restDays.some((saved) => saved.date === day.date),
  )
  saveData('rest-days', [...restDays, ...newRestDays])
  manifest.restDates = newRestDays.map((day) => day.date)

  const predictions = loadData<{ weekStart: string }[]>('predictions', [])
  const newPredictions = persona.predictions.filter(
    (item) => !predictions.some((saved) => saved.weekStart === item.weekStart),
  )
  saveData('predictions', [...predictions, ...newPredictions])
  manifest.predictionWeeks = newPredictions.map((item) => item.weekStart)

  const reviews = loadData<{ weekStart: string }[]>('weekly-reviews', [])
  const newReviews = persona.weeklyReviews.filter(
    (item) => !reviews.some((saved) => saved.weekStart === item.weekStart),
  )
  saveData('weekly-reviews', [...reviews, ...newReviews])
  manifest.reviewWeeks = newReviews.map((item) => item.weekStart)

  // 3) 날짜별 저장값 — 내 기록이 없는 날짜에만
  const checkins = loadData<Record<string, unknown>>('checkins', {})
  for (const [dateKey, checkin] of Object.entries(persona.checkins)) {
    if (checkins[dateKey]) continue
    checkins[dateKey] = checkin
    manifest.checkinDates.push(dateKey)
  }
  saveData('checkins', checkins)

  const careStageLog = loadData<Record<string, unknown>>('care-stage-log', {})
  for (const [dateKey, stage] of Object.entries(persona.careStageLog)) {
    if (careStageLog[dateKey]) continue
    careStageLog[dateKey] = stage
    manifest.careStageDates.push(dateKey)
  }
  saveData('care-stage-log', careStageLog)

  // 인사이트 예시 카드 하나에는 '몰랐는데 맞아' 를 눌러 둡니다.
  const insightResponses = loadData<Record<string, string>>('insight-responses', {})
  if (!insightResponses['insight-1']) {
    saveData('insight-responses', { ...insightResponses, 'insight-1': 'surprised' })
    manifest.insightIds.push('insight-1')
  }

  // 4) 하나뿐인 값 — 비어 있을 때만 (온보딩을 끝낸 상태로 만들기)
  for (const [key, value] of Object.entries(buildDemoOnboarding(persona.startKey, todayKey))) {
    if (loadData<unknown>(key, null) !== null) continue
    saveData(key, value)
    manifest.setKeys.push(key)
  }

  // 5) 알림 화면의 예시 메시지 (id 앞에 'demo-')
  saveAiMessages([
    ...loadAiMessages(),
    ...mockAiMessages.map((message) => ({ ...message, id: `${DEMO_ID_PREFIX}${message.id}` })),
  ])

  saveData(MANIFEST_KEY, manifest)
}

/** 가상 데이터만 뺍니다. 'demo-' 로 시작하는 것과 'demo-manifest' 에 적힌 것만 지우고, 내 기록은 남깁니다. */
export function removeDemoData(): void {
  removeDemoItems<{ id: string }>('cards', (item) => item.id)
  removeDemoItems<{ id: string }>('sessions', (item) => item.id)
  removeDemoItems<{ id: string }>('goals', (item) => item.id)
  removeDemoItems<{ id: string }>('fixed-blocks', (item) => item.id)
  removeDemoItems<{ cardId: string }>('card-day-marks', (item) => item.cardId)
  removeDemoItems<{ id: string }>('experiments', (item) => item.id)
  removeDemoItems<{ id: string }>('manual-items', (item) => item.id)

  const plansByDate = loadData<Record<string, { id: string }[]>>('plans', {})
  const nextPlans: Record<string, { id: string }[]> = {}
  for (const [dateKey, plans] of Object.entries(plansByDate)) {
    const remaining = plans.filter((plan) => !plan.id.startsWith(DEMO_ID_PREFIX))
    // 그날 계획이 하나도 안 남으면 날짜 칸도 지웁니다. (usePlans 의 deletePlan 과 같은 규칙)
    if (remaining.length > 0) nextPlans[dateKey] = remaining
  }
  saveData('plans', nextPlans)

  saveAiMessages(loadAiMessages().filter((message) => !message.id.startsWith(DEMO_ID_PREFIX)))

  const manifest = loadData<DemoManifest | null>(MANIFEST_KEY, null)
  if (manifest) {
    saveData(
      'rest-days',
      loadData<{ date: string }[]>('rest-days', []).filter(
        (day) => !manifest.restDates.includes(day.date),
      ),
    )
    saveData(
      'predictions',
      loadData<{ weekStart: string }[]>('predictions', []).filter(
        (item) => !manifest.predictionWeeks.includes(item.weekStart),
      ),
    )
    saveData(
      'weekly-reviews',
      loadData<{ weekStart: string }[]>('weekly-reviews', []).filter(
        (item) => !manifest.reviewWeeks.includes(item.weekStart),
      ),
    )
    const checkins = loadData<Record<string, unknown>>('checkins', {})
    for (const dateKey of manifest.checkinDates) delete checkins[dateKey]
    saveData('checkins', checkins)
    const careStageLog = loadData<Record<string, unknown>>('care-stage-log', {})
    for (const dateKey of manifest.careStageDates) delete careStageLog[dateKey]
    saveData('care-stage-log', careStageLog)
    const insightResponses = loadData<Record<string, unknown>>('insight-responses', {})
    for (const id of manifest.insightIds) delete insightResponses[id]
    saveData('insight-responses', insightResponses)
    for (const key of manifest.setKeys) removeData(key)
  }
  removeData(MANIFEST_KEY)
}

/** 가상 데이터가 들어 있는지 알려줍니다. id 가 'demo-' 로 시작하는 공부 기록이 하나라도 있으면 true 입니다. */
export function hasDemoData(sessions: StudySession[]): boolean {
  return sessions.some((session) => session.id.startsWith(DEMO_ID_PREFIX))
}
