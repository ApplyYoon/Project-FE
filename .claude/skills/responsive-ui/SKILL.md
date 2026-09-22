---
name: responsive-ui
description: 화면을 만들거나 고칠 때 PC와 모바일 양쪽에서 안 깨지게 만드는 규칙입니다. Tailwind 반응형 접두사(sm/md/lg), 그리드·플렉스 배치, 글자 크기, 터치 영역, 가로 스크롤 방지를 다룹니다. UI·레이아웃·CSS·"모바일에서 깨져요"·"반응형" 관련 작업이면 항상 먼저 읽으세요.
---

# 반응형 UI 규칙

이 프로젝트는 **웹과 모바일을 둘 다** 지원합니다. 화면을 만들 때마다 지키세요.

## 1. 모바일 먼저 (Mobile First)

Tailwind 의 `sm:` `md:` `lg:` 는 **"그 크기 이상일 때"** 라는 뜻입니다.
그래서 접두사 없는 클래스가 **모바일 기본값**이 됩니다.

```tsx
<h1 className="text-2xl sm:text-3xl lg:text-4xl">  {/* ✅ 모바일 24px → 넓어지면 커짐 */}
<h1 className="text-4xl sm:text-2xl">              {/* ❌ 거꾸로 생각한 것 */}
```

| 접두사 | 기준 너비 | 대략 어떤 기기          |
| ------ | --------- | ----------------------- |
| (없음) | 0px~      | 휴대폰                  |
| `sm:`  | 640px~    | 큰 휴대폰 가로 / 태블릿 |
| `md:`  | 768px~    | 태블릿                  |
| `lg:`  | 1024px~   | 노트북·PC               |

이 프로젝트는 대부분 `sm:` 하나면 충분합니다. 필요 없는 단계를 억지로 넣지 마세요.

## 2. 자주 쓰는 패턴

**카드 목록** — 모바일 1줄, PC 2~3줄

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

**가로 배치** — 좁으면 알아서 줄바꿈

```tsx
<div className="flex flex-wrap gap-2">
```

**모바일 세로 / PC 가로**

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
```

**여백** — 모바일은 좁게, PC는 넓게

```tsx
<section className="px-4 py-6 sm:px-6 sm:py-10">
```

**모바일에서만 / PC에서만 보이기**

```tsx
<nav className="hidden sm:flex">   {/* PC 에서만 */}
<button className="sm:hidden">     {/* 모바일에서만 */}
```

## 3. 반드시 지킬 것

- **가로 스크롤이 생기면 안 됩니다.**
  - 고정 너비(`w-[500px]`) 대신 `w-full max-w-md` 를 쓰세요.
  - 표·코드블록처럼 진짜 넓어야 하는 것만 `overflow-x-auto` 로 감쌉니다.
  - 긴 영어 단어/URL 이 튀어나오면 `break-words` 를 붙입니다.
- **누르는 것은 최소 40px** (`h-10`). 모바일에서 손가락으로 못 누르면 안 됩니다.
- **이미지는 `max-w-full`.** 원본 크기 그대로 두면 화면을 뚫고 나갑니다.
- 화면 높이를 채울 땐 `h-screen` 대신 `min-h-screen`. (모바일 주소창 때문에 잘립니다)

## 4. 확인 방법

만든 뒤 사용자에게 이렇게 안내하세요.

> 브라우저에서 `F12` → 좌측 상단 📱 아이콘 → iPhone SE 를 골라서 확인해 보세요.
> 제일 작은 화면(375px)에서 안 깨지면 대부분 괜찮습니다.

체크리스트:

- [ ] 375px 너비에서 가로 스크롤이 안 생기는가
- [ ] 글자가 잘리거나 겹치지 않는가
- [ ] 버튼을 손가락으로 누를 만한가
- [ ] PC(1280px)에서 너무 휑하지 않은가 (`max-w-5xl mx-auto` 로 가운데 정렬)
