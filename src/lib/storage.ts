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

/**
 * 저장해 둔 값을 지웁니다.
 * 지운 뒤에 다시 읽어서, 정말 사라졌을 때만 true 를 돌려줍니다. (저장소를 쓸 수 없으면 false)
 * 원래 저장된 게 없던 키도 "사라진 상태" 라서 true 입니다.
 *
 * 사용 예:
 *   const isGone = removeData('plans')
 */
export function removeData(key: string): boolean {
  try {
    localStorage.removeItem(makeKey(key))
    // 지웠다고 믿지 않고 다시 확인합니다. 값이 없으면 null 이 나옵니다.
    return localStorage.getItem(makeKey(key)) === null
  } catch {
    console.warn(`[storage] '${key}' 값을 지우지 못했습니다.`)
    return false
  }
}

/**
 * 저장해 둔 "목록(배열)" 을 불러옵니다. 저장된 값이 배열이 아니면(없거나 깨졌으면) fallback 을 돌려줍니다.
 *
 * loadData 는 저장된 값의 모양을 확인하지 않습니다. 그래서 배열이어야 하는 곳에 다른 값이 들어 있으면
 * `.map` · `.filter` 에서 에러가 나서 화면 전체가 멈춥니다. 목록을 읽을 때는 이 함수를 쓰세요.
 *
 * 사용 예:
 *   const checks = loadList<SuggestionCheck>('suggestion-checks')
 */
export function loadList<T>(key: string, fallback: T[] = []): T[] {
  const saved = loadData<unknown>(key, fallback)
  return Array.isArray(saved) ? (saved as T[]) : fallback
}

/**
 * 저장해 둔 "{ 이름: 값 }" 모양의 객체를 불러옵니다. (날짜별 기록처럼 { '2026-10-10': … } 로 저장하는 곳에서 씁니다)
 * 저장된 값이 그런 객체가 아니면(없거나, null 이거나, 배열 · 글자 · 숫자면) 빈 객체를 돌려줍니다.
 *
 * 사용 예:
 *   const checkInsByDate = loadRecord<CheckIn>('checkins')
 */
export function loadRecord<T>(key: string): Record<string, T> {
  const saved = loadData<unknown>(key, {})
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {}
  return saved as Record<string, T>
}

/**
 * 이 앱이 이 브라우저에 저장한 것을 전부 지웁니다. 탈퇴했을 때 씁니다. (pages/AccountPage.tsx)
 * 설정 화면의 "모든 기록 지우기"(lib/myData.ts)는 설정·계정 정보를 남기지만, 이 함수는 하나도 남기지 않습니다.
 *
 * 우리 앱의 키는 모두 'study-' 로 시작합니다. 같은 주소의 다른 값(있다면)은 건드리지 않습니다.
 * 하나라도 지우지 못하면 false 입니다.
 */
export function removeAllData(): boolean {
  try {
    // 지우는 도중에 순서가 바뀌지 않게, 지울 키를 먼저 다 모은 뒤에 지웁니다.
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key !== null && key.startsWith(KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
    return true
  } catch {
    // 사생활 보호 모드처럼 저장소를 쓸 수 없는 경우입니다.
    return false
  }
}
