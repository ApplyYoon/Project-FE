/**
 * 통화에서 나온 값을 그날 체크인에 저장합니다. (#38)
 * 통화에서 이미 답한 것을 체크인 화면(/check)에서 다시 묻지 않게 하려는 것입니다.
 * React 없이 돌아가는 함수라서 lib/ 에 둡니다.
 *
 * 저장하는 것
 *  - 오늘의 약속 "만약 ~하면 → ~한다"  → 오늘 체크인의 promiseIf · promiseThen
 *  - 지난 약속을 지켰는지              → 어제 체크인의 promiseKept (체크인 화면이 저장하는 곳과 같습니다)
 *
 * ⚠️ 오늘 체크인이 아직 없으면 저장하지 않습니다.
 *    체크인에는 기분·컨디션이 꼭 있어야 하는데, 통화 결과에는 그 값이 없어서 지어낼 수 없기 때문입니다.
 *    (보통은 앱을 처음 열 때 하는 1탭 체크인(#242)이 있어서 저장됩니다)
 */
import type { CallConclusion } from '@/lib/callReview'
import { moveDateKey, toDayKey } from '@/lib/date'
import { loadRecord, saveData } from '@/lib/storage'
import { getAskedPromise, makePromiseText } from '@/lib/todayPromise'
import type { CheckIn } from '@/types'

// 저장소에 넣는 이름입니다. hooks/useCheckIns.ts 와 같은 값이어야 합니다.
const CHECKINS_KEY = 'checkins'

/**
 * 통화 결과를 체크인에 저장합니다. 오늘 체크인이 있어서 저장했으면 true, 없어서 못 했으면 false 입니다.
 * 날짜는 새벽 4시 기준입니다. (새벽 1시에 끝난 통화는 전날 체크인에 저장됩니다)
 *
 *   오늘 체크인 있음, 약속 { promiseIf: '책상에 앉으면', promiseThen: '타이머부터 켠다' }
 *     -> 오늘 체크인에 약속 저장, true
 *   오늘 체크인 있음, 약속 없음(null)   -> 오늘 체크인은 그대로, true
 *   오늘 체크인 없음                    -> 아무것도 저장하지 않음, false
 *   위기 표현이 감지된 통화(showHelp)    -> 아무것도 저장하지 않음, false
 */
export function saveCallToCheckIn(conclusion: CallConclusion, now: Date = new Date()): boolean {
  // 위기 통화는 다른 칸이 모두 비어 있고, 공부 이야기를 남기지 않습니다.
  if (conclusion.showHelp) return false

  const checkIns = loadRecord<CheckIn>(CHECKINS_KEY)
  const todayKey = toDayKey(now)
  const todayCheckIn = checkIns[todayKey]
  if (typeof todayCheckIn !== 'object' || todayCheckIn === null) return false

  const next = { ...checkIns }

  // 약속은 두 칸이 모두 있을 때만 저장합니다. (한 칸만 있으면 다음 날 "지켰어?" 로 물을 수 없습니다)
  const promise = makePromiseText(conclusion.promiseIf ?? '', conclusion.promiseThen ?? '')
  if (promise !== null) {
    next[todayKey] = { ...todayCheckIn, ...promise }
  }

  // 지난 약속을 지켰는지는 "약속을 정한 날" 인 어제 체크인에 적습니다. 어제 약속이 있었을 때만 적습니다.
  const yesterdayKey = moveDateKey(todayKey, -1)
  const yesterdayCheckIn = checkIns[yesterdayKey]
  if (conclusion.promiseKept !== null && getAskedPromise(yesterdayCheckIn) !== null) {
    next[yesterdayKey] = { ...yesterdayCheckIn, promiseKept: conclusion.promiseKept }
  }

  saveData(CHECKINS_KEY, next)
  return true
}
