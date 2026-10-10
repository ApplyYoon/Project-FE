/**
 * 관리 강도(0~3)에 따라 통화 화면의 색·아바타·인사말이 바뀌게 하는 데이터입니다.
 * (4 강제적 채찍은 화면이 따로 있어서 여기에 없습니다 → #69)
 *
 * 아직 #78 의 CareLevel 타입이 없어서 임시로 여기서 정의합니다. 생기면 그쪽을 가져다 쓰세요.
 */
export type CareLevel = 0 | 1 | 2 | 3

export interface CareTheme {
  /** 단계 이름 (예: '당근') */
  name: string
  /** 화면 전체 배경 (Tailwind 는 완성된 클래스 이름만 읽어서, 조각을 붙이지 않고 통째로 적습니다) */
  pageBackground: string
  /** 아바타 동그라미 색 */
  avatarBackground: string
  /** 아바타 바깥 숨쉬는 동그라미 색 */
  avatarGlow: string
  /** 아바타 표정 */
  avatarEmoji: string
  /** 스크린 리더(화면을 읽어 주는 프로그램)용 표정 설명 */
  avatarLabel: string
}

// 색은 모두 어두운 배경 + 흰 글씨 기준입니다. (통화 화면은 글씨가 흰색)
export const careThemes: Record<CareLevel, CareTheme> = {
  0: {
    name: '회복',
    pageBackground: 'bg-teal-950',
    avatarBackground: 'bg-teal-600',
    avatarGlow: 'bg-teal-400/30',
    avatarEmoji: '😌',
    avatarLabel: '편안한 표정',
  },
  1: {
    name: '당근',
    pageBackground: 'bg-amber-950',
    avatarBackground: 'bg-amber-500',
    avatarGlow: 'bg-amber-300/30',
    avatarEmoji: '😄',
    avatarLabel: '기분 좋은 표정',
  },
  2: {
    name: '넛지',
    pageBackground: 'bg-slate-900',
    avatarBackground: 'bg-brand',
    avatarGlow: 'bg-indigo-500/30',
    avatarEmoji: '🙂',
    avatarLabel: '차분한 표정',
  },
  3: {
    name: '심리적 채찍',
    pageBackground: 'bg-rose-950',
    avatarBackground: 'bg-rose-700',
    avatarGlow: 'bg-rose-400/30',
    avatarEmoji: '😐',
    avatarLabel: '굳은 표정',
  },
}

/*
 * 단계별 첫 인사말입니다. 이 중 하나가 랜덤으로 나옵니다.
 *
 * 문구 규칙 (이슈 #32)
 * - 외모·성적·능력을 깎아내리는 말, 다른 사람과 비교하는 말은 쓰지 않습니다.
 * - 3단계는 #59 "독설 허용 수위(1~5)" 설정이 아직 없어서, 가장 순한 수준만 골랐습니다.
 *   수위 설정이 생기면 문구마다 수위를 달아서 그 이하만 고르게 바꿔야 합니다.
 * - 숫자(40분, 10분 등)는 예시입니다. 실제 기록을 연결하면 그 값으로 바꿉니다.
 */
export const careGreetings: Record<CareLevel, string[]> = {
  0: ['오늘은 10분만 해볼까?', '괜찮아, 천천히 시작하자.', '오늘은 가볍게 한 가지만 해보자.'],
  1: [
    '어제보다 첫 시작이 40분 빨랐어!',
    '어제 계획을 거의 다 해냈네, 잘했어!',
    '꾸준히 하는 모습이 보기 좋아.',
  ],
  2: ['계획 시간 10분 지났어', '오늘 첫 계획 시작할 시간이야.', '타이머 켤 시간이야.'],
  3: [
    '오늘 계획, 아직 시작 전이네.',
    '요즘 계속 미뤄지는 것 같아서 걱정돼.',
    '계획이 3일째 그대로야. 오늘도 미룰 거야?',
    '독촉이 안 통하는 것 같으니 당분간 연락 안 할게.',
  ],
}

/** 그 단계의 인사말 중 하나를 랜덤으로 고릅니다. (random 은 테스트할 때 값을 고정하려고 받습니다) */
export function pickGreeting(level: CareLevel, random: () => number = Math.random) {
  const greetings = careGreetings[level]
  return greetings[Math.floor(random() * greetings.length)]
}
