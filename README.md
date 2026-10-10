# Project FE

Tmax IT 희망학교 프론트엔드 팀 프로젝트.
**React + TypeScript + Vite + Tailwind CSS v4** 로 만듭니다.

---

## 🚀 실행 방법

### 0. 준비물 (처음 한 번만)

| 필요한 것 | 확인 명령       | 없으면                                                 |
| --------- | --------------- | ------------------------------------------------------ |
| Node.js   | `node -v`       | [nodejs.org](https://nodejs.org) 에서 **22 버전** 설치 |
| pnpm      | `pnpm -v`       | `npm install -g pnpm`                                  |
| Git       | `git --version` | [git-scm.com](https://git-scm.com) 에서 설치           |

> `nvm` 을 쓴다면 프로젝트 폴더에서 `nvm use` 만 치면 알아서 22로 맞춰집니다.

### 1. 코드 받아오기

```bash
git clone https://github.com/Tmax-IT-Hope-School/Project-FE.git
cd Project-FE
```

### 2. 패키지 설치

```bash
pnpm install
```

> ⚠️ **`npm install` / `yarn` 을 쓰지 마세요.** 팀원마다 패키지 버전이 달라져서 "제 컴퓨터에선 되는데요" 문제가 생깁니다.

### 3. 개발 서버 켜기

```bash
pnpm run dev
```

브라우저가 자동으로 열립니다. 안 열리면 👉 **http://localhost:5173**

- 코드를 고치고 저장하면 브라우저가 **알아서 새로고침**됩니다.
- 서버를 끄려면 터미널에서 `Ctrl + C`.

### 4. 모바일 화면 확인하기

이 프로젝트는 **PC와 모바일 둘 다** 지원합니다. 꼭 같이 확인하세요.

```
브라우저에서 F12  →  좌측 상단 📱 아이콘 클릭  →  iPhone SE 선택
```

375px 에서 가로 스크롤이 안 생기면 대부분 괜찮습니다.

### 5. BE 서버 같이 켜기 (서버와 연결해서 작업할 때)

목데이터·localStorage 를 진짜 서버 데이터로 바꾸는 작업(서버 연결 이슈)을 할 때는 **BE 서버를 같이 켜야** 합니다.
BE 가 꺼져 있어도 FE 화면은 멈추지 않지만, 서버 데이터는 못 불러옵니다.

**1) BE 서버 켜기** — 다른 터미널 창에서 `Project-BE` 폴더로 가서 (JDK 21 이 필요합니다. 처음이면 BE 의 README 를 따라 하세요)

```bash
./gradlew bootRun
```

브라우저에서 `http://localhost:8080/swagger-ui.html` 을 열면 BE 가 만든 API 목록이 보입니다.
코드를 쓰기 전에 여기서 먼저 직접 불러 보세요. 어떤 값을 보내고 무엇이 돌아오는지 눈으로 볼 수 있습니다.

**2) FE 가 BE 주소를 알게 하기** — 주소는 코드가 아니라 `.env` 파일(환경변수)에 적습니다.

```bash
cp .env.example .env        # 윈도우 PowerShell: Copy-Item .env.example .env
```

`.env` 의 `VITE_API_BASE_URL` 에 BE 주소를 적습니다. 내 컴퓨터에서 BE 를 켰다면 견본 그대로
`http://localhost:8080/api/v1` 이면 됩니다. **`.env` 를 아예 안 만들어도** 이 주소를 기본으로 씁니다.

- `.env` 는 내 컴퓨터에만 두는 파일이라 GitHub 에 올라가지 않습니다. (`.env.example` 만 올라갑니다)
- `.env` 를 고친 뒤에는 개발 서버(`pnpm run dev`)를 **껐다가 다시 켜야** 적용됩니다.
- ⚠️ `VITE_` 로 시작하는 값은 빌드 결과물에 들어가서 **누구나 볼 수 있습니다.** 비밀번호·API 키는 넣지 마세요.
- FE 개발 서버 포트(5173)는 BE 가 기본으로 허락해 둔 주소입니다. 포트를 바꾸면 브라우저 콘솔에 CORS 에러가 납니다.
- 배포 주소에서 쓸 값은 Vercel 프로젝트 설정(Environment Variables)에 넣습니다.

---

## 📜 명령어 모음

| 명령                    | 하는 일                              |
| ----------------------- | ------------------------------------ |
| `pnpm run dev`          | 개발 서버 켜기 (작업할 때 쓰는 것)   |
| `pnpm run build`        | 배포용으로 빌드 → `dist/` 폴더 생성  |
| `pnpm run preview`      | 빌드 결과를 실제 서비스처럼 미리보기 |
| `pnpm run typecheck`    | 타입이 안 맞는 곳 찾기               |
| `pnpm run lint`         | 위험한 코드 패턴 찾기                |
| `pnpm run format`       | 코드 모양 자동 정리                  |
| `pnpm run format:check` | 정리가 필요한 파일이 있는지 확인만   |

**커밋하기 전에는 아래 4개가 전부 통과해야 합니다.**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format && pnpm run build
```

> Claude Code 를 쓴다면 `/check` 한 줄이면 됩니다.

---

## 🤖 Claude Code 로 작업하기

이 프로젝트는 코딩이 처음인 사람도 할 수 있게 **슬래시 명령어**를 만들어 두었습니다.
터미널에서 `claude` 를 실행한 뒤 아래를 치세요.

| 명령                        | 하는 일                                                  |
| --------------------------- | -------------------------------------------------------- |
| `/setup`                    | **최초 1회** — 준비물 확인 + MCP(GitHub/Vercel) 연결     |
| `/start 로그인 화면 만들기` | **브랜치 이름을 추천해서 물어보고** 새 브랜치를 만듭니다 |
| `/save`                     | 검사 4종을 돌리고 **커밋 메시지까지 알아서 써서** 저장   |
| `/pr`                       | 푸시 + PR 생성 (**체크리스트도 직접 검증해서 채움**)     |
| `/check`                    | 검사 4종을 한 번에                                       |
| `/sync`                     | 팀원이 올린 최신 코드 가져오기                           |
| `/run`                      | 개발 서버 켜기                                           |
| `/fix <에러 메시지>`        | 에러가 무슨 뜻인지 설명하고 같이 고치기                  |

### 브랜치 전략

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

- 작업 브랜치는 **항상 `develop` 에서** 땁니다. PR 의 **base 도 `develop`** 입니다.
- `develop → main` 은 기능이 어느 정도 모였을 때 **선생님/팀장이** 엽니다.
- `main` 과 `develop` 은 직접 커밋·푸시가 **자동 차단**됩니다.

### 하루 작업 흐름

```
/sync                      아침에 최신 develop 받기
/start 할 일 목록 만들기    → develop 에서 브랜치 생성 (이름 후보를 줍니다)
  ... Claude에게 시키면서 작업 ...
/run                       브라우저에서 확인 (모바일도!)
/save                      저장 (커밋 메시지 자동)
/pr                        develop 으로 PR 올리기 → 링크가 나옴
확인 끝나면 GitHub 웹에서 직접 Merge (리뷰는 선택)
```

### 안전장치 (3겹)

| 층                 | 언제                       | 뚫리는 경우         |
| ------------------ | -------------------------- | ------------------- |
| Claude Code 훅     | Claude 가 명령을 실행할 때 | 터미널에 직접 칠 때 |
| husky (git 훅)     | 누가 치든 커밋·푸시할 때   | `--no-verify`       |
| GitHub 브랜치 보호 | 서버에서                   | 없음 (진짜 방어선)  |

`pnpm install` 을 하면 husky 가 자동으로 깔립니다. 그 뒤로는:

- `main` / `develop` 에 커밋·푸시하면 **터미널에서도** 막힙니다
- 커밋 메시지가 `타입: 설명` 형식이 아니면 커밋이 안 됩니다
- 강제 푸시(`--force` / `-f` / `+main` / `--mirror`)와 브랜치 삭제 푸시가 막힙니다
- 커밋할 때 바뀐 파일만 Prettier·oxlint 가 자동으로 돕니다

그리고 Claude 가 실행하는 명령은 아래까지 추가로 막습니다.

실수를 막으려고 아래는 **자동으로 차단**됩니다. (`.claude/hooks/`)

- `main` / `develop` 브랜치에 직접 커밋·푸시
- 원격을 망가뜨리는 것 — `push --force` / `-f` / `+main` / `--mirror` / `--delete` / `--prune`
- 내 작업을 지우는 것 — `reset --hard`, `clean -f`, `checkout .`, `stash drop`
- 기록을 다시 쓰는 것 — `filter-branch`, `reflog expire`, `gc --prune`
- 저장소를 건드리는 것 — `remote set-url`, `rm -rf .git`

그리고 파일을 수정하면 Prettier 가 **자동으로 코드 모양을 정리**합니다.
평소 쓰는 명령(`git push -u`, `git stash pop`, `git checkout -- 파일`)은 그대로 됩니다.
전체 목록은 [docs/AI-GUIDE.md](./docs/AI-GUIDE.md) 참고.

---

## 🧰 기술 스택

| 구분          | 사용 기술                      | 왜                                           |
| ------------- | ------------------------------ | -------------------------------------------- |
| UI            | React 19                       | 화면을 컴포넌트 조각으로 나눠서 만들기       |
| 언어          | TypeScript                     | 실수를 코드 쓰는 중에 미리 잡아줌            |
| 빌드 도구     | Vite 8                         | 서버가 1초 만에 켜짐                         |
| 스타일        | Tailwind CSS v4                | 클래스 이름으로 스타일링, CSS 파일 안 늘어남 |
| 클래스 합치기 | `cn()` (clsx + tailwind-merge) | 조건부 스타일 + 클래스 충돌 해결             |
| 라우팅        | React Router v7                | 주소에 따라 다른 화면 보여주기               |
| 린트/포맷     | oxlint + Prettier              | 코드 품질·모양 자동 관리                     |
| 패키지 매니저 | pnpm                           | 빠르고 디스크를 덜 씀                        |

---

## 📁 폴더 구조 (요약)

```
src/
├── pages/          화면 하나 = 파일 하나  (주소가 있는 것)
├── components/
│   ├── ui/         버튼·인풋처럼 어디서나 쓰는 조각
│   └── layout/     헤더·푸터 등 페이지 틀
├── hooks/          use로 시작하는 재사용 로직
├── lib/            cn(), api() 같은 순수 함수
├── types/          공용 타입
└── router.tsx      주소 ↔ 페이지 연결표
```

전체 구조와 "이 파일 어디에 만들지?" 판단표는 👉 **[docs/FOLDER-STRUCTURE.md](./docs/FOLDER-STRUCTURE.md)**

---

## ✍️ 코드 쓸 때 꼭 지킬 것 3가지

### 1. import 는 `@/` 로

```tsx
import { Button } from '@/components/ui/Button' // ✅
import { Button } from '../../components/ui/Button' // ❌
```

### 2. className 은 항상 `cn()` 으로

```tsx
import { cn } from '@/lib/cn'

cn('rounded-lg p-4', isActive && 'bg-brand', className) // ✅
className={`rounded-lg p-4 ${className}`}               // ❌ 클래스 충돌이 안 잡힘
```

`cn('p-2', 'p-4')` → `'p-4'` 처럼 **뒤에 온 것만 남겨줍니다.**

### 3. 모바일 기준으로 쓰고 `sm:` 로 키우기

```tsx
<h1 className="text-2xl sm:text-3xl">                {/* 글자 */}
<div className="grid grid-cols-1 sm:grid-cols-2">    {/* 카드 목록 */}
<div className="flex flex-col sm:flex-row">          {/* 배치 */}
```

---

## 🎨 색·폰트 바꾸기

Tailwind v4 는 `tailwind.config.js` 가 **없습니다.** `src/index.css` 에서 바꿉니다.

```css
@theme {
  --color-brand: #4f46e5; /* 이걸 바꾸면 bg-brand, text-brand 가 전부 바뀝니다 */
  --color-brand-dark: #4338ca;
  --color-brand-light: #eef2ff;
}
```

---

## 📚 문서

| 문서                                                   | 언제 읽나                      |
| ------------------------------------------------------ | ------------------------------ |
| [docs/GIT-GUIDE.md](./docs/GIT-GUIDE.md)               | git/GitHub 가 처음일 때        |
| [docs/FOLDER-STRUCTURE.md](./docs/FOLDER-STRUCTURE.md) | "이 파일 어디에 만들지?"       |
| [docs/CONVENTIONS.md](./docs/CONVENTIONS.md)           | 브랜치·커밋·코드 규칙 (한 장)  |
| [docs/AI-GUIDE.md](./docs/AI-GUIDE.md)                 | Claude Code·MCP 사용법         |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)   | 에러가 났을 때                 |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                   | 협업 규칙 요약                 |
| [CLAUDE.md](./CLAUDE.md)                               | AI가 지키는 규칙 (사람도 읽기) |

---

## 🆘 막혔을 때

1. **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** 를 먼저 봅니다.
2. Claude Code 에서 `/fix <에러 메시지 붙여넣기>`
3. 그래도 안 되면 팀 채팅방에 **에러 메시지 원문 + 무엇을 하다 났는지**를 같이 올립니다.
   ("안 돼요" 만 쓰면 아무도 도와줄 수 없습니다.)
