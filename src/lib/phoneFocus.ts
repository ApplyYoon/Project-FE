/**
 * "휴대폰 집중 모드 켜는 법" 안내 화면(#106)에서 쓰는 데이터와 저장 함수입니다.
 *
 * 웹은 다른 앱을 잠글 수 없어서, 사용자가 휴대폰 기본 기능(스크린 타임·집중 모드·디지털 웰빙)으로
 * 직접 잠그게 안내합니다. 실제로 막는 건 휴대폰이고, 우리는 "켰는지"를 본인 답변으로만 기록합니다.
 * (정말 켰는지는 확인할 수 없습니다)
 *
 * ⚠️ 휴대폰 메뉴 이름은 기종·OS 버전마다 조금씩 달라서, 아래 문구는 바뀔 수 있습니다.
 * 바뀌면 이 파일의 문구만 고치면 안내 화면이 같이 바뀝니다.
 */
import { loadData, saveData } from '@/lib/storage'

/** 안내 화면의 주소. 설정 화면의 "휴대폰 집중 모드" 카드가 이리로 연결합니다. */
export const PHONE_FOCUS_PATH = '/phone-focus'

/** 안내를 나누는 휴대폰 종류 */
export type PhoneKind = 'iphone' | 'galaxy'

/** 잠그는 방법 하나. 제목과, 순서대로 따라 하는 단계 목록입니다. */
export interface PhoneFocusMethod {
  title: string
  /** 한 단계씩 따라 할 수 있는 문장들 */
  steps: string[]
}

export interface PhoneFocusGuide {
  kind: PhoneKind
  /** 탭에 보이는 이름 */
  label: string
  /** 설정 앱에서 메뉴가 안 보일 때 검색할 낱말 */
  searchWord: string
  methods: PhoneFocusMethod[]
}

export const phoneFocusGuides: PhoneFocusGuide[] = [
  {
    kind: 'iphone',
    label: '아이폰',
    searchWord: '스크린 타임',
    methods: [
      {
        title: '앱 시간 제한',
        steps: [
          '설정 앱을 열고 "스크린 타임" 을 눌러요. (처음이면 "스크린 타임 켜기" 부터 해요)',
          '"앱 제한" → "제한 추가" 를 눌러요.',
          '잠그고 싶은 앱(SNS·게임 등)을 골라 "다음" 을 눌러요.',
          '하루에 쓸 시간(예: 30분)을 정하고 "추가" 를 눌러요.',
        ],
      },
      {
        title: '집중 모드',
        steps: [
          '설정 앱에서 "집중 모드" 를 눌러요.',
          '오른쪽 위 "+" 를 눌러 새 집중 모드(예: 공부)를 만들어요.',
          '알림을 받을 사람과 앱만 골라요. 나머지는 조용해져요.',
          '"일정 설정" 에서 공부 시간을 정하면 그 시간에 자동으로 켜져요.',
        ],
      },
    ],
  },
  {
    kind: 'galaxy',
    label: '갤럭시',
    searchWord: '디지털 웰빙',
    methods: [
      {
        title: '앱 타이머',
        steps: [
          '설정 앱에서 "디지털 웰빙 및 자녀 보호 기능" 을 눌러요.',
          '"앱 타이머" 를 눌러요. (대시보드의 앱 옆 모래시계에서도 정할 수 있어요)',
          '잠그고 싶은 앱을 골라 하루에 쓸 시간(예: 30분)을 정해요.',
          '시간이 다 되면 그 앱이 꺼지고 회색으로 바뀌어요.',
        ],
      },
      {
        title: '집중 모드',
        steps: [
          '설정 앱에서 "디지털 웰빙 및 자녀 보호 기능" 을 눌러요.',
          '"집중 모드" 를 눌러요. (최신 버전에서는 "모드 및 루틴" 안의 집중 모드로 옮겨졌을 수 있어요)',
          '공부하는 동안 쓰지 않을 앱을 골라요.',
          '요일과 시간을 정하면 그 시간에 자동으로 켜져요.',
        ],
      },
    ],
  },
]

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-phone-focus-enabled' 가 됩니다)
// 기록이 아니라 내가 정한 설정이라 "모든 기록 지우기" 로는 지우지 않습니다. (src/lib/myData.ts 참고)
const ENABLED_KEY = 'phone-focus-enabled'

/**
 * 체크인에서 "어제 휴대폰 집중 모드 켰어?" 를 물을지 알려줍니다.
 * 안내 화면에서 "체크인에서 확인받기" 를 켠 사람만 true 입니다. (저장된 값이 깨져 있으면 false)
 */
export function getPhoneFocusEnabled(): boolean {
  return loadData<unknown>(ENABLED_KEY, false) === true
}

/** "체크인에서 확인받기" 를 켜거나 끕니다. */
export function setPhoneFocusEnabled(isEnabled: boolean): void {
  saveData(ENABLED_KEY, isEnabled)
}
