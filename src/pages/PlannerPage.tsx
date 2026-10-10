import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { GoalAdjustModal } from '@/components/ui/GoalAdjustModal'
import { Input } from '@/components/ui/Input'
import { MinutesPicker } from '@/components/ui/MinutesPicker'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { useGoalAdjust } from '@/hooks/useGoalAdjust'
import { moveDateKey, toDateKey } from '@/lib/date'
import { usePlans } from '@/hooks/usePlans'
import { useRoutines } from '@/hooks/useRoutines'
import { useStudySessions } from '@/hooks/useStudySessions'
import { useSuggestionChecks } from '@/hooks/useSuggestionChecks'
import { useSuggestions } from '@/hooks/useSuggestions'
import { scalePlanMinutes } from '@/lib/goalAdjust'
import { getTodayCareDecision } from '@/lib/careInputs'
import { getRecentAverageMinutes } from '@/lib/goalAdjustInput'
import { loadCheckInsByDate } from '@/lib/insightEvidence'
import { mockSubjects } from '@/lib/mock'
import { getPlanProgress } from '@/lib/planProgress'
import { copyPlans, getFrequentPlans, type FrequentPlan } from '@/lib/planShortcuts'
import {
  WEEKDAY_ORDER,
  formatWeekdays,
  getWeekday,
  getWeekdayName,
  markRoutinesFilled,
} from '@/lib/routines'
import { loadData, saveData } from '@/lib/storage'
import type { Routine, StudyPlan, Subject, SubjectColor } from '@/types'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

/* 과목 색 → 태그 색. (#11 SubjectBadge 가 생기면 그걸로 바꾸면 됩니다) */
const subjectColorStyles: Record<SubjectColor, string> = {
  red: 'bg-red-50 text-red-600',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-green-50 text-green-600',
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
}

/* 색 고르기 버튼에 칠할 색. 시안과 같은 순서로 보여줍니다. */
const colorSwatchStyles: Record<SubjectColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
}
const subjectColorOrder: SubjectColor[] = ['blue', 'green', 'red', 'purple', 'orange']

// 목표 시간 버튼에 보여줄 값(분)과, 처음에 골라 두는 값
const PLAN_MINUTES_PRESETS = [30, 60, 90, 120]
const DEFAULT_PLAN_MINUTES = 60

interface PlanAddFormProps {
  /** 고를 수 있는 과목 목록 */
  subjects: Subject[]
  /** 최근에 자주 쓴 계획. 버튼으로 보여주고, 누르면 바로 추가합니다. */
  frequentPlans: FrequentPlan[]
  /** 지금 보고 있는 날짜의 요일 (0 = 일요일 … 6 = 토요일). "매주 반복" 을 켤 때 이 요일을 미리 골라 둡니다. */
  defaultWeekday: number
  /**
   * 입력 검사를 통과했을 때, 새 계획에 들어갈 값을 부모에게 넘깁니다.
   * repeatWeekdays: "매주 반복" 으로 고른 요일들. 반복하지 않으면 빈 배열입니다.
   */
  onAdd: (
    subjectId: string,
    content: string,
    targetMinutes: number,
    repeatWeekdays: number[],
  ) => void
}

/** 새 계획을 입력하는 폼입니다. (자주 쓰는 계획 · 과목 · 내용 · 목표 시간 · 매주 반복) */
function PlanAddForm({ subjects, frequentPlans, defaultWeekday, onAdd }: PlanAddFormProps) {
  // 첫 과목을 미리 골라 둡니다. 과목이 하나도 없으면 빈 값입니다.
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [content, setContent] = useState('')
  // 목표 시간은 버튼으로 고릅니다. 고른 값은 다음 계획을 넣을 때도 그대로 남습니다.
  const [minutes, setMinutes] = useState(DEFAULT_PLAN_MINUTES)
  const [contentError, setContentError] = useState('')
  // "매주 반복" 을 켰는지와, 반복할 요일들 (0 = 일요일 … 6 = 토요일)
  const [isRepeat, setIsRepeat] = useState(false)
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([])
  const [repeatError, setRepeatError] = useState('')

  function handleToggleRepeat() {
    // 켤 때 아직 고른 요일이 없으면, 지금 보고 있는 날짜의 요일을 미리 골라 둡니다.
    if (!isRepeat && repeatWeekdays.length === 0) setRepeatWeekdays([defaultWeekday])
    setIsRepeat(!isRepeat)
    setRepeatError('')
  }

  function handleToggleWeekday(weekday: number) {
    // 이미 골랐으면 빼고, 아니면 더합니다.
    setRepeatWeekdays((prev) =>
      prev.includes(weekday) ? prev.filter((day) => day !== weekday) : [...prev, weekday],
    )
    setRepeatError('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // 폼의 기본 동작(페이지 새로고침)을 막습니다.
    event.preventDefault()

    // 띄어쓰기만 입력한 것도 빈 내용으로 봅니다.
    const trimmedContent = content.trim()

    // 내용이 비었으면 추가하지 않고 안내 문구만 보여 줍니다. (목표 시간은 버튼으로 골라서 항상 쓸 수 있는 값입니다)
    if (trimmedContent === '') {
      setContentError('할 일을 입력해 주세요.')
      return
    }

    // 반복을 켰는데 요일을 하나도 안 골랐으면 추가하지 않습니다.
    if (isRepeat && repeatWeekdays.length === 0) {
      setRepeatError('반복할 요일을 하나 이상 골라 주세요.')
      return
    }

    onAdd(subjectId, trimmedContent, minutes, isRepeat ? repeatWeekdays : [])

    // 추가했으면 내용 칸을 비웁니다. (고른 과목과 목표 시간은 그대로 둡니다)
    setContent('')
    // 반복은 꺼 둡니다. 켜 둔 채로 다음 계획을 넣다가 루틴이 실수로 생기지 않게 하기 위해서입니다.
    setIsRepeat(false)
  }

  return (
    <Card title="계획 추가">
      {/* 자주 쓰는 계획: 누르면 폼을 거치지 않고 바로 추가됩니다. 쓴 적이 없으면 보이지 않습니다. */}
      {frequentPlans.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5 border-b border-slate-100 pb-4">
          <span className="text-sm font-medium text-slate-700">자주 쓰는 계획</span>
          {/* 글자 수가 제각각인 버튼이라 flex-wrap 으로 넘치면 다음 줄로 보냅니다. */}
          <div className="flex flex-wrap gap-2">
            {frequentPlans.map((plan) => {
              const subject = subjects.find((item) => item.id === plan.subjectId)
              return (
                <button
                  key={`${plan.subjectId}|${plan.content}|${plan.targetMinutes}`}
                  type="button"
                  onClick={() => onAdd(plan.subjectId, plan.content, plan.targetMinutes, [])}
                  // max-w-full + min-w-0: 내용이 길어도 버튼이 카드 밖으로 나가지 않게 합니다.
                  className="flex min-h-10 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-slate-400 bg-slate-50 px-3 py-1 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <span aria-hidden className="text-brand font-bold">
                    +
                  </span>
                  {subject && (
                    <span
                      className={cn(
                        'shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
                        subjectColorStyles[subject.color],
                      )}
                    >
                      {subject.name}
                    </span>
                  )}
                  <span className="min-w-0 break-words">
                    {plan.content} · {plan.targetMinutes}분
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-sm text-slate-500">누르면 바로 추가돼요.</p>
        </div>
      )}

      {/* noValidate: 브라우저 기본 경고창 대신 아래 Input 의 안내 문구를 보여 주기 위해 끕니다. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div role="group" aria-label="과목" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">과목</span>
          <div className="flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <Button
                key={subject.id}
                variant={subject.id === subjectId ? 'primary' : 'secondary'}
                aria-pressed={subject.id === subjectId}
                onClick={() => setSubjectId(subject.id)}
              >
                {subject.name}
              </Button>
            ))}
          </div>
        </div>

        <Input
          name="planContent"
          label="할 일"
          placeholder="예: 수학 문제집 4단원"
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            setContentError('')
          }}
          error={contentError}
        />

        {/* 숫자를 치는 대신 버튼으로 고릅니다. 버튼에 없는 시간은 "직접" 으로 적습니다. */}
        <MinutesPicker
          label="목표 시간"
          presets={PLAN_MINUTES_PRESETS}
          value={minutes}
          onChange={setMinutes}
        />

        {/* 매주 반복: 켜면 이 계획이 루틴으로 저장되어, 고른 요일마다 자동으로 들어옵니다. (#236) */}
        <div className="flex flex-col gap-2">
          {/* label 로 감싸서 글자를 눌러도 체크됩니다. min-h-10 으로 누르는 영역을 40px 로 맞춥니다. */}
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isRepeat}
              onChange={handleToggleRepeat}
              className="accent-brand h-5 w-5 cursor-pointer"
            />
            매주 반복 (루틴으로 저장)
          </label>

          {isRepeat && (
            <>
              {/* 요일 버튼 7개가 375px 에서도 한 줄에 들어갑니다. */}
              <div role="group" aria-label="반복할 요일" className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_ORDER.map((weekday) => {
                  const isSelected = repeatWeekdays.includes(weekday)
                  return (
                    <button
                      key={weekday}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${getWeekdayName(weekday)}요일`}
                      onClick={() => handleToggleWeekday(weekday)}
                      className={cn(
                        'h-10 cursor-pointer rounded-lg border text-sm font-medium transition-colors',
                        isSelected
                          ? 'border-brand bg-brand-light text-brand'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      {getWeekdayName(weekday)}
                    </button>
                  )
                })}
              </div>
              <p className="text-sm break-keep text-slate-500">
                고른 요일마다 이 계획이 자동으로 들어와요.
              </p>
              {repeatError && <p className="text-xs text-red-600">{repeatError}</p>}
            </>
          )}
        </div>

        <Button type="submit" className="w-full">
          추가하기
        </Button>
      </form>
    </Card>
  )
}

interface RoutineListProps {
  /** 저장된 루틴 목록 */
  routines: Routine[]
  /** 과목 이름과 색을 찾을 때 쓰는 과목 목록 */
  subjects: Subject[]
  /** 루틴을 방금 저장했을 때 보여줄 안내. 없으면 null */
  notice: string | null
  /** 루틴의 삭제 버튼을 눌렀을 때 호출됩니다. */
  onDelete: (routine: Routine) => void
}

/** "내 루틴" 카드. 요일마다 반복되는 계획의 틀을 보고 지울 수 있습니다. (#236) */
function RoutineList({ routines, subjects, notice, onDelete }: RoutineListProps) {
  return (
    <Card title="내 루틴">
      <div className="flex flex-col gap-3">
        {notice && (
          <p role="status" className="text-sm font-medium break-keep text-indigo-700">
            {notice}
          </p>
        )}

        {routines.length === 0 ? (
          <p className="text-sm break-keep text-slate-500">
            아직 루틴이 없어요. 계획을 추가할 때 &quot;매주 반복&quot; 을 켜면 루틴이 돼요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {routines.map((routine) => {
              const subject = subjects.find((item) => item.id === routine.subjectId)
              return (
                <li key={routine.id} className="flex items-center gap-2 py-1">
                  {/* flex-wrap: 좁은 화면에서는 요일·과목·내용이 두 줄로 나뉩니다. */}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                    <span className="shrink-0 font-semibold text-slate-900">
                      {formatWeekdays(routine.weekdays)}
                    </span>
                    {subject && (
                      <span
                        className={cn(
                          'shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
                          subjectColorStyles[subject.color],
                        )}
                      >
                        {subject.name}
                      </span>
                    )}
                    <span className="min-w-0 break-words text-slate-900">{routine.content}</span>
                    <span className="shrink-0 text-slate-500">{routine.targetMinutes}분</span>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => onDelete(routine)}
                    aria-label={`${routine.content} 루틴 삭제`}
                    className="shrink-0 px-3 text-slate-500 hover:text-red-600"
                  >
                    삭제
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-sm break-keep text-slate-500">
          루틴은 고른 요일의 계획에 자동으로 들어와요. 그날 계획을 고치거나 지워도 루틴은
          그대로예요.
        </p>
      </div>
    </Card>
  )
}

interface SubjectManagerProps {
  /** 지금까지 등록된 과목 목록 */
  subjects: Subject[]
  /** 입력 검사를 통과했을 때, 새 과목 이름과 색을 부모에게 넘깁니다. */
  onAdd: (name: string, color: SubjectColor) => void
  /** 과목의 삭제 버튼(×)을 눌렀을 때 호출됩니다. */
  onDelete: (subject: Subject) => void
}

/** 과목을 추가·삭제하는 카드입니다. */
function SubjectManager({ subjects, onAdd, onDelete }: SubjectManagerProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<SubjectColor>(subjectColorOrder[0])
  const [nameError, setNameError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()

    if (trimmedName === '') {
      setNameError('과목 이름을 입력해 주세요.')
      return
    }

    onAdd(trimmedName, color)
    setName('')
    setNameError('')
  }

  return (
    <Card title="내 과목">
      <div className="flex flex-col gap-4">
        {subjects.length === 0 ? (
          <p className="text-sm text-slate-500">아직 등록한 과목이 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <span
                key={subject.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold',
                  subjectColorStyles[subject.color],
                )}
              >
                {subject.name}
                <button
                  type="button"
                  onClick={() => onDelete(subject)}
                  aria-label={`${subject.name} 삭제`}
                  className="cursor-pointer text-sm leading-none opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            name="subjectName"
            label="새 과목 이름"
            placeholder="예: 한국사"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setNameError('')
            }}
            error={nameError}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">색</span>
            <div role="group" aria-label="과목 색" className="flex flex-wrap gap-2">
              {subjectColorOrder.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  aria-label={`${item} 색`}
                  aria-pressed={color === item}
                  className={cn(
                    'h-10 w-10 cursor-pointer rounded-full',
                    colorSwatchStyles[item],
                    color === item && 'ring-2 ring-slate-900 ring-offset-2',
                  )}
                />
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full">
            과목 추가
          </Button>
        </form>

        <p className="text-sm text-slate-500">과목 색은 계획·타이머·기록에서 같이 쓰여요.</p>
      </div>
    </Card>
  )
}

/** 보고 있는 날짜의 바로 전날을 부르는 이름입니다. 오늘을 보고 있으면 '어제', 내일을 보고 있으면 '오늘', 그 밖에는 '전날' */
function getDayBeforeLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return '어제'
  if (dateKey === moveDateKey(todayKey, 1)) return '오늘'
  return '전날'
}

export function PlannerPage() {
  const todayKey = toDateKey(new Date())

  // 계획은 날짜별로 localStorage 에 저장돼서 새로고침해도 남습니다. (usePlans 훅)
  const {
    allPlans,
    getPlans,
    addPlan,
    addPlans,
    fillRoutines,
    toggleDone,
    deletePlan,
    replaceDayPlans,
  } = usePlans()
  // 루틴 = 요일마다 반복되는 계획의 틀 (#236)
  const { routines, addRoutine, deleteRoutine } = useRoutines()
  // 루틴을 방금 저장했을 때 보여줄 안내
  const [routineNotice, setRoutineNotice] = useState<string | null>(null)
  const { sessions } = useStudySessions()
  const [selectedDate, setSelectedDate] = useState(todayKey)

  // 새로고침해도 과목 목록이 유지되도록 localStorage 에서 불러옵니다. (처음 한 번은 예시 과목으로 시작)
  const [subjects, setSubjects] = useState<Subject[]>(() => loadData('subjects', mockSubjects))

  useEffect(() => {
    saveData('subjects', subjects)
  }, [subjects])

  // 보고 있는 날짜에 아직 안 넣은 루틴이 있으면 계획으로 넣습니다. (오늘과 앞으로의 날짜만, 한 날짜에 한 번만)
  // [selectedDate, routines]: 날짜를 옮기거나 루틴이 바뀔 때 다시 확인합니다.
  useEffect(() => {
    fillRoutines(selectedDate, routines)
  }, [selectedDate, routines])

  // 화면에는 고른 날짜의 계획만 보여 줍니다.
  const plans = getPlans(selectedDate)
  const isToday = selectedDate === todayKey

  // ---- 원터치 계획 (#235) ----
  // 지워진 과목의 계획은 가져오기와 자주 쓰는 계획에서 뺍니다.
  const subjectIds = subjects.map((subject) => subject.id)
  // 최근 14일 동안 자주 쓴 "과목 + 할 일 + 시간" 조합 (많이 쓴 순, 5개까지)
  const frequentPlans = getFrequentPlans(allPlans, todayKey, subjectIds)
  // 계획이 비어 있는 날에 보여줄 "가져오기" 후보: 바로 전날과 지난주 같은 요일
  const importSources = [
    { label: getDayBeforeLabel(selectedDate, todayKey), date: moveDateKey(selectedDate, -1) },
    {
      label: `지난주 ${getWeekdayName(getWeekday(selectedDate))}요일`,
      date: moveDateKey(selectedDate, -7),
    },
  ]
    .map((source) => ({
      ...source,
      // 가져올 수 있는 계획 수 (지워진 과목의 계획은 빼고 셉니다)
      count: copyPlans(getPlans(source.date), selectedDate, subjectIds, 0).length,
    }))
    // 가져올 계획이 없는 날은 버튼을 보여주지 않습니다.
    .filter((source) => source.count > 0)

  // 목표 조정 제안 (#67, #205): 오늘의 대응이 "목표 상향/하향" 이면 팝업으로 물어봅니다.
  // 대응은 기간이 끝난 개선안의 이행·효과 판정, 체크인의 기분·미달 원인, 연속 미달 일수로 정합니다.
  // (기간이 끝난 개선안이 아직 없으면 대응이 정해지지 않아 팝업이 뜨지 않습니다. 자세한 건 lib/careInputs.ts)
  const todayPlans = getPlans(todayKey)
  const todayGoalMinutes = todayPlans.reduce((sum, plan) => sum + plan.targetMinutes, 0)
  const { suggestions } = useSuggestions()
  const { checks: suggestionChecks } = useSuggestionChecks()
  // 체크인은 화면이 처음 그려질 때 한 번만 읽습니다. (이 화면에서는 체크인을 바꾸지 않습니다)
  const [checkIns] = useState(loadCheckInsByDate)
  const careDecision = getTodayCareDecision({
    suggestions,
    suggestionChecks,
    checkIns,
    plans: allPlans,
    sessions,
  })
  const { proposal, accept, decline } = useGoalAdjust({
    action: careDecision?.action ?? null,
    currentMinutes: todayGoalMinutes,
    recentAverageMinutes: getRecentAverageMinutes(allPlans, sessions),
    // 수락하면 오늘 계획들의 목표 시간을 새 목표에 맞춰 같은 비율로 바꿉니다.
    onAccept: (newMinutes) => replaceDayPlans(todayKey, scalePlanMinutes(todayPlans, newMinutes)),
  })

  // 'ko-KR' 로 바꾸면 "10월 5일 일요일" 처럼 한국어 날짜가 됩니다.
  // 'YYYY-MM-DD' 문자열은 영국 시간으로 읽히므로, 년·월·일을 쪼개서 우리 시간대로 만듭니다.
  const [year, month, day] = selectedDate.split('-').map(Number)
  const dateLabel = new Date(year, month - 1, day).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  // window.confirm 은 브라우저 기본 확인창입니다. "확인" 을 누르면 true, "취소" 면 false 를 돌려줍니다.
  function handleDelete(target: StudyPlan) {
    const isConfirmed = window.confirm(`"${target.content}" 계획을 정말 지울까요?`)
    if (!isConfirmed) return
    deletePlan(target.id)
  }

  // 폼에서 받은 값으로 새 계획을 만들어 저장합니다. 지금 보고 있는 날짜의 계획이 됩니다.
  // repeatWeekdays 가 비어 있지 않으면 "매주 반복" 을 켠 것입니다. 루틴도 같이 저장합니다.
  function handleAdd(
    subjectId: string,
    content: string,
    targetMinutes: number,
    repeatWeekdays: number[],
  ) {
    const now = Date.now()
    const newPlan: StudyPlan = {
      // 추가한 시각(밀리초)을 붙여서 다른 계획과 겹치지 않는 id 를 만듭니다.
      id: `plan-${now}`,
      date: selectedDate,
      subjectId,
      content,
      targetMinutes,
      done: false,
    }

    if (repeatWeekdays.length > 0) {
      const routine: Routine = {
        id: `routine-${now}`,
        weekdays: repeatWeekdays,
        kind: 'study',
        subjectId,
        content,
        targetMinutes,
      }
      addRoutine(routine)
      // 이 날짜는 아래에서 직접 넣거나(요일이 맞을 때) 넣지 않기로 한 것이라, 루틴이 같은 계획을 또 넣지 않게 표시해 둡니다.
      markRoutinesFilled(selectedDate, [routine.id])
      setRoutineNotice(`루틴을 저장했어요. ${formatWeekdays(repeatWeekdays)}마다 계획에 들어와요.`)

      // 고른 요일에 지금 보고 있는 날짜가 없으면, 이 날짜에는 계획을 넣지 않습니다.
      if (!repeatWeekdays.includes(getWeekday(selectedDate))) return
      newPlan.routineId = routine.id
    }

    // 그날 목록의 맨 뒤에 붙습니다. (목록은 이 순서대로 보여 주므로 맨 아래에 나옵니다)
    addPlan(newPlan)
  }

  // 루틴을 지웁니다. 이미 만들어진 날의 계획은 그대로 남습니다.
  function handleDeleteRoutine(target: Routine) {
    const message = `"${target.content}" 루틴을 지울까요? 이미 들어간 계획은 그대로 남아요.`
    if (!window.confirm(message)) return
    deleteRoutine(target.id)
    setRoutineNotice(null)
  }

  // 다른 날의 계획을 지금 보고 있는 날짜로 가져옵니다. 완료 표시는 지우고, 원래 날의 계획은 그대로 둡니다.
  function handleImport(sourceDate: string) {
    addPlans(copyPlans(getPlans(sourceDate), selectedDate, subjectIds, Date.now()))
  }

  // 새 과목을 목록 맨 뒤에 추가합니다.
  function handleAddSubject(name: string, color: SubjectColor) {
    const newSubject: Subject = { id: `subject-${Date.now()}`, name, color }
    setSubjects((prev) => [...prev, newSubject])
  }

  // 그 과목으로 등록된 계획이 있으면(날짜 상관없이) 몇 개인지 알려주고 한 번 더 확인합니다.
  function handleDeleteSubject(target: Subject) {
    const relatedCount = allPlans.filter((plan) => plan.subjectId === target.id).length
    const message =
      relatedCount > 0
        ? `"${target.name}" 과목으로 등록된 계획이 ${relatedCount}개 있어요. 그래도 삭제할까요?`
        : `"${target.name}" 과목을 삭제할까요?`

    if (!window.confirm(message)) return
    setSubjects((prev) => prev.filter((subject) => subject.id !== target.id))
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">공부 계획</h1>

        {/* 날짜 이동: ◀ 어제 / 날짜 / 내일 ▶ / 오늘로 돌아가기 */}
        <div className="mt-3 flex items-center gap-1">
          <Button
            variant="secondary"
            onClick={() => setSelectedDate(moveDateKey(selectedDate, -1))}
            aria-label="어제로 이동"
            className="w-10 shrink-0 px-0"
          >
            ◀
          </Button>
          <p className="min-w-0 flex-1 text-center text-sm font-semibold whitespace-nowrap text-slate-900 sm:text-base">
            {dateLabel}
          </p>
          <Button
            variant="secondary"
            onClick={() => setSelectedDate(moveDateKey(selectedDate, 1))}
            aria-label="내일로 이동"
            className="w-10 shrink-0 px-0"
          >
            ▶
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSelectedDate(todayKey)}
            disabled={isToday}
            className="text-brand shrink-0 px-3"
          >
            오늘
          </Button>
        </div>
      </div>

      {/* 모바일은 세로로 쌓고, PC(lg)에서는 시안처럼 왼쪽 목록 · 오른쪽 추가 폼으로 나눕니다. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <Card title={isToday ? '오늘 계획' : `${month}월 ${day}일 계획`}>
          {plans.length === 0 ? (
            <div className="flex flex-col gap-3 py-4">
              <p className="text-center text-sm text-slate-500">
                {isToday ? '오늘' : '이 날'} 계획을 세워 보세요
              </p>
              {/* 계획이 비어 있는 날에만 보이는 "가져오기". 한 번 누르면 그날의 계획이 그대로 들어옵니다. */}
              {importSources.map((source) => (
                <Button
                  key={source.date}
                  variant="secondary"
                  className="h-auto min-h-10 w-full py-2 break-keep"
                  onClick={() => handleImport(source.date)}
                >
                  {source.label} 계획 가져오기 · {source.count}개
                </Button>
              ))}
              {importSources.length > 0 && (
                <p className="text-center text-sm break-keep text-slate-500">
                  완료 표시는 지워져서 들어와요. 가져온 뒤에 고치거나 지울 수 있어요.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {plans.map((plan) => {
                const subject = subjects.find((item) => item.id === plan.subjectId)
                // 이 계획에서 타이머를 시작해 공부한 시간. "32 / 50분" 과 진행 막대에 씁니다. (lib/planProgress.ts)
                const progress = getPlanProgress(plan, sessions)

                return (
                  // 한 계획 = 두 줄. 윗줄: 체크·과목·내용·시작 버튼 / 아랫줄: 진행 막대·실제/목표·삭제
                  <li key={plan.id} className="flex flex-col py-1">
                    <div className="flex items-center gap-2">
                      {/* label 로 감싸서 체크박스 주변 40px 전체를 눌러도 체크됩니다. */}
                      <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={plan.done}
                          onChange={() => toggleDone(plan.id)}
                          aria-label={`${plan.content} 완료`}
                          className="accent-brand h-5 w-5 cursor-pointer"
                        />
                      </label>

                      {subject && (
                        <span
                          className={cn(
                            'shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
                            subjectColorStyles[subject.color],
                          )}
                        >
                          {subject.name}
                        </span>
                      )}

                      {/* min-w-0 + break-words: 긴 내용이 가로 스크롤을 만들지 않게 합니다. */}
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-sm break-words text-slate-900',
                          plan.done && 'text-slate-400 line-through',
                        )}
                      >
                        {plan.content}
                      </span>

                      {/* 루틴이 넣어 준 계획이라는 표시 */}
                      {plan.routineId && (
                        <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                          반복
                        </span>
                      )}

                      {/* 오늘의 안 끝난 계획만 바로 시작할 수 있습니다. 누르면 타이머가 이 계획의 과목·목표 시간으로 시작됩니다. */}
                      {isToday && !plan.done && (
                        <Link
                          to={`/timer?plan=${plan.id}`}
                          aria-label={`${plan.content} 타이머 시작`}
                          className="bg-brand hover:bg-brand-dark inline-flex h-10 shrink-0 items-center rounded-full px-3 text-sm font-medium text-white transition-colors"
                        >
                          ▶ {progress.actualMinutes > 0 ? '이어서' : '시작'}
                        </Link>
                      )}
                    </div>

                    {/* pl-12: 체크박스(40px) + 간격(8px)만큼 들여써서 과목 태그와 줄을 맞춥니다. */}
                    <div className="flex items-center gap-3 pl-12">
                      <ProgressBar value={progress.percent} className="min-w-0 flex-1" />
                      {/* 아주 큰 숫자가 와도 줄을 넘지 않게 break-all 로 줄바꿈을 허용합니다. */}
                      <span className="min-w-0 text-sm break-all text-slate-500 tabular-nums">
                        {progress.actualMinutes} / {plan.targetMinutes}분
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => handleDelete(plan)}
                        aria-label={`${plan.content} 삭제`}
                        className="shrink-0 px-3 text-slate-500 hover:text-red-600"
                      >
                        삭제
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <PlanAddForm
          subjects={subjects}
          frequentPlans={frequentPlans}
          defaultWeekday={getWeekday(selectedDate)}
          onAdd={handleAdd}
        />
      </div>

      <RoutineList
        routines={routines}
        subjects={subjects}
        notice={routineNotice}
        onDelete={handleDeleteRoutine}
      />

      <SubjectManager subjects={subjects} onAdd={handleAddSubject} onDelete={handleDeleteSubject} />

      <GoalAdjustModal proposal={proposal} onAccept={accept} onDecline={decline} />
    </div>
  )
}
