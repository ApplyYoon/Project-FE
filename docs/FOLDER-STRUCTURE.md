# 폴더 구조 설계 (`src/`)

"이 파일 어디에 만들지?" 를 고민하지 않게 하려고 만든 문서입니다.
**새 파일을 만들기 전에 이 문서를 보세요.**

---

## 1. 한눈에 보기

```
src/
│
├── main.tsx              🚪 시작점. React를 index.html 에 붙입니다.       거의 안 건드림
├── App.tsx               라우터를 켜주는 껍데기.                          거의 안 건드림
├── index.css             🎨 전역 스타일 + 색/폰트 정의 (@theme)
├── router.tsx            🗺 주소 ↔ 페이지 연결표    ← 페이지 추가할 때 꼭 수정
│
├── pages/                📄 화면 하나 = 파일 하나 (주소가 있는 것)
│   ├── HomePage.tsx          /        홈
│   ├── AboutPage.tsx         /about   소개
│   └── NotFoundPage.tsx      없는 주소로 들어왔을 때 (404)
│
├── components/           🧩 화면 조각
│   ├── ui/                   어디서나 쓰는 작은 조각
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Card.tsx
│   └── layout/               모든 페이지에 공통인 틀
│       ├── Layout.tsx        헤더 + 내용 + 푸터 구조
│       └── Header.tsx        상단 메뉴 (모바일 햄버거 포함)
│
├── hooks/                🪝 use로 시작하는 재사용 로직 (React 상태를 씀)
│   └── useToggle.ts
│
├── lib/                  🔧 React 와 상관없는 순수 함수
│   ├── cn.ts                 className 합치기 — 항상 이걸 쓰세요
│   └── api.ts                서버에 요청 보내기
│
└── types/                🏷 여러 파일에서 쓰는 타입 정의
    └── index.ts
```

---

## 2. 각 폴더가 맡은 일

### 📄 `pages/` — 주소가 있는 화면

`router.tsx` 에 연결되는 것만 들어갑니다. 파일 하나가 화면 하나입니다.

```
src/pages/TodoPage.tsx   →   http://localhost:5173/todo
```

- 이름은 **PascalCase + `Page`** 로 끝냅니다. `TodoPage.tsx`
- `export function TodoPage()` — **named export**
- 페이지 안에서 좌우 여백을 주지 마세요. `Layout` 이 이미 주고 있습니다.
- 페이지가 길어지면 조각을 `components/` 로 빼되, **그 페이지에서만 쓰는 건 그냥 파일 안에 둡니다.**

**페이지를 추가하면 `router.tsx` 수정을 잊지 마세요.** 안 하면 화면이 안 뜹니다.

```tsx
// src/router.tsx
{ path: 'todo', element: <TodoPage /> },
{ path: '*', element: <NotFoundPage /> },   // ← 이건 항상 맨 마지막!
```

### 🧩 `components/ui/` — 어디서나 쓰는 조각

버튼, 입력창, 카드, 모달처럼 **페이지를 가리지 않고 쓰이는 것**.

- `className` 을 props 로 받고 `cn()` 의 **맨 마지막**에 둡니다. (쓰는 쪽에서 덮어쓸 수 있게)
- 종류가 여러 개면 객체로 모읍니다. `Button.tsx` 의 `variantStyles` 를 따라 하세요.

### 🧩 `components/layout/` — 페이지 틀

헤더, 푸터, 사이드바처럼 **모든 페이지에 공통으로 깔리는 것**.
`Layout.tsx` 안의 `<Outlet />` 자리에 현재 페이지가 끼워집니다.

### 🪝 `hooks/` — 재사용하는 React 로직

`useState`, `useEffect` 같은 걸 쓰면서 여러 컴포넌트에서 반복되는 로직.

- 이름은 **반드시 `use` 로 시작**합니다. (React 규칙)
- 같은 `useState` 묶음을 두 번째로 복붙하게 되면 그때 훅으로 빼세요.

### 🔧 `lib/` — React 없이 돌아가는 함수

날짜 포맷, 숫자 계산, 서버 요청처럼 **화면과 상관없는 순수 함수**.

- 화면 없이도 테스트할 수 있으면 `lib/`, `useState` 가 필요하면 `hooks/`.

### 🏷 `types/` — 공용 타입

**두 파일 이상**에서 쓰는 `interface` / `type` 만 여기 둡니다.
한 파일에서만 쓰는 타입은 그 파일 안에 그냥 두세요.

---

## 3. "이건 어디에 만들지?" 판단표

위에서부터 읽어 내려가세요. **처음 걸리는 곳**이 정답입니다.

| 질문                                     | 예 → 여기                      |
| ---------------------------------------- | ------------------------------ |
| 주소(URL)가 있는 화면인가?               | `pages/XxxPage.tsx`            |
| 헤더·푸터처럼 모든 페이지에 공통인가?    | `components/layout/`           |
| **두 군데 이상**에서 쓰는 UI 조각인가?   | `components/ui/`               |
| 지금은 **한 페이지에서만** 쓰는가?       | 그 페이지 파일 안에 그대로     |
| React 상태를 쓰면서 재사용되는 로직인가? | `hooks/useXxx.ts`              |
| React 없이 돌아가는 계산·변환 함수인가?  | `lib/xxx.ts`                   |
| 두 파일 이상에서 쓰는 타입인가?          | `types/index.ts`               |
| 이미지·아이콘 파일인가?                  | `public/` (코드에선 `/파일명`) |

### ⭐ 가장 중요한 원칙: **미리 빼지 않기**

"나중에 재사용할지도 모르니까" 하면서 처음부터 `components/ui/` 에 넣지 마세요.
**두 번째로 쓰이는 순간에** 옮기면 됩니다. 그때 옮겨도 전혀 늦지 않습니다.

초보 팀이 가장 많이 하는 실수가 **구조를 미리 복잡하게 만드는 것**입니다.

---

## 4. 파일 이름 규칙

| 종류              | 방식              | 예시                         |
| ----------------- | ----------------- | ---------------------------- |
| 컴포넌트 · 페이지 | PascalCase        | `Button.tsx`, `TodoPage.tsx` |
| 훅                | `use` + camelCase | `useToggle.ts`               |
| 유틸 함수         | camelCase         | `cn.ts`, `formatDate.ts`     |
| 폴더              | 소문자            | `components`, `hooks`, `lib` |

한글 파일명은 쓰지 않습니다.

---

## 5. import 규칙

경로는 항상 `@/` 로 시작합니다. `@` 는 `src/` 를 가리킵니다.

```tsx
import { Button } from '@/components/ui/Button' // ✅
import { Button } from '../../components/ui/Button' // ❌ 파일을 옮기면 전부 깨집니다
```

순서는 신경 쓰지 마세요. 저장하면 Prettier 가 정리해 줍니다.

---

## 6. 새 화면을 만드는 전체 예시

"할 일 목록" 화면을 만든다면:

```
1. src/pages/TodoPage.tsx          만들기
2. src/router.tsx                  { path: 'todo', element: <TodoPage /> } 추가
3. src/components/layout/Header.tsx  navItems 에 { to: '/todo', label: '할 일' } 추가 (메뉴에 넣을 경우)
4. 할 일 한 줄을 그리는 조각이 필요하면
     → 지금은 TodoPage.tsx 안에 TodoItem 함수로 두기
     → 다른 페이지에서도 쓰게 되면 그때 components/ui/TodoItem.tsx 로 이동
```

> Claude Code 에서는 `"할 일 목록 페이지 만들어줘"` 라고만 해도
> `new-page` 스킬이 이 순서를 그대로 따라 합니다.

---

## 7. 프로젝트가 커지면 (지금은 안 해도 됩니다)

지금 구조는 **페이지 10개 정도까지** 편합니다.
그보다 커지면 기능 단위로 묶는 `features/` 구조를 고민하세요.

```
src/features/
├── todo/
│   ├── components/TodoItem.tsx
│   ├── hooks/useTodos.ts
│   └── types.ts
└── auth/
    └── ...
```

**실제로 불편해졌을 때** 팀이 같이 결정하세요. 미리 만들지 마세요.

---

## 부록: `src/` 바깥에는 뭐가 있나

작업 중에는 거의 건드릴 일이 없습니다.

| 파일/폴더           | 설명                                                  |
| ------------------- | ----------------------------------------------------- |
| `public/`           | 그대로 복사되는 파일 (파비콘 등). `/파일명` 으로 접근 |
| `index.html`        | 페이지 껍데기 (제목, 파비콘, meta 태그)               |
| `vite.config.ts`    | 빌드 설정 (`@` 별칭, 포트, Tailwind 연결)             |
| `tsconfig.app.json` | TypeScript 설정                                       |
| `.prettierrc`       | 코드 모양 규칙                                        |
| `.oxlintrc.json`    | 린트 규칙                                             |
| `.nvmrc`            | Node 버전 (22)                                        |
| `package.json`      | 패키지 목록 + 명령어                                  |
| `pnpm-lock.yaml`    | 패키지 정확한 버전 — **직접 수정 금지**               |
| `.mcp.json`         | GitHub / Vercel MCP 연결 정보                         |
| `.claude/`          | AI 설정 (슬래시 명령어, 스킬, 안전장치)               |
| `.github/`          | PR·이슈 양식                                          |
| `docs/`             | 이 문서들                                             |
