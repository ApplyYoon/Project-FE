---
name: new-page
description: 이 프로젝트에 새 화면(페이지)을 추가할 때 사용합니다. 페이지 컴포넌트 파일을 만들고 React Router 에 주소를 연결하고 헤더 메뉴까지 이어줍니다. "~~ 페이지 만들어줘", "화면 추가", "주소 추가", "라우터에 연결" 같은 요청에서 쓰세요.
---

# 새 페이지 추가하기

## 0. 시안 먼저 보기

[`docs/design/README.md`](../../../docs/design/README.md) 에서 만들 화면을 찾아,
데스크톱·모바일 그림(`docs/design/screens/<화면>-desktop.png`, `<화면>-mobile.png`)을 **둘 다 Read 로 열어** 봅니다.

- 시안의 카드 순서·문구·버튼 배치를 따릅니다. 그림 속 숫자는 예시라서 가짜 데이터(`src/lib/mock.ts`)로 바꿉니다.
- 시안이 없는 화면은 README 의 "시안이 없는 화면" 표에서 참고할 화면을 찾습니다.
- 시안과 이 스킬·CLAUDE.md 규칙이 부딪히면 **규칙이 이깁니다.** (예: 버튼은 최소 `h-10`)

## 1. 무엇을 만들지 확인

사용자에게 한 번에 하나씩만 물어보세요. (이미 답이 있으면 묻지 않습니다)

- 화면 이름이 뭔가요? (예: 할 일 목록)
- 주소는 뭐로 할까요? (예: `/todo`)
- 헤더 메뉴에도 넣을까요?

## 2. 페이지 파일 만들기

`src/pages/XxxPage.tsx` — PascalCase, `Page` 로 끝나게. **named export** 로.

```tsx
import { Card } from '@/components/ui/Card'

export function TodoPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">할 일</h1>
      {/* 여기에 내용 */}
    </div>
  )
}
```

규칙:

- 바깥을 `<div>` 하나로 감싸고 `flex flex-col gap-*` 로 세로 간격을 줍니다.
- 제목은 `text-2xl sm:text-3xl` 처럼 **모바일 기준 → sm: 로 키우기**.
- 페이지 자체에는 좌우 여백을 주지 마세요. `Layout` 이 이미 주고 있습니다.
- 화면 조각이 커지면 `src/components/` 로 빼고, 이 페이지에서만 쓰는 건 그대로 둡니다.

## 3. 라우터에 연결 (이걸 빼먹으면 화면이 안 나옵니다)

`src/router.tsx` 에서 `element: <RequireAuth />` 가 달린 `children` 배열(로그인해야 볼 수 있는 곳)에 한 줄 추가:

```tsx
{ path: 'todo', element: <TodoPage /> },
```

로그인·회원가입처럼 **로그인 없이 열려야 하는 화면**만 `RequireAuth` 바깥(`login`, `signup` 옆)에 넣습니다.
헷갈리면 사용자에게 "로그인 안 한 사람도 봐야 하는 화면인가요?" 라고 한 번 물어보세요.

⚠️ `{ path: '*', element: <NotFoundPage /> }` 는 **항상 맨 마지막**에 있어야 합니다.
그 뒤에 추가하면 새 페이지가 404로 빠집니다.

import 도 함께 추가하세요: `import { TodoPage } from '@/pages/TodoPage'`

## 4. 헤더 메뉴 (필요할 때만)

`src/components/layout/Header.tsx` 의 `navItems` 배열에 추가:

```tsx
{ to: '/todo', label: '할 일' },
```

## 5. 확인

```bash
pnpm run typecheck && pnpm run build
```

그리고 사용자에게 알려주세요.

> `/todo` 주소로 할 일 페이지를 만들었어요.
> `pnpm run dev` 로 서버를 켜고 http://localhost:5173/todo 에서 확인해 보세요.
