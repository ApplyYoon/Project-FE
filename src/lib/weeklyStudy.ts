import { toDateKey } from '@/lib/dailyRecords'
import { toDayDate } from '@/lib/date'
import { getDaySummary } from '@/lib/daySummary'
import type { StudySession } from '@/types'

/**
 * "최근 7일 공부 시간" 막대그래프에 필요한 값을 계산합니다. React 없이 돌아가는 순수 함수라서 `lib/` 에 둡니다.
 *
 * ■ 정해 둔 규칙
 *   - 오늘을 포함한 최근 7일입니다. 맨 오른쪽(마지막)이 오늘이고, 왼쪽으로 하루씩 거슬러 올라갑니다.
 *   - 하루 공부 시간은 하루 요약 getDaySummary 가 계산합니다. 그래서 기록 화면의 다른 숫자와 같은 규칙입니다.
 *     (그날 "시작한" 기록만 세고, 밀리초로 더한 뒤 마지막에 한 번만 분으로 반올림)
 *   - 막대 높이(percent)는 가장 많이 공부한 날을 100 으로 잡고 나머지를 비율로 계산합니다.
 *     모든 날이 0분이면 나눌 수 없으니 전부 0 입니다.
 *   - 7일 합계는 "막대에 보이는 하루 시간"을 그대로 더한 값입니다. (화면에서 직접 더해 봐도 맞도록)
 */

/** 보여줄 날짜 수 */
const DAY_COUNT = 7

/** 막대 하나(하루)에 필요한 값 */
export interface WeeklyStudyDay {
  /** 날짜 'YYYY-MM-DD' */
  date: string
  /** 요일 숫자. 일요일 0 ~ 토요일 6 (Date.getDay() 와 같습니다) */
  weekday: number
  /** 그날 공부한 시간 (분) */
  minutes: number
  /** 막대 높이 (0 ~ 100). 가장 많이 공부한 날이 100 입니다. */
  percent: number
  /** 오늘이면 true */
  isToday: boolean
}

export interface WeeklyStudy {
  /** 7일치. 오래된 날이 앞, 오늘이 맨 뒤입니다. */
  days: WeeklyStudyDay[]
  /** 7일 공부 시간 합계 (분) */
  totalMinutes: number
}

/** 분 단위 숫자를 막대 위에 쓰는 '3:10' 모양으로 바꿉니다. (0분은 '0:00') */
export function formatHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

/**
 * 공부 기록으로 최근 7일 막대그래프 값을 만듭니다.
 *
 * today 는 "오늘이 언제인지" 입니다. 평소엔 비워 두면 되고, 확인할 때 날짜를 바꿔 넣을 수 있습니다.
 *
 *   const { days, totalMinutes } = getWeeklyStudy(sessions)   // days[6] 이 오늘
 */
export function getWeeklyStudy(sessions: StudySession[], today: Date = new Date()): WeeklyStudy {
  const days: Omit<WeeklyStudyDay, 'percent'>[] = []
  // 하루의 기준(새벽 4시)으로 "오늘" 을 정합니다. 새벽 2시면 아직 어제입니다.
  const todayDate = toDayDate(today)

  // 6일 전부터 오늘까지 순서대로 만듭니다.
  for (let daysAgo = DAY_COUNT - 1; daysAgo >= 0; daysAgo -= 1) {
    // new Date(년, 월, 일) 은 일이 범위를 넘어가면 달·해를 알아서 넘겨줍니다. (일 - 6 = 6일 전)
    const date = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate() - daysAgo,
    )
    const dateKey = toDateKey(date)

    days.push({
      date: dateKey,
      weekday: date.getDay(),
      // 계획은 필요 없어서 빈 목록을 넘깁니다.
      minutes: getDaySummary(dateKey, [], sessions).studyMinutes,
      isToday: daysAgo === 0,
    })
  }

  // 가장 많이 공부한 날 = 100%. 모두 0분이면 0 으로 나눌 수 없으니 막대는 전부 0 입니다.
  const maxMinutes = Math.max(...days.map((day) => day.minutes))
  const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0)

  return {
    days: days.map((day) => ({
      ...day,
      percent: maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0,
    })),
    totalMinutes,
  }
}
