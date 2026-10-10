import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { GoalAdjustModal } from '@/components/ui/GoalAdjustModal'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { useGoalAdjust } from '@/hooks/useGoalAdjust'
import { usePlans } from '@/hooks/usePlans'
import { useStudySessions } from '@/hooks/useStudySessions'
import { scalePlanMinutes } from '@/lib/goalAdjust'
import { getRecentAverageMinutes, getTodayCareAction } from '@/lib/goalAdjustInput'
import { mockSubjects } from '@/lib/mock'
import { loadData, saveData } from '@/lib/storage'
import type { StudyPlan, Subject, SubjectColor } from '@/types'
import { useEffect, useState, type FormEvent } from 'react'

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

/** Date 를 계획 데이터와 같은 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString 은 한국 시간이 아니라서 쓰지 않습니다)*/
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' 날짜에서 days 일 만큼 이동한 날짜를 돌려줍니다. (-1 = 어제, 1 = 내일) */
function moveDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  // new Date(년, 월, 일) 은 일이 범위를 넘어가면 달·해를 알아서 넘겨줍니다. (월은 0부터 시작)
  return toDateKey(new Date(year, month - 1, day + days))
}

interface PlanAddFormProps {
  /** 고를 수 있는 과목 목록 */
  subjects: Subject[]
  /** 입력 검사를 통과했을 때, 새 계획에 들어갈 값을 부모에게 넘깁니다. */
  onAdd: (subjectId: string, content: string, targetMinutes: number) => void
}

/** 새 계획을 입력하는 폼입니다. (과목 · 내용 · 목표 시간) */
function PlanAddForm({ subjects, onAdd }: PlanAddFormProps) {
  // 첫 과목을 미리 골라 둡니다. 과목이 하나도 없으면 빈 값입니다.
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [content, setContent] = useState('')
  // input 에서 꺼낸 값은 항상 글자(string)라서, 글자로 들고 있다가 검사할 때 숫자로 바꿉니다.
  const [minutes, setMinutes] = useState('')
  const [contentError, setContentError] = useState('')
  const [minutesError, setMinutesError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // 폼의 기본 동작(페이지 새로고침)을 막습니다.
    event.preventDefault()

    // 띄어쓰기만 입력한 것도 빈 내용으로 봅니다.
    const trimmedContent = content.trim()
    const targetMinutes = Number(minutes)

    const nextContentError = trimmedContent === '' ? '할 일을 입력해 주세요.' : ''
    // 칸이 비어 있으면 Number('') 가 0 이 되고, 숫자가 아니면 NaN 이 됩니다. 둘 다 "> 0" 이 거짓입니다.
    const nextMinutesError = targetMinutes > 0 ? '' : '목표 시간(분)을 0보다 크게 입력해 주세요.'

    setContentError(nextContentError)
    setMinutesError(nextMinutesError)

    // 하나라도 틀렸으면 추가하지 않고 안내 문구만 보여 줍니다.
    if (nextContentError || nextMinutesError) return

    onAdd(subjectId, trimmedContent, targetMinutes)

    // 추가했으면 입력칸을 비웁니다. (고른 과목은 그대로 둡니다)
    setContent('')
    setMinutes('')
  }

  return (
    <Card title="계획 추가">
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

        <Input
          name="planMinutes"
          label="목표 시간(분)"
          type="number"
          placeholder="예: 60"
          value={minutes}
          onChange={(event) => {
            setMinutes(event.target.value)
            setMinutesError('')
          }}
          error={minutesError}
        />

        <Button type="submit" className="w-full">
          추가하기
        </Button>
      </form>
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

export function PlannerPage() {
  const todayKey = toDateKey(new Date())

  // 계획은 날짜별로 localStorage 에 저장돼서 새로고침해도 남습니다. (usePlans 훅)
  const { allPlans, getPlans, addPlan, toggleDone, deletePlan, replaceDayPlans } = usePlans()
  const { sessions } = useStudySessions()
  const [selectedDate, setSelectedDate] = useState(todayKey)

  // 새로고침해도 과목 목록이 유지되도록 localStorage 에서 불러옵니다. (처음 한 번은 예시 과목으로 시작)
  const [subjects, setSubjects] = useState<Subject[]>(() => loadData('subjects', mockSubjects))

  useEffect(() => {
    saveData('subjects', subjects)
  }, [subjects])

  // 화면에는 고른 날짜의 계획만 보여 줍니다.
  const plans = getPlans(selectedDate)
  const isToday = selectedDate === todayKey

  // 목표 조정 제안 (#67): 오늘의 대응이 "목표 상향/하향" 이면 팝업으로 물어봅니다.
  // 개선안 이행·효과 판정, 기분, 미달 원인은 아직 저장하는 곳이 없어서 null/false 입니다.
  // (그 기능들이 저장을 시작하면 여기에 연결하세요. 그 전에는 대응이 정해지지 않아 팝업이 뜨지 않습니다)
  const todayPlans = getPlans(todayKey)
  const todayGoalMinutes = todayPlans.reduce((sum, plan) => sum + plan.targetMinutes, 0)
  const careAction = getTodayCareAction({
    fulfillment: null,
    effect: null,
    mainMissCause: null,
    isMoodLow: false,
    plans: allPlans,
    sessions,
  })
  const { proposal, accept, decline } = useGoalAdjust({
    action: careAction,
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
  function handleAdd(subjectId: string, content: string, targetMinutes: number) {
    const newPlan: StudyPlan = {
      // 추가한 시각(밀리초)을 붙여서 다른 계획과 겹치지 않는 id 를 만듭니다.
      id: `plan-${Date.now()}`,
      date: selectedDate,
      subjectId,
      content,
      targetMinutes,
      done: false,
    }
    // 그날 목록의 맨 뒤에 붙습니다. (목록은 이 순서대로 보여 주므로 맨 아래에 나옵니다)
    addPlan(newPlan)
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
            <p className="py-6 text-center text-sm text-slate-500">
              {isToday ? '오늘' : '이 날'} 계획을 세워 보세요
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {plans.map((plan) => {
                const subject = subjects.find((item) => item.id === plan.subjectId)

                return (
                  <li key={plan.id} className="flex items-center gap-2 py-1">
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

                    {/* 아주 큰 숫자가 와도 줄을 넘지 않게 break-all 로 줄바꿈을 허용합니다. */}
                    <span className="min-w-0 text-sm break-all text-slate-500">
                      {plan.targetMinutes}분
                    </span>

                    <Button
                      variant="ghost"
                      onClick={() => handleDelete(plan)}
                      aria-label={`${plan.content} 삭제`}
                      className="shrink-0 px-3 text-slate-500 hover:text-red-600"
                    >
                      삭제
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <PlanAddForm subjects={subjects} onAdd={handleAdd} />
      </div>

      <SubjectManager subjects={subjects} onAdd={handleAddSubject} onDelete={handleDeleteSubject} />

      <GoalAdjustModal proposal={proposal} onAccept={accept} onDecline={decline} />
    </div>
  )
}
