import { queryOptions } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { CONSENT_VERSION } from '@/lib/signup'

/**
 * 개인정보 동의 상태를 보고, 최신 동의 문구에 다시 동의합니다. (#512, BE docs/API.md 「개인정보 동의」)
 *
 *   내 동의 상태  GET  /auth/consent                                                -> 200 { currentVersion, agreedVersion, agreedAt, needsConsent }
 *   다시 동의하기 POST /auth/consent { terms, privacy, over14, version }              -> 201 (같은 모양, needsConsent: false)
 *
 * 서버는 최신 문구에 동의하지 않은 사람의 저장(POST · PUT · PATCH)을 모두 403 CONSENT_REQUIRED 로 막습니다.
 * 그러면 lib/api.ts 가 알리고, 다시 동의 화면(pages/ConsentPage.tsx)이 열립니다.
 */

/** 다시 동의 화면의 주소 */
export const CONSENT_PATH = '/consent'

/** 내 동의 상태 */
export interface ConsentStatus {
  /** 서버가 지금 받고 있는 동의 문구의 버전 (예: 'v1') */
  currentVersion: string
  /** 내가 마지막으로 동의한 문구의 버전. 동의한 적이 없으면 null */
  agreedVersion: string | null
  /** 내가 마지막으로 동의한 시각 (밀리초 숫자). 동의한 적이 없으면 null */
  agreedAt: number | null
  /** true 면 최신 문구에 다시 동의해야 저장할 수 있습니다 */
  needsConsent: boolean
}

/** 서버가 준 값이 약속한 모양이 맞는지 확인합니다. (서버 응답도 그대로 믿지 않고 확인합니다) */
function isConsentStatus(value: unknown): value is ConsentStatus {
  if (typeof value !== 'object' || value === null) return false
  const status = value as Record<string, unknown>
  return (
    typeof status.currentVersion === 'string' &&
    (status.agreedVersion === null || typeof status.agreedVersion === 'string') &&
    (status.agreedAt === null || typeof status.agreedAt === 'number') &&
    typeof status.needsConsent === 'boolean'
  )
}

/** 서버가 준 값을 확인해서 돌려줍니다. 모양이 틀리면 502 로 던집니다. */
function readConsentStatus(result: unknown): ConsentStatus {
  if (!isConsentStatus(result)) throw new ApiError('서버 응답 모양이 올바르지 않습니다', 502)
  return result
}

async function fetchConsentStatus(): Promise<ConsentStatus> {
  return readConsentStatus(await api<unknown>('/auth/consent'))
}

/**
 * 내 동의 상태의 쿼리 설정입니다. 화면에서는 useSuspenseQuery(consentStatusQuery()) 로 받아옵니다.
 * 동의 화면을 열 때마다 새로 받아옵니다. (staleTime 0: 다른 기기에서 동의했을 수도 있어서)
 */
export function consentStatusQuery() {
  return queryOptions({
    queryKey: ['auth-consent'],
    queryFn: fetchConsentStatus,
    staleTime: 0,
  })
}

/**
 * 이 앱에 들어 있는 동의 문구(lib/terms.ts)가 서버가 받는 버전과 같은지 알려줍니다.
 * 다르면 앱이 옛 버전이라, 새로 고쳐서 최신 문구를 받아야 동의할 수 있습니다.
 *
 *   isSameConsentVersion({ currentVersion: 'v1', … })  -> true   (CONSENT_VERSION 이 'v1' 일 때)
 *   isSameConsentVersion({ currentVersion: 'v2', … })  -> false
 */
export function isSameConsentVersion(status: ConsentStatus): boolean {
  return status.currentVersion === CONSENT_VERSION
}

/**
 * 최신 문구에 다시 동의합니다. 필수 셋(이용약관 · 개인정보 · 고등학생(만 14세 이상))은 화면에서 모두 체크해야 부릅니다.
 * 실패하면 ApiError 를 던집니다. 409 는 "문구가 바뀜" 또는 "이미 동의함" 이라, 부르는 쪽에서 상태를 다시 받아 봅니다.
 */
export async function agreeConsent(): Promise<ConsentStatus> {
  const result = await api<unknown>('/auth/consent', {
    method: 'POST',
    body: JSON.stringify({ terms: true, privacy: true, over14: true, version: CONSENT_VERSION }),
  })
  return readConsentStatus(result)
}

/**
 * 동의한 뒤에 돌아갈 주소를 주소창의 ?from= 값에서 고릅니다. 이상한 값이면 홈('/')입니다.
 * 다른 사이트로 보내지 않도록, 이 앱 안의 주소('/' 로 시작, '//' 는 안 됨)만 받습니다.
 *
 *   getConsentReturnPath('/cards/new?date=2026-10-17') -> '/cards/new?date=2026-10-17'
 *   getConsentReturnPath('//evil.com')                 -> '/'
 *   getConsentReturnPath('/consent')                   -> '/'   (다시 동의 화면으로 돌아가면 제자리)
 *   getConsentReturnPath(null)                         -> '/'
 */
export function getConsentReturnPath(from: string | null): string {
  if (from === null || !from.startsWith('/') || from.startsWith('//')) return '/'
  if (from === CONSENT_PATH || from.startsWith(`${CONSENT_PATH}?`)) return '/'
  return from
}
