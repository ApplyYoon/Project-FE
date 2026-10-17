---
description: 처음 한 번 - 개발 환경과 MCP 연결을 한 번에 세팅합니다
---

팀에 새로 합류했거나 컴퓨터를 새로 받은 사람을 위한 최초 세팅입니다.
**한 단계씩 확인하면서** 진행하고, 실패하면 거기서 멈추고 해결한 뒤 다음으로 가세요.

## 1. 준비물 확인

```bash
node -v && pnpm -v && git --version
```

없는 게 있으면 설치 방법을 알려주세요.

| 없는 것 | 해결                                                         |
| ------- | ------------------------------------------------------------ |
| node    | https://nodejs.org 에서 22 버전 설치 (또는 `nvm install 22`) |
| pnpm    | `npm install -g pnpm`                                        |
| git     | https://git-scm.com                                          |

Node 버전이 22가 아니면 `nvm use` 를 안내하세요. (`.nvmrc` 에 적혀 있습니다)

## 2. 패키지 설치 + 실행 확인

```bash
pnpm install
pnpm run build
```

빌드가 성공하면 환경은 정상입니다.
`pnpm install` 을 하면 husky(git 훅)도 같이 설치됩니다. 아래로 확인하세요.

```bash
git config core.hooksPath
```

`.husky/_` 가 나와야 합니다. 비어 있으면 `pnpm install` 을 다시 하세요.

## 3. git 사용자 정보 확인

```bash
git config user.name && git config user.email
```

비어 있으면 사용자에게 물어보고 설정하세요.

```bash
git config --global user.name "본인 이름"
git config --global user.email "GitHub에 등록한 이메일"
```

> 이메일이 GitHub 계정과 다르면 커밋에 본인 프로필이 안 뜹니다.

## 4. GitHub 로그인 (gh CLI)

`/pr` 로 PR 을 올릴 때와 GitHub MCP 를 연결할 때 둘 다 이 로그인이 필요합니다.

```bash
gh --version && gh auth status
```

| 상태                        | 해결                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `gh` 가 없음                | Mac: `brew install gh` / Windows: `winget install --id GitHub.cli` / 그 밖: https://cli.github.com |
| `not logged in` 이라고 나옴 | 아래처럼 로그인                                                                                    |

`gh auth login` 은 질문에 하나씩 답하며 진행돼서 Claude 가 대신 실행할 수 없습니다.
**새 터미널 창을 열어 직접 실행하라고** 안내하세요.

```bash
gh auth login
```

질문이 나오면 `GitHub.com` → `HTTPS` → `Y` (git push 로그인도 같이 설정) → `Login with a web browser` 를 고르고,
화면에 나온 8자리 코드를 브라우저에 입력하면 끝입니다. 끝나면 `gh auth status` 로 다시 확인하세요.

## 5. MCP 연결 (GitHub / Vercel)

이 저장소에는 `.mcp.json` 이 들어 있어서, `claude` 를 실행하면
**"이 프로젝트의 MCP 서버를 사용할까요?"** 라고 물어봅니다. **예**를 누르면 연결됩니다.

물어보지 않았거나 이미 거절했다면 상태를 확인하세요.

```
/mcp
```

- `github` / `vercel` 이 목록에 없다면 → Claude Code 를 껐다 켜고 다시 `/mcp`
- `github` → 4번 `gh` 로그인만 돼 있으면 **자동으로 연결**됩니다. 따로 로그인할 필요 없습니다.
  (연결할 때마다 `.claude/scripts/github-mcp-headers.mjs` 가 gh 의 토큰을 꺼내 씁니다.
  GitHub 는 `/mcp` 의 Authenticate 버튼 로그인을 지원하지 않아서 이렇게 합니다)
- `vercel` → 로그인이 안 됐다면 `/mcp` 화면에서 `vercel` 을 골라 **Authenticate**
  (브라우저가 열리고 Vercel 로그인 후 승인하면 끝)

`github` 가 `Incompatible auth server: does not support dynamic client registration` 으로 실패하면
gh 토큰을 꺼내지 못한 것입니다.

- `gh auth status` 로 로그인 상태 확인 → 안 돼 있으면 4번으로
- `claude` 를 **프로젝트 폴더 맨 위**에서 켰는지 확인 (스크립트 경로가 이 폴더 기준입니다)
- 예전에 `github` 를 손으로 추가한 적이 있다면 `claude mcp remove github -s local` 로 지우고 다시 켜기

수동으로 추가해야 한다면:

```bash
claude mcp add-json github '{"type":"http","url":"https://api.githubcopilot.com/mcp/","headersHelper":"node .claude/scripts/github-mcp-headers.mjs"}'
claude mcp add --transport http vercel https://mcp.vercel.com
```

> ⚠️ MCP 를 연결하면 그 서비스에서 **내 계정 권한 그대로** 동작합니다.
> 공식 주소(`api.githubcopilot.com`, `mcp.vercel.com`)가 맞는지 꼭 확인하고,
> 출처를 모르는 MCP 서버는 붙이지 마세요.

MCP 없이도 이 프로젝트는 전부 동작합니다. 연결이 안 되면 `gh` CLI 나 GitHub 웹을 쓰면 됩니다.

## 6. 마무리 보고

> 세팅 끝났어요.
> · Node 22 / pnpm ✅ · 빌드 ✅ · git 사용자 정보 ✅ · GitHub 로그인(gh) ✅ · MCP(github, vercel) ✅
>
> 이제 `/run` 으로 화면을 켜보고, `/start <만들고 싶은 것>` 으로 첫 작업을 시작하세요.
