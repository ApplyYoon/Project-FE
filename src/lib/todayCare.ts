import type { CareLevel } from '@/lib/careTheme'

/**
 * 오늘 화면에 쓸 관리 강도와 독설 허용 수위를 돌려줍니다.
 * 통화 화면들(수신·통화 중)이 이 함수만 부르게 해서, 나중에 진짜 값으로 바꿀 곳을 한 군데로 모았습니다.
 *
 * ⚠️ 아직 진짜 값이 없어서 고정값입니다. 아래 입력이 준비되면 바꿉니다.
 */

/**
 * 오늘의 관리 강도 (0~3).
 * TODO(#28): getCareLevel({ yesterdayLevel, branch, maxLevel, isSafetyBrakeOn }) 의 결과로 바꾸기
 *   - yesterdayLevel: 어제 단계를 저장해 둔 곳이 아직 없습니다
 *   - branch: 어제 결과 분기(#91)가 아직 없습니다
 *   - maxLevel: getCareLimits().maxCareLevel (#59)
 *   - isSafetyBrakeOn: 안전 브레이크 판정(#95)이 아직 없습니다
 * (getCareLevel 은 0~4 를 돌려주는데 색 테마는 0~3 까지만 있어서, 4 는 집중 모드 화면(#69)으로 보내거나 맞춰야 합니다)
 */
export function getTodayCareLevel(): CareLevel {
  return 1
}

/**
 * 사용자가 허용한 독설 수위 (1~5).
 * TODO(#59): getCareLimits().maxHarshness 로 바꾸기 (설정 화면 PR #127 이 merge 된 뒤)
 * 3 은 설정 화면의 처음 값과 같습니다.
 */
export function getTodayMaxHarshness(): number {
  return 3
}
