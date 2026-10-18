/**
 * "이유 여러 개 고르기" 에 쓰는 작은 도구입니다. (2026-10-18 사용자: "이유 정할 때 복수형으로 정할 수도 있지 않나")
 * 일시정지 이유 · 다 못 한 이유 · 카드 실패 원인이 하나만 고르던 것에서 여러 개를 고르게 바뀌었습니다.
 *
 * ■ 저장 모양: 새 칸(배열)에 고른 것을 모두 넣고, 예전 칸(하나)에는 처음 고른 것(대표 이유)을 같이 넣습니다.
 *   예) 일시정지 { tag: 'phone', tags: ['phone', 'mindWander'] }
 *   그래서 하나만 읽는 예전 코드 · 서버 동기화도 그대로 돕니다.
 * ■ 서버에는 대표 이유 하나만 저장됩니다. 서버 표(session_pauses.tag 등)는 칸이 하나라서,
 *   여러 개를 저장하려면 표를 바꿔야 하고 그건 학생들이 정합니다. (BE 규칙 "테이블 설계는 학생이")
 */

/**
 * 고른 이유 목록을 돌려줍니다. 새 칸(배열)이 있으면 그것을, 없으면 예전 칸 하나를 [하나] 로 바꿉니다.
 *
 *   toReasonList(['phone', 'tired'], 'phone') -> ['phone', 'tired']   (새 기록)
 *   toReasonList(undefined, 'phone')          -> ['phone']            (예전 기록)
 *   toReasonList(undefined, undefined)        -> []                   (고르지 않음)
 */
export function toReasonList<T>(list: T[] | undefined, one: T | undefined): T[] {
  if (list && list.length > 0) return list
  return one === undefined ? [] : [one]
}

/**
 * 칩을 눌렀을 때 고른 목록을 바꿉니다. 이미 있으면 빼고, 없으면 끝에 더합니다.
 * 처음 고른 것이 맨 앞에 남아서 "대표 이유" 가 됩니다.
 *
 *   toggleReason(['phone'], 'tired')          -> ['phone', 'tired']
 *   toggleReason(['phone', 'tired'], 'phone') -> ['tired']
 */
export function toggleReason<T>(list: T[], key: T): T[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key]
}
