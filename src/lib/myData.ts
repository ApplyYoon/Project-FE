import { removeData } from '@/lib/storage'

/**
 * "내 데이터 삭제" 가 무엇을 지우는지 한 곳에 모아 둔 파일입니다. (설정 화면의 "내 데이터 관리")
 *
 * 저장하는 새 기능을 만들면 그 저장 키를 여기에 꼭 추가하세요.
 * 안 그러면 "모든 기록 지우기" 를 눌러도 그 데이터가 남습니다.
 */

/** 일기 데이터의 저장 키. (일기 #63, 성찰 일기 #70) */
const DIARY_KEYS = ['diary', 'reflection-entries']

/**
 * 모든 기록의 저장 키 = 공부 계획 · 공부 기록 · 타이머 기록 · 딴짓 기록 · 일기
 * 아직 없는 기능의 키도 미리 적어 둡니다. (없는 키를 지우는 건 아무 일도 안 일어납니다)
 *
 * 일부러 넣지 않은 것(= 지우지 않고 남김)
 *   subjects    과목. 기록이 아니라 내가 정한 설정이라 남깁니다.
 *   timer-mode  스톱워치·뽀모도로 중 고른 공부 방식. 이것도 설정입니다.
 *   onboarding-answers  온보딩 설문 답. 기록이 아니라 내 정보이고, 지우면 설문을 처음부터 다시 하게 되어서 남깁니다.
 *   signup-info  가입 때 정한 닉네임과 동의 내역. 기록이 아니라 계정 정보이고, 동의한 기록은 남겨 두어야 해서 남깁니다.
 *   auth        로그인 정보. 지우면 로그아웃되어 버립니다.
 */
const RECORD_KEYS = [
  'plans',
  'sessions',
  'timer',
  'timer-subject',
  // 딴짓(탭 이탈) 기록과, 나갔다가 아직 돌아오지 않은 임시 기록 (#22)
  'away-records',
  'away-pending',
  ...DIARY_KEYS,
]

/** diary: 일기만 / all: 모든 기록 */
export type DeleteKind = 'diary' | 'all'

export interface DeleteResult {
  /** 전부 실제로 사라졌으면 true */
  isSuccess: boolean
  /** 지우지 못한 키 이름들 (성공이면 빈 배열) */
  failedKeys: string[]
}

/**
 * 내 데이터를 지우고, 정말 사라졌는지 확인한 결과를 돌려줍니다.
 *
 *   const { isSuccess } = deleteMyData('diary')
 */
export function deleteMyData(kind: DeleteKind): DeleteResult {
  const keys = kind === 'diary' ? DIARY_KEYS : RECORD_KEYS

  // 하나가 실패해도 나머지는 계속 지웁니다. (일부만 지워진 채로 멈추지 않게)
  const failedKeys = keys.filter((key) => !removeData(key))

  return { isSuccess: failedKeys.length === 0, failedKeys }
}
