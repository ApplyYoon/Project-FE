# 컨벤션 치트시트

한 장으로 보는 팀 규칙. 헷갈릴 때 여기만 보세요.

---

## 🌳 브랜치 전략

```
feat/login-form ─┐
fix/header-bug  ─┼─▶  develop  ─▶  main
chore/prettier  ─┘   (개발 통합)       (최종본)
```

| 브랜치        | 무엇                          | 직접 커밋 | PR 대상   |
| ------------- | ----------------------------- | --------- | --------- |
| `main`        | 최종본. 안정적으로 도는 코드  | ❌        | —         |
| `develop`     | 개발 통합. 작업물이 모이는 곳 | ❌        | `main`    |
| `feat/...` 등 | 실제로 작업하는 브랜치        | ✅        | `develop` |

- 작업 브랜치는 **항상 `develop` 에서** 땁니다.
- PR 의 **base 는 `develop`** 입니다. (`main` 아님)
- `develop → main` 은 기능이 어느 정도 모였을 때 **사람이** 엽니다.
- `main` 과 `develop` 은 직접 커밋·푸시가 **자동 차단**됩니다.

---

## 🌿 브랜치 이름

```
타입/영문-설명            feat/login-form
타입/이슈번호-영문-설명   feat/12-login-form
```

| 타입       | 언제                    | 예시                       |
| ---------- | ----------------------- | -------------------------- |
| `feat`     | 새 기능                 | `feat/12-login-form`       |
| `fix`      | 버그 수정               | `fix/23-header-overflow`   |
| `refactor` | 동작 그대로 코드 정리   | `refactor/31-button-props` |
| `style`    | CSS·여백 등 보이는 것만 | `style/8-card-spacing`     |
| `docs`     | 문서만                  | `docs/5-readme-update`     |
| `chore`    | 설정·패키지 등 기타     | `chore/2-prettier-config`  |

✅ 소문자, 하이픈(`-`)
❌ 한글, 공백, 대문자, 언더바(`_`)

```bash
git switch develop && git pull origin develop && git switch -c feat/12-login-form
```

> Claude Code 를 쓰면 `/start <하고 싶은 일>` 만 치면
> **`develop` 에서 따고 이름 후보까지 제시해 줍니다.**

---

## 💾 커밋

```
<타입>: <한국어로 무엇을 했는지>     ← 50자 이내, 마침표 없음

<왜 그렇게 했는지 — 필요할 때만 2~3줄>

Refs: #12
```

타입은 브랜치와 동일 + `test`

### 좋은 예

```
feat: 로그인 폼에 이메일 형식 검사 추가

정규식으로 @ 포함 여부를 확인하고, 틀리면 Input 아래에
빨간 안내 문구를 보여주도록 했습니다.

Refs: #12
```

```
fix: 헤더가 모바일에서 넘치는 문제 수정
style: 카드 사이 간격 통일
chore: prettier 설정에 tailwind 플러그인 추가
```

### 나쁜 예

| ❌                                  | 왜 나쁜가            |
| ----------------------------------- | -------------------- |
| `수정`                              | 뭘 수정했는지 모름   |
| `update`                            | 타입도 내용도 없음   |
| `feat: 작업함`                      | 내용이 없음          |
| `feat: 로그인 만들고 헤더도 고침`   | 한 커밋에 여러 일    |
| `feat: 로그인 폼을 추가하였습니다.` | 마침표·존댓말 불필요 |

### 규칙

- **한 커밋 = 한 가지 일.** 성격이 다르면 나눕니다.
- `git add .` 금지 → 바꾼 파일을 명시합니다.
- `.env`, `node_modules`, `dist` 는 커밋하지 않습니다.
- Claude가 만든 커밋에는 `Co-Authored-By: Claude ...` 트레일러가 붙습니다.

> `/save` 를 쓰면 **커밋 메시지를 자동으로 써줍니다.** 직접 고민하지 않아도 됩니다.

---

## 🔀 PR

- 제목: 커밋과 같은 형식 — `feat: 로그인 폼 추가`
- 본문: 템플릿을 **실제 내용으로** 채우기 (빈칸 금지)
- 이슈 연결: 본문에 `Closes #12`
- **base 브랜치는 `develop`** — `gh pr create --base develop ...`
- 리뷰어 **1명 이상** 지정, 승인 전 merge 금지
- 크기: 파일 10개 / 300줄 이내 목표
- 올리기 전에 `/check` 4종 검사를 통과시킬 것

---

## 🧩 코드

### 이름

| 대상              | 방식              | 예시                         |
| ----------------- | ----------------- | ---------------------------- |
| 컴포넌트·페이지   | PascalCase        | `Button.tsx`, `TodoPage.tsx` |
| 훅                | `use` + camelCase | `useToggle.ts`               |
| 유틸 함수         | camelCase         | `formatDate.ts`              |
| 이벤트 핸들러     | `handle` + 동작   | `handleSubmit`               |
| props로 받는 함수 | `on` + 시점       | `onClose`, `onChange`        |
| boolean 변수      | `is`/`has`        | `isOpen`, `hasError`         |

### 반드시

```tsx
import { cn } from '@/lib/cn' // ✅ @ 별칭
cn('rounded-lg p-4', className) // ✅ className 은 항상 마지막
interface ButtonProps { ... }   // ✅ props 타입 명시
export function Button() {}     // ✅ named export
```

### 금지

```tsx
import { cn } from '../../lib/cn'   // ❌ 상대경로
className={`p-2 ${x}`}              // ❌ 문자열 합치기 → cn() 쓰기
const data: any = ...               // ❌ any
// @ts-ignore                       // ❌ 에러 덮기
style={{ marginTop: 10 }}           // ❌ 인라인 style → Tailwind 쓰기
```

---

## 📱 반응형

**모바일 기준으로 쓰고 `sm:` 로 키웁니다.**

```tsx
<h1 className="text-2xl sm:text-3xl">              {/* 글자 */}
<div className="grid grid-cols-1 sm:grid-cols-2">  {/* 카드 목록 */}
<div className="flex flex-col sm:flex-row">        {/* 배치 */}
<section className="px-4 py-6 sm:px-6 sm:py-10">   {/* 여백 */}
<nav className="hidden sm:flex">                   {/* PC 전용 */}
<button className="sm:hidden">                     {/* 모바일 전용 */}
```

체크리스트

- [ ] 375px에서 가로 스크롤이 안 생긴다
- [ ] 누르는 건 최소 40px (`h-10`)
- [ ] 이미지에 `max-w-full`
- [ ] `h-screen` 대신 `min-h-screen`

---

## ✅ 커밋 전 4종 검사

```bash
pnpm run typecheck   # 타입 안 맞는 곳
pnpm run lint        # 위험한 코드
pnpm run format      # 코드 모양 정리
pnpm run build       # 배포용 빌드
```

하나라도 실패하면 커밋하지 않습니다. → `/check`
