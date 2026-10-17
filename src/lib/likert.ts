/**
 * 리커트 7점 척도의 글자 (1 전혀 아니다 ~ 7 매우 그렇다). 심리검사(OnboardingPsychTestPage)가 씁니다.
 * (예전에는 생각 습관 테스트(lib/thinkingTest.ts)에 같이 있었는데, 그 테스트를 #417 에서 지워서 따로 뺐습니다)
 */
export const likertLabels = [
  '전혀 아니다',
  '아니다',
  '약간 아니다',
  '보통이다',
  '약간 그렇다',
  '그렇다',
  '매우 그렇다',
] as const
