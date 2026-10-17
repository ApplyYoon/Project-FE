import type { MissReason } from '@/types'

/**
 * "왜 못 했는지" 이유 7개의 이름표입니다. (체크인 · 통화의 못 채운 이유, 옛 타이머의 그만둔 이유가 같은 값입니다)
 * 고르는 화면(옛 체크인 · 옛 타이머)은 #417 에서 지웠고, 지금은 저장된 값을 읽고 글자로 보여 줄 때 씁니다. (sessionsApi · calendarDay)
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
