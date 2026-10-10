import { getCareLimits } from '@/lib/careLimits'
import { getCareLevelInfo } from '@/lib/careLevelInfo'
import type { CareLevel } from '@/lib/careTheme'

/**
 * 오늘 화면에 쓸 관리 강도와 독설 허용 수위를 돌려줍니다.
 * 통화 화면들(수신·통화 중)이 이 함수만 부르게 해서, 나중에 진짜 값으로 바꿀 곳을 한 군데로 모았습니다.
 *
 * - 독설 허용 수위: 사용자가 설정 화면에서 정한 값을 씁니다. (#59)
 * - ⚠️ 관리 강도: 아직 진짜 계산이 없어서 기본 단계(1)에서 시작합니다. 다만 사용자가 정한 최대 한도는 넘지 않습니다.
 *   아래 입력이 준비되면 진짜 계산으로 바꿉니다.
 */

// 진짜 계산이 붙기 전까지 쓰는 오늘의 기본 단계 (1 = 당근)
const DEFAULT_TODAY_CARE_LEVEL: CareLevel = 1

/**
 * 오늘의 관리 강도 (0~3).
 * TODO(#28): getCareLevel({ yesterdayLevel, action, maxLevel, isSafetyBrakeOn }) 의 결과로 바꾸기
 *   - yesterdayLevel: 어제 단계를 저장해 둔 곳이 아직 없습니다
 *   - action: #91 decideCareAction 결과의 action(CareAction)을 그대로 넣으면 됩니다. 다만 decideCareAction 에
 *     넣을 기록(체크인 #24, 이행 체크 #65)이 아직 없습니다
 *   - maxLevel: getCareLimits().maxCareLevel (#59)
 *   - isSafetyBrakeOn: getSafetyBrakeResult(#95) 결과로 brake.stopWhip || brake.recoveryMode. 다만 넣을 기록(최근 글·기분·시험)이 아직 없습니다
 * (getCareLevel 은 0~4 를 돌려주는데 색 테마는 0~3 까지만 있어서, 4 는 집중 모드 화면(#69)으로 보내거나 맞춰야 합니다)
 */
export function getTodayCareLevel(): CareLevel {
  // 설정에서 정한 최대 한도를 넘지 않게 맞춥니다. 한도가 0(회복)이면 오늘도 0 입니다.
  // ("정한 한도는 절대 넘지 않아요" 라고 설정 화면에서 약속했기 때문입니다)
  // 통화·홈 화면이 열릴 때 부르는 함수라서, 저장된 값이 깨져 있어도 에러를 내지 않고 기본 단계를 돌려줍니다.
  try {
    const maxLevel = getCareLimits().maxCareLevel
    return maxLevel < DEFAULT_TODAY_CARE_LEVEL ? 0 : DEFAULT_TODAY_CARE_LEVEL
  } catch {
    return DEFAULT_TODAY_CARE_LEVEL
  }
}

/**
 * 왜 지금 이 관리 모드인지 알려 주는 한 줄을 돌려줍니다. (#94, 홈의 "지금 관리 모드" 배너)
 *
 * ⚠️ 지금은 단계별 기본 문구입니다. 진짜 이유는 #91 decideCareAction 이 돌려주는 reason 이어야 하는데,
 * 거기에 넣을 기록(개선안 이행 #65, 효과 판정 #92, 기분)을 아직 모아 주는 곳이 없습니다. (#205 에서 연결)
 * 연결되면 이 함수가 decideCareAction(...).reason 을 먼저 쓰고, 없을 때만 기본 문구를 쓰도록 바꾸세요.
 */
export function getTodayCareReason(level: CareLevel): string {
  return getCareLevelInfo(level).defaultReason
}

// 저장된 값을 읽지 못할 때 쓰는 수위입니다. 설정 화면의 처음 값(careLimits.ts 의 기본값)과 같습니다.
const DEFAULT_MAX_HARSHNESS = 3

/**
 * 사용자가 허용한 독설 수위 (1~5). 설정 화면에서 정한 값입니다. (#59)
 * 아직 한 번도 설정하지 않았으면 설정 화면의 처음 값(3)이 나옵니다.
 *
 * 통화 화면이 열릴 때 부르는 함수라서, 저장된 값이 깨져 있어도 에러를 내지 않고 기본값(3)을 돌려줍니다.
 */
export function getTodayMaxHarshness(): number {
  try {
    const value = getCareLimits().maxHarshness
    return Number.isFinite(value) ? value : DEFAULT_MAX_HARSHNESS
  } catch {
    return DEFAULT_MAX_HARSHNESS
  }
}
