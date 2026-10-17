import type { MissReason } from '@/types'

/**
 * "왜 못 했는지" 를 고르는 버튼 7개의 이름표입니다. 버튼은 이 순서대로 보입니다.
 *
 * 체크인의 "어제 계획을 다 못 채웠어. 왜 그랬어?" (MissReasonPicker) 에서 씁니다.
 * (옛 타이머의 "목표 전에 그만둔 이유" 도 같은 값이라, 지난 기록과 한꺼번에 셀 수 있습니다)
 * 같은 값으로 저장해야 나중에 "어떤 이유로 자주 멈추는지" 를 한꺼번에 셀 수 있습니다.
 */
export const missReasonOptions: { key: MissReason; label: string }[] = [
  { key: 'tired', label: '피곤·수면' },
  { key: 'event', label: '약속·행사' },
  { key: 'phone', label: '폰·SNS' },
  { key: 'tooMuch', label: '계획 과다' },
  { key: 'unwilling', label: '하기 싫음' },
  { key: 'sick', label: '아픔' },
  { key: 'etc', label: '기타' },
]
