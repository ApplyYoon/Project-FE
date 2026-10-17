/**
 * 체크인의 "오늘의 약속" (#79)을 다루는 순수 함수와 값들입니다.
 *
 * 약속은 "만약 ~하면 → ~한다" 한 문장을 칸 두 개로 받습니다.
 *   만약 [학원에서 돌아오면] → [씻기 전에 영어 단어 20개를 본다]
 * "열심히 하기" 같은 약속은 지켰는지 알 수 없지만, 이 문장은 다음 날 "지켰어 / 못 지켰어" 로 물을 수 있습니다.
 */

/** 칸 하나에 적을 수 있는 글자 수 */
export const PROMISE_MAX_LENGTH = 40

/** 눌러서 칸을 채우는 예시 문장들 */
export const PROMISE_EXAMPLES = [
  { ifText: '책상에 앉으면', thenText: '타이머부터 켠다' },
  { ifText: '폰을 보고 싶으면', thenText: '한 문제만 더 푼다' },
  { ifText: '학원에서 돌아오면', thenText: '씻기 전에 영어 단어 20개를 본다' },
]

/** 체크인에 저장되는 약속 */
export interface PromiseText {
  promiseIf: string
  promiseThen: string
}

/**
 * 입력칸에 적은 글자로 저장할 약속을 만듭니다.
 * 앞뒤 빈칸은 떼고, 두 칸이 모두 채워졌을 때만 약속으로 봅니다. 하나라도 비었으면 null 입니다.
 * (한 칸만 있는 약속은 "~하면 → ~한다" 문장이 아니라서, 다음 날 지켰는지 물을 수 없습니다)
 *
 *   makePromiseText('학원에서 돌아오면', '영어 단어 20개를 본다') -> { promiseIf: '학원에서 돌아오면', promiseThen: '영어 단어 20개를 본다' }
 *   makePromiseText('  책상에 앉으면  ', ' 타이머부터 켠다 ')      -> { promiseIf: '책상에 앉으면', promiseThen: '타이머부터 켠다' }
 *   makePromiseText('학원에서 돌아오면', '')                      -> null   (뒤 칸이 비었음)
 *   makePromiseText('', '')                                        -> null   (안 정했음)
 *   makePromiseText('   ', '타이머부터 켠다')                      -> null   (앞 칸이 빈칸뿐)
 */
export function makePromiseText(ifText: string, thenText: string): PromiseText | null {
  const promiseIf = ifText.trim()
  const promiseThen = thenText.trim()
  if (promiseIf === '' || promiseThen === '') return null
  return { promiseIf, promiseThen }
}

/**
 * 한 칸만 채워서 아직 약속으로 저장되지 않는 상태인지 알려줍니다. (안내 문구를 보여줄지 정할 때 씁니다)
 *
 *   isHalfFilledPromise('학원에서 돌아오면', '')  -> true
 *   isHalfFilledPromise('', '타이머부터 켠다')    -> true
 *   isHalfFilledPromise('', '')                   -> false  (아직 안 적음)
 *   isHalfFilledPromise('A', 'B')                 -> false  (둘 다 적음)
 */
export function isHalfFilledPromise(ifText: string, thenText: string): boolean {
  const hasIf = ifText.trim() !== ''
  const hasThen = thenText.trim() !== ''
  return hasIf !== hasThen
}

/**
 * 어제 정한 약속이 있는지 보고, 있으면 "지켰어?" 로 물을 문장을 돌려줍니다. 약속이 없으면 null 입니다.
 * 저장된 값이 한쪽만 비어 있어도 약속이 아니므로 null 입니다.
 *
 *   getAskedPromise({ promiseIf: '책상에 앉으면', promiseThen: '타이머부터 켠다' }) -> { promiseIf: '책상에 앉으면', promiseThen: '타이머부터 켠다' }
 *   getAskedPromise({ promiseIf: '책상에 앉으면' })                                -> null
 *   getAskedPromise(undefined)                                                      -> null   (어제 체크인을 안 했음)
 */
export function getAskedPromise(
  checkIn: { promiseIf?: string; promiseThen?: string } | undefined,
): PromiseText | null {
  if (checkIn === undefined) return null
  return makePromiseText(checkIn.promiseIf ?? '', checkIn.promiseThen ?? '')
}
