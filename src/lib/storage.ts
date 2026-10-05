/**
 * 브라우저 저장소(localStorage)에 데이터를 저장하고 불러오는 함수입니다.
 *
 * localStorage 에 넣어 두면 새로고침을 해도 데이터가 사라지지 않습니다.
 * 나중에 서버가 생기면 이 파일만 바꾸면 되도록 저장 방법을 여기에 모아 두었습니다.
 *
 * 주의: localStorage 는 5MB 정도만 저장됩니다. 사진 같은 큰 데이터는 저장하지 마세요.
 */

// 같은 주소를 쓰는 다른 사이트의 데이터와 키 이름이 섞이지 않도록 붙이는 접두사입니다.
const KEY_PREFIX = 'study-'

/** 'plan' -> 'study-plan' 처럼 접두사를 붙인 키를 만듭니다. */
function makeKey(key: string): string {
  return `${KEY_PREFIX}${key}`
}

/**
 * 저장해 둔 값을 불러옵니다.
 * 저장된 값이 없거나, 값이 깨져 있거나, 저장소를 쓸 수 없으면 fallback 을 돌려줍니다.
 *
 * 사용 예:
 *   const plans = loadData<Plan[]>('plans', [])
 */
export function loadData<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(makeKey(key))

    // 아직 한 번도 저장한 적이 없으면 null 이 나옵니다.
    if (saved === null) return fallback

    // 저장된 글자(JSON)를 원래 값으로 되돌립니다. 모양이 깨져 있으면 에러가 나서 catch 로 갑니다.
    // 타입(T)은 믿고 쓰는 것이라, 저장할 때와 같은 타입으로 불러와야 합니다.
    return JSON.parse(saved) as T
  } catch {
    // 에러가 나도 앱이 멈추지 않게 기본값을 돌려줍니다.
    return fallback
  }
}

/**
 * 값을 저장합니다. 객체·배열도 그대로 넣을 수 있습니다.
 *
 * 사용 예:
 *   saveData('plans', plans)
 */
export function saveData<T>(key: string, value: T): void {
  try {
    // localStorage 에는 글자만 넣을 수 있어서 JSON 글자로 바꿔서 저장합니다.
    localStorage.setItem(makeKey(key), JSON.stringify(value))
  } catch {
    // 저장 공간이 가득 찼거나 저장소를 쓸 수 없는 경우입니다. 앱은 멈추지 않고 넘어갑니다.
    console.warn(`[storage] '${key}' 값을 저장하지 못했습니다.`)
  }
}
