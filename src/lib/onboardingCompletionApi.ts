/**
 * 온보딩을 마쳤다는 것을 서버(BE)에 알리는 함수입니다. (BE 저장소 docs/API.md "온보딩 마침 표시", BE PR #300)
 *
 *   POST /onboarding/completion  (본문 없음)  -> 200 { id, name, onboarded: true }   여러 번 불러도 같음
 *
 * ■ 왜 보내나요? 온보딩을 어디까지 했는지는 이 기기에만 적혀 있어서, 이미 가입한 사람도 다른 기기에서 로그인하면
 *   온보딩을 처음부터 다시 했습니다. 서버가 기억해 두면 다른 기기에서 로그인할 때 user.onboarded 로 알려 줍니다. (LoginPage)
 * ■ 보낸 뒤에는 "서버가 마쳤다고 안다" 를 이 기기에 적어서 다시 보내지 않습니다. (lib/onboardingProgress.ts)
 * ■ 못 보내면 다음에 앱을 열 때 다시 보냅니다. (hooks/useOnboardingCompletionSync.ts)
 * ■ 테스트 로그인(서버가 모르는 가짜 토큰)일 때는 부르지 않습니다. 부르는 쪽이 isServerDataToken 으로 거릅니다.
 */
import { api } from '@/lib/api'
import { markOnboardingDoneOnServer } from '@/lib/onboardingProgress'

/** 서버 응답을 기다리는 최대 시간(밀리초) */
const REQUEST_TIMEOUT_MS = 10000

/** 온보딩 마침 표시를 서버에 보내고, 보냈다고 이 기기에 적습니다. 실패하면 에러를 던집니다. */
export async function sendOnboardingCompletion(): Promise<void> {
  await api<unknown>('/onboarding/completion', {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  markOnboardingDoneOnServer()
}
