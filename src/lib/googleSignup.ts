/**
 * 구글로 처음 온 사람이 가입을 마칠 때까지 잠깐 들고 있는 정보입니다. (#319)
 *
 * 흐름: 로그인 화면 [Google로 시작하기] → 서버가 "가입 필요" → 이 정보를 저장하고 /signup 으로
 *       → 가입 화면이 이 정보로 이름·이메일을 채우고, 마지막에 credential 로 가입 (lib/authApi.ts 의 signupWithGoogle)
 *
 * ⚠️ sessionStorage(이 탭이 닫히면 지워지는 저장소)에만 둡니다. localStorage 에 두지 않습니다.
 *    credential 은 구글 신분증이라 오래 남으면 안 됩니다. 어차피 한 시간이면 끝나서 그 뒤에는 쓸 수 없습니다.
 *    가입을 마치거나 그만두면 clearPendingGoogleSignup 으로 지웁니다.
 */

const STORAGE_KEY = 'study-google-signup'

export interface PendingGoogleSignup {
  /** 구글이 준 신분증(ID 토큰). 가입할 때 서버에 다시 보냅니다 */
  credential: string
  /** 구글 계정의 이름. 없으면 빈 글자 */
  name: string
  /** 구글이 확인한 이메일 */
  email: string
}

export function savePendingGoogleSignup(pending: PendingGoogleSignup): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // 저장소를 쓸 수 없는 브라우저(사생활 보호 모드 등)입니다. 가입 화면이 "다시 Google로 시작" 을 안내합니다.
  }
}

/** 저장해 둔 정보를 꺼냅니다. 없거나 모양이 틀리면 null 입니다. */
export function loadPendingGoogleSignup(): PendingGoogleSignup | null {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return null
    const record = saved as Record<string, unknown>
    if (
      typeof record.credential !== 'string' ||
      record.credential === '' ||
      typeof record.name !== 'string' ||
      typeof record.email !== 'string'
    ) {
      return null
    }
    return { credential: record.credential, name: record.name, email: record.email }
  } catch {
    return null
  }
}

export function clearPendingGoogleSignup(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없습니다.
  }
}
