---
description: 지금까지 한 작업을 저장(커밋)합니다 - 커밋 메시지는 알아서 써줍니다
---

작업을 커밋합니다. 사용자는 커밋 메시지를 직접 쓰지 않습니다. **당신이 대신 씁니다.**

## 1. 브랜치 확인

```bash
git symbolic-ref --short -q HEAD
```

`main` / `master` / `dev` 이면 **커밋하지 말고** 이렇게 안내하세요.
(이 셋은 보호 브랜치라 직접 커밋할 수 없습니다. 훅이 실제로 막습니다.)

> 지금 `dev` 브랜치라 바로 저장할 수 없어요.
> `/start <무슨 작업인지>` 로 작업 브랜치를 먼저 만들어 주세요.

## 2. 검사 4종 통과시키기

```bash
pnpm run typecheck && pnpm run lint && pnpm run format && pnpm run build
```

- 실패하면 **커밋하지 말고** 원인을 고칩니다.
- 고쳐도 안 되면 에러 메시지를 그대로 보여주고 사용자에게 물어봅니다.
- 설정을 끄거나 `@ts-ignore` 로 덮어서 통과시키는 것은 금지입니다.

## 3. 무엇이 바뀌었는지 읽기

```bash
git status --short && git diff
```

## 4. 커밋을 나눌지 판단

성격이 다른 변경이 섞여 있으면 **커밋을 나눕니다.**
(예: 로그인 폼 추가 + 헤더 버그 수정 → 커밋 2개, 파일을 나눠서 `git add`)

## 5. 커밋

파일을 명시해서 add 하세요. `git add .` 는 쓰지 마세요.

```bash
git add <바뀐 파일들>
git commit -m "$(cat <<'MSG'
feat: 로그인 폼에 이메일 형식 검사 추가

정규식으로 @ 포함 여부를 확인하고, 틀리면 Input 아래에 안내 문구를 보여줍니다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

메시지 규칙:

- 제목: `타입: 한국어로 무엇을 했는지` (50자 이내, 마침표 없음)
- 타입: `feat` `fix` `refactor` `style` `docs` `chore` `test`
- 본문: 왜 그렇게 했는지 필요할 때만 2~3줄
- 관련 이슈가 있으면 `Refs: #12`

## 6. 보고

> 2개 커밋으로 저장했어요.
> · feat: 로그인 폼 추가
> · fix: 헤더 모바일 깨짐 수정
> 올릴 준비가 되면 `/pr` 를 쳐주세요.
