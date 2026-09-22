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

## 4. MCP 연결 (GitHub / Vercel)

이 저장소에는 `.mcp.json` 이 들어 있어서, `claude` 를 실행하면
**"이 프로젝트의 MCP 서버를 사용할까요?"** 라고 물어봅니다. **예**를 누르면 연결됩니다.

물어보지 않았거나 이미 거절했다면 상태를 확인하세요.

```
/mcp
```

- `github` / `vercel` 이 목록에 없다면 → Claude Code 를 껐다 켜고 다시 `/mcp`
- 목록에 있지만 로그인이 안 됐다면 → `/mcp` 화면에서 해당 서버를 골라 **Authenticate**
  (브라우저가 열리고 GitHub / Vercel 로그인 후 승인하면 끝)

수동으로 추가해야 한다면:

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
claude mcp add --transport http vercel https://mcp.vercel.com
```

> ⚠️ MCP 를 연결하면 그 서비스에서 **내 계정 권한 그대로** 동작합니다.
> 공식 주소(`api.githubcopilot.com`, `mcp.vercel.com`)가 맞는지 꼭 확인하고,
> 출처를 모르는 MCP 서버는 붙이지 마세요.

MCP 없이도 이 프로젝트는 전부 동작합니다. 연결이 안 되면 `gh` CLI 나 GitHub 웹을 쓰면 됩니다.

## 5. 마무리 보고

> 세팅 끝났어요.
> · Node 22 / pnpm ✅ · 빌드 ✅ · git 사용자 정보 ✅ · MCP(github, vercel) ✅
>
> 이제 `/run` 으로 화면을 켜보고, `/start <만들고 싶은 것>` 으로 첫 작업을 시작하세요.
