/**
 * 일기·성찰 일기를 저장할 때, 도움 연결 안내(위기 표현·기분 저하)를 보여줘야 하는지 판단합니다. (#95)
 *
 * 안전 브레이크(getSafetyBrakeResult)에 "방금 쓴 글" 과 "최근 기분 기록" 을 넘겨서 showHelp 를 확인합니다.
 * 최근 기분 기록은 매일 체크인(#24)에 저장된 기분과, 호출하는 쪽이 넘겨 주는 일기 기분을 합쳐서 씁니다.
 */
import { getSafetyBrakeResult, type MoodRecordInput } from '@/lib/safetyBrake'
import { loadData } from '@/lib/storage'
import type { CheckIn } from '@/types'

/** 저장해 둔 체크인에서 날짜·기분만 꺼냅니다. (저장 이름은 useCheckIns 의 'checkins' 와 같습니다) */
function loadCheckInMoods(): MoodRecordInput[] {
  const checkIns = Object.values(loadData<Record<string, CheckIn>>('checkins', {}))
  return checkIns.map((checkIn) => ({ date: checkIn.date, mood: checkIn.mood }))
}

/**
 * 방금 쓴 글에 위기 표현이 있거나 기분이 오래 낮으면 true 를 돌려줍니다.
 *
 *   const needsHelp = shouldShowCrisisHelp({ texts: [content], diaryMoods: [{ date, mood }] })
 *
 * - texts: 방금 쓴 글 원문들 (성찰 일기는 답변 여러 개)
 * - diaryMoods: 일기에 적은 기분 기록들 (오늘 고른 기분 포함). 없으면 빈 배열
 */
export function shouldShowCrisisHelp(input: {
  texts: string[]
  diaryMoods: MoodRecordInput[]
}): boolean {
  const brake = getSafetyBrakeResult({
    now: new Date(),
    recentTexts: input.texts,
    recentMoods: [...loadCheckInMoods(), ...input.diaryMoods],
    exams: [], // 시험 목록(#80)이 생기면 넣으세요
  })
  return brake.showHelp
}
