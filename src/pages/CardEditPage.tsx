import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { MinutesPicker } from '@/components/ui/MinutesPicker'
import { useCards } from '@/hooks/useCards'
import { useQueryParam } from '@/hooks/useQueryParam'
import { useStudySessions } from '@/hooks/useStudySessions'
import {
  ALERT_MINUTES_OPTIONS,
  ALERT_TEXT_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  CHECKLIST_ITEM_MAX_LENGTH,
  EXPECTED_DONE_REASONS,
  buildCard,
  cardToForm,
  createEmptyForm,
  getFilledChecklist,
  getRecentPlanAccuracy,
  validateCardForm,
  type CardFormValues,
} from '@/lib/cardForm'
import { cn } from '@/lib/cn'
import { getTodayKey, isDateKey } from '@/lib/date'
import { PLAN_MAX_MINUTES } from '@/lib/plansApi'
import { WEEKDAY_ORDER, getWeekdayName } from '@/lib/routines'
import { loadAutoSettings } from '@/lib/settingsMapping'
import type { Card as CardData } from '@/types'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

interface ToggleOption<T extends string> {
  value: T
  label: string
}

interface SegmentedToggleProps<T extends string> {
  /** 화면 읽기 프로그램에 읽어 줄 이름 (예: '우선순위') */
  label: string
  options: ToggleOption<T>[]
  value: T
  onChange: (value: T) => void
}

/** 두세 개 중 하나를 고르는 버튼 묶음 (1회성/반복, 유연/절대 등) */
function SegmentedToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex w-full rounded-lg bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-10 flex-1 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors',
            value === option.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface ChipButtonProps {
  selected: boolean
  onClick: () => void
  children: string
  className?: string
}

/** 여러 개 중 하나(또는 여러 개)를 고르는 동그란 버튼 */
function ChipButton({ selected, onClick, children, className }: ChipButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors',
        selected
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-slate-200 text-slate-600 hover:border-slate-300',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface CardFormProps {
  initialValues: CardFormValues
  /** 고치는 중이면 그 카드, 새 카드면 없음 */
  editingCard?: CardData
  /** 성향 설정(#385): 예상 실패 원인을 꼭 받을지 */
  failCauseRequired: boolean
  /** 성향 설정(#385): 선택 칸을 처음부터 펼쳐 둘지 */
  optionalOpenByDefault: boolean
  /** 최근 4주 계획 정확도. 기록이 모자라면 null */
  accuracy: { rate: number; samples: number } | null
  onSave: (card: CardData) => void
}

/** 카드 만들기 · 고치기 폼 */
function CardForm({
  initialValues,
  editingCard,
  failCauseRequired,
  optionalOpenByDefault,
  accuracy,
  onSave,
}: CardFormProps) {
  const [values, setValues] = useState<CardFormValues>(initialValues)
  // 저장을 한 번 눌러 본 뒤부터 틀린 칸을 빨갛게 보여 줍니다. (처음부터 빨가면 겁이 납니다)
  const [triedSave, setTriedSave] = useState(false)
  // 편집 화면을 연 시각. 저장할 때까지 걸린 시간을 planningMs 로 남깁니다. (「4.3」 계획 시간 측정)
  const [openedAt] = useState(() => Date.now())

  // 선택 칸을 펼쳤는지는 주소에 둡니다. (/cards/new?more=open) 새로고침해도 그대로입니다.
  const [moreParam, setMoreParam] = useQueryParam(
    'more',
    optionalOpenByDefault ? 'open' : 'closed',
    { replace: true },
  )
  const isMoreOpen = moreParam === 'open'

  const errors = validateCardForm(values, { failCauseRequired })
  const shownErrors = triedSave ? errors : {}
  const filledCount = getFilledChecklist(values.checklist).length
  // 체크리스트를 비워 두면 제목 한 줄로 채우므로, 예상 개수의 최댓값은 최소 1개입니다.
  const checklistTotal = Math.max(1, filledCount)
  const expectedDone =
    values.expectedDone === null ? checklistTotal : Math.min(values.expectedDone, checklistTotal)
  const isLowered = expectedDone < checklistTotal

  /** 한 칸만 바꿉니다. */
  function change<K extends keyof CardFormValues>(key: K, value: CardFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleToggleWeekday(weekday: number) {
    setValues((prev) => ({
      ...prev,
      repeatDays: prev.repeatDays.includes(weekday)
        ? prev.repeatDays.filter((day) => day !== weekday)
        : [...prev.repeatDays, weekday],
    }))
  }

  function handleChangeChecklistItem(itemId: string, text: string) {
    setValues((prev) => ({
      ...prev,
      checklist: prev.checklist.map((item) => (item.id === itemId ? { ...item, text } : item)),
    }))
  }

  function handleAddChecklistItem() {
    setValues((prev) => ({
      ...prev,
      checklist: [...prev.checklist, { id: `item-${Date.now()}`, text: '' }],
    }))
  }

  function handleDeleteChecklistItem(itemId: string) {
    setValues((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((item) => item.id !== itemId),
    }))
  }

  /** 예상 달성 개수를 바꿉니다. 전부로 되돌리면 이유는 지웁니다. */
  function handleChangeExpectedDone(next: number) {
    const clamped = Math.min(Math.max(next, 0), checklistTotal)
    setValues((prev) => ({
      ...prev,
      expectedDone: clamped >= checklistTotal ? null : clamped,
      expectedDoneReason: clamped >= checklistTotal ? '' : prev.expectedDoneReason,
    }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTriedSave(true)
    if (Object.keys(errors).length > 0) {
      // 접힌 칸에 틀린 곳이 있으면 펼쳐서 보여 줍니다.
      if (errors.expectedDoneReason || (errors.failCauses && !failCauseRequired)) {
        setMoreParam('open')
      }
      return
    }
    // 고치는 카드는 전에 쓴 계획 시간에 이번에 쓴 시간을 더합니다.
    const planningMs = (editingCard?.planningMs ?? 0) + (Date.now() - openedAt)
    const card = buildCard(values, {
      id: editingCard?.id ?? `card-${Date.now()}`,
      createdAt: editingCard?.createdAt ?? Date.now(),
      planningMs,
    })
    onSave(card)
  }

  // 예상 실패 원인 칸. 성향상 꼭 받아야 하면 필수 칸 쪽에, 아니면 접힌 칸 안에 둡니다.
  const failCauseField = (
    <Input
      label={failCauseRequired ? '예상 실패 원인 (필수)' : '예상 실패 원인'}
      value={values.failCauses}
      onChange={(event) => change('failCauses', event.target.value)}
      placeholder="예: 폰을 책상에 두면 계속 보게 돼요"
      error={shownErrors.failCauses}
    />
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* 계획 정확도 한 줄. 내 계획이 얼마나 맞는지 먼저 보고 쓰게 합니다. (더닝-크루거 대응) */}
      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm break-keep text-slate-600">
        {accuracy ? (
          <>
            최근 4주 계획 정확도{' '}
            <strong className="text-slate-900">{Math.round(accuracy.rate * 100)}%</strong> ·
            체크리스트를 계획한 만큼 해낸 비율이에요 (카드 {accuracy.samples}번)
          </>
        ) : (
          '카드를 5번 끝내면 최근 4주 계획 정확도를 보여 줄게요.'
        )}
      </p>

      <Card title="꼭 적을 것">
        <div className="flex flex-col gap-5">
          <Input
            label="무엇을 할까요?"
            value={values.title}
            onChange={(event) => change('title', event.target.value)}
            maxLength={CARD_TITLE_MAX_LENGTH}
            placeholder="예: 수학 문제집"
            error={shownErrors.title}
          />

          {/* 언제: 1회성 / 반복 */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">언제</p>
            <SegmentedToggle
              label="반복 여부"
              options={[
                { value: 'once', label: '한 번만' },
                { value: 'repeat', label: '요일마다 반복' },
              ]}
              value={values.repeat ? 'repeat' : 'once'}
              onChange={(next) => change('repeat', next === 'repeat')}
            />
            {values.repeat && (
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_ORDER.map((weekday) => (
                  <button
                    key={weekday}
                    type="button"
                    aria-pressed={values.repeatDays.includes(weekday)}
                    onClick={() => handleToggleWeekday(weekday)}
                    className={cn(
                      'h-10 cursor-pointer rounded-lg border text-sm font-medium transition-colors',
                      values.repeatDays.includes(weekday)
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300',
                    )}
                  >
                    {getWeekdayName(weekday)}
                  </button>
                ))}
              </div>
            )}
            {shownErrors.repeatDays && (
              <p className="text-xs text-red-600">{shownErrors.repeatDays}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="date"
              label={values.repeat ? '반복 시작 날짜' : '날짜'}
              value={values.date}
              // 날짜를 지우면 저장할 수 없으니, 빈 값은 받지 않습니다.
              onChange={(event) => {
                if (isDateKey(event.target.value)) change('date', event.target.value)
              }}
            />
            <Input
              type="time"
              label="시작 시각"
              value={values.startTime}
              onChange={(event) => change('startTime', event.target.value)}
              error={shownErrors.startTime}
            />
          </div>

          <MinutesPicker
            label="길이"
            presets={[30, 60, 90, 120]}
            value={values.durationMinutes}
            onChange={(minutes) => change('durationMinutes', minutes)}
            max={PLAN_MAX_MINUTES}
          />

          {/* 체크리스트: 개수 자유, 중요도 구분 없음 */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">체크리스트</p>
            <ul className="flex flex-col gap-2">
              {values.checklist.map((item, index) => (
                <li key={item.id} className="flex items-center gap-2">
                  <input
                    value={item.text}
                    onChange={(event) => handleChangeChecklistItem(item.id, event.target.value)}
                    maxLength={CHECKLIST_ITEM_MAX_LENGTH}
                    aria-label={`체크리스트 ${index + 1}번`}
                    placeholder="예: 42~45쪽 풀기"
                    className="focus:border-brand focus:ring-brand/20 h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:ring-2"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => handleDeleteChecklistItem(item.id)}
                    aria-label={`체크리스트 ${index + 1}번 지우기`}
                    className="w-10 shrink-0 px-0 text-slate-400"
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={handleAddChecklistItem} className="self-start">
              + 항목 더하기
            </Button>
            <p className="text-xs break-keep text-slate-500">비워 두면 제목으로 한 줄 채워요.</p>
          </div>

          {failCauseRequired && failCauseField}
        </div>
      </Card>

      {/* 선택 칸: 성향에 따라 펼쳐 두거나 접어 둡니다 (#385) */}
      <Card>
        <button
          type="button"
          aria-expanded={isMoreOpen}
          onClick={() => setMoreParam(isMoreOpen ? 'closed' : 'open')}
          className="flex h-10 w-full cursor-pointer items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold text-slate-900">더 정하기 (선택)</span>
            <span className="block truncate text-xs text-slate-500">
              우선순위 · 유형 · 예상 달성 개수 · 알림
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-slate-400">
            {isMoreOpen ? '▲' : '▼'}
          </span>
        </button>

        {isMoreOpen && (
          <div className="mt-5 flex flex-col gap-5">
            {/* 우선순위: 드래그 대신 절대/유연 토글 (「4.3」 규칙) */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700">우선순위</p>
              <SegmentedToggle
                label="우선순위"
                options={[
                  { value: 'flexible', label: '유연' },
                  { value: 'absolute', label: '절대' },
                ]}
                value={values.priority}
                onChange={(next) => change('priority', next)}
              />
              <p className="text-xs break-keep text-slate-500">
                {values.priority === 'absolute'
                  ? '절대 카드에는 미루기 버튼이 없어요. 과제 제출처럼 꼭 그 시간에 해야 할 때 골라요.'
                  : '유연 카드는 미루거나 줄일 수 있어요. 절대로 바꾸면 미루기 버튼이 없어져요.'}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700">유형</p>
              <SegmentedToggle
                label="유형"
                options={[
                  { value: 'self', label: '자습' },
                  { value: 'lecture', label: '인강' },
                ]}
                value={values.type}
                onChange={(next) => change('type', next)}
              />
            </div>

            {/* 예상 달성 개수: 그대로 두면 "전부" 라는 예측으로 저장됩니다 */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700">몇 개까지 할 수 있을 것 같나요?</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleChangeExpectedDone(expectedDone - 1)}
                  disabled={expectedDone <= 0}
                  aria-label="예상 개수 줄이기"
                  className="w-10 shrink-0 px-0"
                >
                  −
                </Button>
                <p className="min-w-0 flex-1 text-center text-sm font-semibold text-slate-900">
                  {expectedDone} / {checklistTotal}개{isLowered ? '' : ' (전부)'}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => handleChangeExpectedDone(expectedDone + 1)}
                  disabled={!isLowered}
                  aria-label="예상 개수 늘리기"
                  className="w-10 shrink-0 px-0"
                >
                  +
                </Button>
              </div>
              {isLowered && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-slate-500">왜 낮췄나요? (하나)</p>
                  <div className="flex flex-wrap gap-2">
                    {EXPECTED_DONE_REASONS.map((reason) => (
                      <ChipButton
                        key={reason}
                        selected={values.expectedDoneReason === reason}
                        onClick={() => change('expectedDoneReason', reason)}
                      >
                        {reason}
                      </ChipButton>
                    ))}
                  </div>
                  {shownErrors.expectedDoneReason && (
                    <p className="text-xs text-red-600">{shownErrors.expectedDoneReason}</p>
                  )}
                </div>
              )}
            </div>

            {!failCauseRequired && failCauseField}
            <p className="-mt-3 text-xs break-keep text-slate-500">
              쉼표로 여러 개 적을 수 있어요. 내 행동에서 나오는 원인을 하나는 넣어 주세요.
            </p>

            {/* 알림: 방식 · 몇 분 전 · 문구 */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700">알림</p>
              <SegmentedToggle
                label="알림 방식"
                options={[
                  { value: 'message', label: '메시지' },
                  { value: 'call', label: 'AI 전화' },
                ]}
                value={values.alertMethod}
                onChange={(next) => change('alertMethod', next)}
              />
              <div className="flex flex-wrap gap-2">
                {ALERT_MINUTES_OPTIONS.map((minutes) => (
                  <ChipButton
                    key={minutes}
                    selected={values.alertMinutesBefore === minutes}
                    onClick={() => change('alertMinutesBefore', minutes)}
                  >
                    {minutes === 0 ? '정각' : `${minutes}분 전`}
                  </ChipButton>
                ))}
              </div>
              <Input
                value={values.alertText}
                onChange={(event) => change('alertText', event.target.value)}
                maxLength={ALERT_TEXT_MAX_LENGTH}
                aria-label="알림 문구"
                placeholder="알림 문구 (비우면 기본 문구)"
              />
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          {editingCard ? '고친 내용 저장' : '카드 저장'}
        </Button>
        <Link
          to={`/cards?date=${values.date}`}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-slate-100 px-6 text-base font-medium text-slate-900 hover:bg-slate-200 sm:w-auto"
        >
          취소
        </Link>
      </div>
    </form>
  )
}

/**
 * 카드 만들기 · 고치기 화면 (최종 기획서 「4.3 카드」, #392)
 * - /cards/new?date=2026-10-17  → 그 날짜로 새 카드
 * - /cards/카드id/edit          → 그 카드 고치기
 * 필수는 제목 · 언제 · 체크리스트뿐이고, 나머지는 "더 정하기" 안에 접어 둡니다.
 */
export function CardEditPage() {
  const { cardId } = useParams()
  const navigate = useNavigate()
  const todayKey = getTodayKey()
  const { cards, addCard, updateCard } = useCards()
  const { sessions } = useStudySessions()
  // 주소의 ?date= 는 누구나 고칠 수 있어서, 진짜 날짜가 아니면 오늘로 봅니다.
  const [dateParam] = useQueryParam('date', todayKey)
  const startDate = isDateKey(dateParam) ? dateParam : todayKey
  // 성향 설정(#385)은 화면을 열 때 한 번만 읽습니다.
  const [settings] = useState(loadAutoSettings)
  const [now] = useState(() => Date.now())

  const editingCard = cardId ? cards.find((card) => card.id === cardId) : undefined
  const accuracy = getRecentPlanAccuracy(cards, sessions, todayKey)

  function handleSave(card: CardData) {
    if (editingCard) {
      // 고친 카드는 id 가 같아서 모든 칸을 그대로 덮어씁니다.
      updateCard(card.id, card)
    } else {
      addCard(card)
    }
    navigate(`/cards?date=${card.date}`)
  }

  if (cardId && !editingCard) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">카드를 찾을 수 없어요</h1>
        <p className="text-slate-600">지워졌거나 주소가 틀렸어요.</p>
        <Link to="/cards" className="text-brand inline-flex h-10 items-center font-medium">
          카드로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          to={`/cards?date=${editingCard?.date ?? startDate}`}
          className="inline-flex h-10 items-center text-sm text-slate-500"
        >
          ← 카드
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {editingCard ? '카드 고치기' : '새 카드'}
        </h1>
        <p className="mt-2 text-sm break-keep text-slate-600">
          언제 할지와 체크리스트만 정하면 돼요.
        </p>
      </div>

      <CardForm
        // 다른 카드로 옮겨 가면 폼을 처음부터 다시 그립니다.
        key={cardId ?? 'new'}
        initialValues={editingCard ? cardToForm(editingCard) : createEmptyForm(startDate, now)}
        editingCard={editingCard}
        failCauseRequired={settings.failCauseRequired.value}
        optionalOpenByDefault={settings.optionalFieldsOpen.value}
        accuracy={accuracy}
        onSave={handleSave}
      />
    </div>
  )
}
