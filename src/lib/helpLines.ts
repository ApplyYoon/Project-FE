/**
 * 힘들 때 도움받을 수 있는 상담 전화 목록입니다. (#96)
 * 도움 안내 화면(/support)과 설정 화면의 "힘들 때 도움받기" 카드가 같이 씁니다.
 *
 * ⚠️ 문구와 연결처는 Tmax-IT-Hope-School/Project#8 전문가 검토 후 확정합니다.
 * 바뀌면 이 목록만 고치면 두 화면이 같이 바뀝니다.
 */
export interface HelpLine {
  /** 상담 이름 (예: '청소년상담') */
  name: string
  /** 전화번호. tel: 링크에 그대로 씁니다. */
  number: string
  /** 번호 아래에 붙이는 한 줄 설명 */
  detail: string
}

export const helpLines: HelpLine[] = [
  { name: '청소년상담', number: '1388', detail: '24시간 · 무료 · 비밀 보장' },
  { name: '자살예방상담', number: '109', detail: '24시간 · 무료 · 비밀 보장' },
]

/** 도움 안내 화면의 주소. 안전 브레이크가 켜졌을 때 이리로 보냅니다. */
export const SUPPORT_PATH = '/support'
