#!/usr/bin/env bash
# 세션이 시작될 때 현재 git 상태를 Claude 에게 알려줍니다.
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
BRANCH="$(git -C "$ROOT" symbolic-ref --short -q HEAD 2>/dev/null)"
[ -z "$BRANCH" ] && BRANCH="(알 수 없음)"
CHANGED="$(git -C "$ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

CONTEXT="[프로젝트 상태] 현재 브랜치: ${BRANCH} / 수정된 파일: ${CHANGED}개
[브랜치 전략] 작업 브랜치(feat/fix/...) → dev → main. 작업은 항상 dev 에서 딴 브랜치에서 합니다."

case "$BRANCH" in
  main|master)
    CONTEXT="${CONTEXT}
⚠️ main 은 보호 브랜치입니다. 코드를 고치기 전에 사용자에게 브랜치 이름 후보를 제시하고,
   dev 에서 새 작업 브랜치를 만드세요. (git switch dev && git pull origin dev && git switch -c feat/...)" ;;
  dev)
    CONTEXT="${CONTEXT}
⚠️ dev 도 보호 브랜치입니다. 여기서 직접 커밋하지 말고 작업 브랜치를 먼저 만드세요. (git switch -c feat/...)" ;;
esac

jq -n --arg c "$CONTEXT" '{
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: $c }
}'
