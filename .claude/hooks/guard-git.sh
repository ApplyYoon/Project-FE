#!/usr/bin/env bash
# 보호 브랜치(main, dev) 직접 커밋/푸시와 되돌리기 어려운 git 명령을 막는 안전장치입니다.
# Claude Code 의 PreToolUse 훅으로 실행되며, 표준입력으로 도구 호출 정보(JSON)를 받습니다.
set -u

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
BRANCH="$(git -C "$ROOT" symbolic-ref --short -q HEAD 2>/dev/null)"

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# 1) 되돌리기 어려운 명령은 브랜치와 상관없이 차단
case "$CMD" in
  *"push --force"*|*"push -f "*|*"push --delete"*)
    deny "강제 푸시(force push)는 팀원의 작업을 지울 수 있어 막아두었습니다. 선생님/팀장에게 먼저 물어보세요." ;;
  *"reset --hard"*)
    deny "git reset --hard 는 작업한 내용을 되돌릴 수 없게 지웁니다. 'git stash' 를 쓰거나 사람에게 먼저 물어보세요." ;;
  *"branch -D"*|*"branch -d "*)
    deny "브랜치 삭제는 사람이 직접 하기로 한 작업입니다. 왜 지워야 하는지 먼저 설명하고 허락을 받으세요." ;;
esac

# 2) 보호 브랜치(main, dev)에서의 직접 커밋·푸시 차단
#    브랜치 전략:  feat/fix/... → dev → main
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  case "$CMD" in
    *"git commit"*|*"git push"*)
      deny "지금 '$BRANCH' 브랜치입니다. main 에는 직접 커밋/푸시하지 않습니다.
main 으로는 dev 에서 PR 로만 들어갑니다.

작업하려면 dev 에서 새 브랜치를 만드세요:
  git switch dev && git pull origin dev && git switch -c feat/작업이름
(브랜치 이름이 고민되면 사용자에게 후보를 제시하고 고르게 하세요.)" ;;
  esac
fi

if [ "$BRANCH" = "dev" ]; then
  case "$CMD" in
    *"git commit"*|*"git push"*)
      deny "지금 'dev' 브랜치입니다. dev 에도 직접 커밋/푸시하지 않습니다.
dev 로는 작업 브랜치에서 PR 로만 들어갑니다.

먼저 작업 브랜치를 만드세요:
  git switch -c feat/작업이름
(브랜치 이름이 고민되면 사용자에게 후보를 제시하고 고르게 하세요.)" ;;
  esac
fi

exit 0
