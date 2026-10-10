/**
 * 가입 정보 입력 규칙과 저장하는 모양입니다. (화면은 pages/SignupPage.tsx)
 * React 없이 돌아가는 계산만 모아 두어서, 화면 없이도 규칙이 맞는지 확인할 수 있습니다.
 */
import type { School } from '@/lib/schoolSearch'
import { loadData } from '@/lib/storage'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-signup-info' 가 됩니다)
export const SIGNUP_STORAGE_KEY = 'signup-info'

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 20

export const NICKNAME_MIN_LENGTH = 2
export const NICKNAME_MAX_LENGTH = 10

export const EMAIL_MAX_LENGTH = 100

/** 동의 항목 세 가지. true 면 동의했다는 뜻입니다. */
export interface SignupConsents {
  /** [필수] 서비스 이용약관 */
  terms: boolean
  /** [필수] 개인정보 수집·이용 */
  privacy: boolean
  /** [선택] 일기·감정 기록을 분석에 쓰기. 동의하지 않아도 앱은 쓸 수 있습니다. */
  diaryAnalysis: boolean
}

/** 가입을 마치고 저장해 두는 정보입니다. (만 14세 미만은 가입할 수 없어서 아무것도 저장하지 않습니다) */
export interface SignupInfo {
  /** 이름 (실명) */
  name: string
  /** 앱에서 부르는 이름 */
  nickname: string
  email: string
  /** 다니는 고등학교. 고르지 않았으면 null 입니다. (졸업했거나 목록에 없는 경우) */
  school: School | null
  consents: SignupConsents
  /** 동의한 시각 (Date.now() 값) */
  agreedAt: number
}

/**
 * 가입 정보를 저장해 둔 적이 있는지(= 가입 화면을 끝까지 마쳤는지) 알려줍니다.
 * 로그인한 뒤 가입 화면으로 보낼지 홈으로 보낼지 정할 때 씁니다.
 */
export function hasSignupInfo(): boolean {
  return loadData<unknown>(SIGNUP_STORAGE_KEY, null) !== null
}

/**
 * 이름이 규칙에 맞는지 확인합니다. 맞으면 null, 틀리면 화면에 보여줄 안내 문구입니다.
 * 앞뒤 공백은 빼고 셉니다.
 *
 *   getNameError('')       -> '이름을 입력해 주세요.'
 *   getNameError('김')     -> '이름은 2자 이상으로 적어 주세요.'
 *   getNameError('김하늘') -> null
 */
export function getNameError(name: string): string | null {
  const length = name.trim().length

  if (length === 0) return '이름을 입력해 주세요.'
  if (length < NAME_MIN_LENGTH) return `이름은 ${NAME_MIN_LENGTH}자 이상으로 적어 주세요.`
  if (length > NAME_MAX_LENGTH) return `이름은 ${NAME_MAX_LENGTH}자 이하로 적어 주세요.`
  return null
}

// 이메일 모양: "공백·@ 가 아닌 글자들" + @ + "글자들" + . + "글자들"
// 진짜 있는 주소인지까지는 알 수 없고, 오타(@ 빠짐, 점 빠짐)를 걸러내는 정도입니다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 이메일이 규칙에 맞는지 확인합니다. 맞으면 null, 틀리면 화면에 보여줄 안내 문구입니다.
 *
 *   getEmailError('')                  -> '이메일을 입력해 주세요.'
 *   getEmailError('study')             -> '이메일 주소를 다시 확인해 주세요. (예: study@example.com)'
 *   getEmailError('study@example')     -> '이메일 주소를 다시 확인해 주세요. (예: study@example.com)'
 *   getEmailError('study@example.com') -> null
 */
export function getEmailError(email: string): string | null {
  const trimmed = email.trim()

  if (trimmed === '') return '이메일을 입력해 주세요.'
  if (trimmed.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(trimmed)) {
    return '이메일 주소를 다시 확인해 주세요. (예: study@example.com)'
  }
  return null
}

/**
 * 닉네임이 규칙에 맞는지 확인합니다.
 * 맞으면 null, 틀리면 화면에 보여줄 안내 문구를 돌려줍니다.
 * 앞뒤 공백은 빼고 셉니다.
 *
 *   getNicknameError('')              -> '닉네임을 입력해 주세요.'
 *   getNicknameError('   ')           -> '닉네임을 입력해 주세요.'  (공백만 있어도 빈 것)
 *   getNicknameError('가')            -> '닉네임은 2자 이상으로 적어 주세요.'
 *   getNicknameError('공부하는 고양이') -> null
 */
export function getNicknameError(nickname: string): string | null {
  const length = nickname.trim().length

  if (length === 0) return '닉네임을 입력해 주세요.'
  if (length < NICKNAME_MIN_LENGTH) {
    return `닉네임은 ${NICKNAME_MIN_LENGTH}자 이상으로 적어 주세요.`
  }
  if (length > NICKNAME_MAX_LENGTH) {
    return `닉네임은 ${NICKNAME_MAX_LENGTH}자 이하로 적어 주세요.`
  }
  return null
}

/** 필수 동의(서비스 이용약관, 개인정보 수집·이용)를 둘 다 했는지 알려줍니다. 선택 동의는 보지 않습니다. */
export function hasRequiredConsents(consents: SignupConsents): boolean {
  return consents.terms && consents.privacy
}

/** 동의 세 가지를 모두 했는지 알려줍니다. ("전체 동의" 체크 모양을 정할 때 씁니다) */
export function isAllConsented(consents: SignupConsents): boolean {
  return consents.terms && consents.privacy && consents.diaryAnalysis
}

/** "전체 동의" 를 눌렀을 때의 값입니다. 체크하면 셋 다 true, 해제하면 셋 다 false 입니다. */
export function makeAllConsents(isChecked: boolean): SignupConsents {
  return { terms: isChecked, privacy: isChecked, diaryAnalysis: isChecked }
}

/** 가입 화면에 지금 입력해 둔 값입니다. (학교는 안 골라도 되어서 여기에 없습니다) */
export interface SignupForm {
  name: string
  nickname: string
  email: string
  /** 만 14세 이상인지. 아직 안 골랐으면 null, 네 = true, 아니요 = false */
  isOver14: boolean | null
  consents: SignupConsents
}

/**
 * "다음 · 온보딩 시작" 을 누를 수 있는 상태인지 알려줍니다.
 * 세 가지가 모두 맞아야 합니다.
 *  1) 이름·닉네임·이메일이 규칙에 맞는다
 *  2) 만 14세 이상이라고 답했다 (아직 안 골랐으면 null, 아니라고 했으면 false 라서 안 됩니다)
 *  3) 필수 동의 둘을 모두 체크했다
 */
export function canSubmitSignup(form: SignupForm): boolean {
  return (
    getNameError(form.name) === null &&
    getNicknameError(form.nickname) === null &&
    getEmailError(form.email) === null &&
    form.isOver14 === true &&
    hasRequiredConsents(form.consents)
  )
}
