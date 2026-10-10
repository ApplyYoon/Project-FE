import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useReflectionEntries } from '@/hooks/useReflectionEntries'
import { shouldShowCrisisHelp } from '@/lib/diarySafety'
import { SUPPORT_PATH } from '@/lib/helpLines'
import { loadStudySessions } from '@/lib/dailyRecords'
import { getReflectionPrescription } from '@/lib/reflectionPrescription'
import { loadRecord } from '@/lib/storage'
import type { DiaryEntry, ReflectionEntry } from '@/types'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/** Date 를 'YYYY-MM-DD' 모양으로 만듭니다. (toISOString() 은 영국 시간 기준이라 쓰지 않습니다) */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** fromKey 부터 toKey 까지 며칠째인지 셉니다. (같은 날이면 1일째) */
function countDays(fromKey: string, toKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromKey.split('-').map(Number)
  const [toYear, toMonth, toDay] = toKey.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  const diffMs =
    new Date(toYear, toMonth - 1, toDay).getTime() -
    new Date(fromYear, fromMonth - 1, fromDay).getTime()
  return Math.round(diffMs / msPerDay) + 1
}

export function ReflectionPage() {
  const navigate = useNavigate()
  const todayKey = toDateKey(new Date())
  // 지금 내려진 처방. 없으면 null 입니다. (서버가 생기기 전까지 진짜 사용자에게는 처방이 없습니다. lib/reflectionPrescription.ts)
  const [prescription] = useState(() => getReflectionPrescription(loadStudySessions()))

  // 처방이 없으면 0일째로 두고, 아래에서 "기간이 아니에요" 를 보여줍니다.
  const dayIndex = prescription === null ? 0 : countDays(prescription.startDate, todayKey)
  const isWithinPrescription =
    prescription !== null && dayIndex >= 1 && dayIndex <= prescription.days

  const { getEntry, saveEntry } = useReflectionEntries()
  const existingEntry = getEntry(todayKey)

  // 오늘 이미 썼으면 그 답을 불러와서 고칠 수 있게 하고, 처음이면 질문 수만큼 빈 칸으로 시작합니다.
  const [answers, setAnswers] = useState<string[]>(
    () => existingEntry?.answers ?? (prescription?.questions ?? []).map(() => ''),
  )
  const [savedMessage, setSavedMessage] = useState('')

  function handleChangeAnswer(index: number, value: string) {
    setAnswers((prev) => prev.map((answer, i) => (i === index ? value : answer)))
    setSavedMessage('')
  }

  function handleSave() {
    // 처방이 없으면 저장할 것이 없습니다. (저장 버튼도 보이지 않습니다)
    if (prescription === null) return

    const entry: ReflectionEntry = {
      date: todayKey,
      prescriptionId: prescription.id,
      answers: answers.map((answer) => answer.trim()),
    }
    // 쓴 글을 잃지 않도록 먼저 저장하고, 그다음에 위기 표현을 확인합니다. (#95)
    saveEntry(entry)
    setSavedMessage('저장했어요.')

    // 성찰 일기에는 기분 칸이 없어서, 일기에 적어 둔 기분과 체크인의 기분을 함께 봅니다.
    // (일기 화면과 같은 기록으로 판정해야, 어느 화면에서 쓰든 결과가 같습니다)
    const diaryMoods = Object.values(loadRecord<DiaryEntry>('diary')).map((diary) => ({
      date: diary.date,
      mood: diary.mood,
    }))
    // 감지되면 도움 연결 안내 화면으로 보냅니다. (글은 이미 저장했습니다)
    if (shouldShowCrisisHelp({ texts: entry.answers, diaryMoods })) {
      navigate(SUPPORT_PATH)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* h-10: 글자는 작아도 누르는 영역은 40px 로 둡니다. */}
        <Link
          to="/diary"
          className="inline-flex h-10 items-center text-sm text-slate-500 hover:text-slate-700"
        >
          ‹ 일기
        </Link>
        <p className="text-brand mt-2 text-sm font-semibold">AI 선생님이 처방한 성찰 일기</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {isWithinPrescription
            ? `오늘의 성찰 · ${dayIndex}일째 / ${prescription.days}일`
            : '오늘의 성찰'}
        </h1>
      </div>

      {!isWithinPrescription ? (
        <Card>
          <p className="py-6 text-center text-sm text-slate-500">
            지금은 성찰 일기 기간이 아니에요.
          </p>
        </Card>
      ) : (
        <>
          <ProgressBar value={(dayIndex / prescription.days) * 100} />

          <Card>
            <p className="text-sm text-slate-600">{prescription.reason}</p>
          </Card>

          <div className="flex flex-col gap-4">
            {prescription.questions.map((question, index) => (
              <Card key={question}>
                <label
                  htmlFor={`reflection-answer-${index}`}
                  className="text-sm font-medium text-slate-700"
                >
                  <span className="text-brand font-semibold">{index + 1}</span> · {question}
                </label>
                <textarea
                  id={`reflection-answer-${index}`}
                  value={answers[index]}
                  onChange={(event) => handleChangeAnswer(index, event.target.value)}
                  rows={4}
                  className="focus:border-brand focus:ring-brand/30 mt-2 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm placeholder:text-slate-400 focus:ring-2 focus:outline-none"
                />
              </Card>
            ))}
          </div>

          <p className="text-sm text-slate-500">
            🔒 원문은 나만 봐요. AI 는 원인과 반복되는 말만 뽑아서 써요.
          </p>

          <Button className="w-full" onClick={handleSave}>
            저장하기
          </Button>

          {savedMessage && (
            <p role="status" className="text-sm font-medium text-emerald-600">
              {savedMessage}
            </p>
          )}
        </>
      )}
    </div>
  )
}
