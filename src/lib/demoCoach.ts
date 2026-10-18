/**
 * 테스트 로그인으로 시연할 때 AI 코치 대신 답하는 "정해진 답" 입니다. (2026-10-18)
 * 테스트 로그인은 서버(진짜 AI)를 쓸 수 없어서, 학생이 쓴 말의 낱말을 보고 미리 써 둔 답을 고릅니다.
 * 화면은 이 답 아래에 꼭 "시연용 정해진 답" 이라고 붙입니다. (AI 인 척하지 않기 위해서)
 *
 *   replyDemo('오늘 너무 피곤해', 재료) -> { text: '피곤한 날엔 목표를 줄이자. …', chips: [▷ 10분으로 줄여서 시작, …], showHelp: false }
 */
import {
  negotiationChipsFor,
  SMALL_START_MINUTES,
  type CoachChip,
  type CoachMessage,
} from '@/lib/coachBriefing'
import { getSafetyBrakeResult } from '@/lib/safetyBrake'
import type { SchoolToday } from '@/lib/schoolToday'
import type { Card } from '@/types'

export interface DemoReply extends CoachMessage {
  /** true 면 위기 표현이라 상담 전화 한 줄을 같이 보여 줍니다. */
  showHelp: boolean
}

export interface DemoContext {
  school: SchoolToday | null
  /** 지금 · 다음에 할 카드. 없으면 undefined */
  card: Card | undefined
}

/** 낱말 중 하나라도 들어 있는지 */
function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

/** 카드가 있으면 그 카드로, 없으면 즉석 카드로 시작하는 칩 */
function startChip(card: Card | undefined): CoachChip {
  return card
    ? { kind: 'startCard', label: '▷ 지금 시작', cardId: card.id }
    : {
        kind: 'startMinutes',
        label: `▷ ${SMALL_START_MINUTES}분 시작`,
        minutes: SMALL_START_MINUTES,
      }
}

/** 시연용 정해진 답을 고릅니다. 위에서부터 먼저 맞는 규칙 하나를 씁니다. */
export function replyDemo(studentText: string, context: DemoContext): DemoReply {
  const text = studentText.trim()

  // 위기 표현은 어떤 규칙보다 먼저 봅니다. 공부 이야기는 멈추고 상담 전화 한 줄을 보여 줍니다.
  const brake = getSafetyBrakeResult({
    now: new Date(),
    recentTexts: [text],
    recentMoods: [],
    exams: [],
  })
  if (brake.stopWhip) {
    return {
      text: '말해 줘서 고마워. 지금 많이 힘들구나. 공부 이야기는 잠시 멈출게. 믿을 수 있는 어른에게 꼭 이야기해 줘.',
      chips: [],
      showHelp: true,
    }
  }

  // 핑계 협상: 목표를 줄여서라도 시작하게 합니다.
  const negotiation = negotiationChipsFor(text)
  if (hasAny(text, ['피곤', '졸려', '힘들'])) {
    return {
      text: `피곤한 날엔 목표를 줄이자. 다 하려고 하지 말고 ${SMALL_START_MINUTES}분만, 문제 3개만 풀어 보는 거 어때? 시작만 하면 반은 한 거야.`,
      chips: negotiation,
      showHelp: false,
    }
  }
  if (hasAny(text, ['시간 없', '시간이 없', '바빠'])) {
    return {
      text: `바쁜 날일수록 딱 ${SMALL_START_MINUTES}분만 하자. 오늘 수업에서 제일 헷갈렸던 개념 하나만 다시 보는 거야.`,
      chips: negotiation,
      showHelp: false,
    }
  }
  if (hasAny(text, ['하기 싫', '귀찮', '싫어'])) {
    return {
      text: '하기 싫은 날이 제일 중요해. 5분만 해 보고 그래도 싫으면 그만둬도 돼. 약속할게.',
      chips: [
        { kind: 'startMinutes', label: '▷ 5분만 해 볼게', minutes: 5 },
        ...negotiation.slice(1),
      ],
      showHelp: false,
    }
  }
  if (hasAny(text, ['쉴래', '쉬고', '쉴게'])) {
    return {
      text: '좋아, 쉬는 것도 계획이야. 대신 내일 아침에 내가 먼저 물어볼게. 푹 쉬어!',
      chips: [{ kind: 'say', label: '아니다, 10분만 할래' }],
      showHelp: false,
    }
  }
  if (hasAny(text, ['급식', '점심', '배고', '밥'])) {
    const lunch = context.school?.meals.find((meal) => meal.date === context.school?.date)
    const menu = lunch ? lunch.dishes.slice(0, 3).join(', ') : '오늘 급식 정보는 아직 없어'
    return {
      text: `오늘 점심은 ${menu}! 든든하게 먹고 와서 15분만 복습하자.`,
      chips: [startChip(context.card)],
      showHelp: false,
    }
  }
  if (hasAny(text, ['시험', '중간', '기말', '모의'])) {
    const exam = context.school?.events.find((event) => event.exam)
    return {
      text: exam
        ? `${exam.name}까지 D-${exam.dDay}. 오늘 할 범위를 카드로 만들어 두면 매일 내가 챙겨 줄게.`
        : '아직 30일 안에 시험은 없어. 지금 쌓아 두면 시험 때 편해져.',
      chips: [{ kind: 'newCard', label: '카드 만들기' }, startChip(context.card)],
      showHelp: false,
    }
  }
  // '못 했어' · '일부만 했어' 에도 '했어' 가 들어 있어서, '다 했어' 보다 먼저 봅니다.
  if (hasAny(text, ['일부', '조금', '못 했', '못했'])) {
    return {
      text: '괜찮아, 시작한 게 중요해. 뭐 때문에 멈췄는지 하나만 골라 줄래? 다음엔 그걸 피해서 짜 볼게.',
      chips: [
        { kind: 'say', label: '폰을 봤어' },
        { kind: 'say', label: '너무 어려웠어' },
        { kind: 'say', label: '피곤했어' },
      ],
      showHelp: false,
    }
  }
  if (hasAny(text, ['다 했', '했어', '끝냈'])) {
    return {
      text: '잘했어! 오늘 한 만큼 기록에 쌓였어. 내일도 이 시간에 내가 먼저 말 걸게.',
      chips: [],
      showHelp: false,
    }
  }
  if (hasAny(text, ['폰', '어려웠'])) {
    return {
      text: '알려 줘서 고마워. 다음 세션은 폰을 엎어 두고 10분만 해 보자. 들면 내가 바로 알려 줄게.',
      chips: [startChip(context.card)],
      showHelp: false,
    }
  }
  if (hasAny(text, ['좋아', '시작', '할래', '할게', '응'])) {
    return {
      text: '좋아! 타이머 켜고 폰은 엎어 두자. 끝나면 결과 들고 와.',
      chips: [startChip(context.card)],
      showHelp: false,
    }
  }
  return {
    text: '그렇구나. 그럼 오늘 할 공부 하나만 정해 볼까? 제일 작은 것부터.',
    chips: [startChip(context.card), { kind: 'say', label: '오늘은 쉴래' }],
    showHelp: false,
  }
}
