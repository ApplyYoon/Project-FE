#!/usr/bin/env bash
# 파일을 수정할 때마다 Prettier 로 자동 정리합니다. (들여쓰기/따옴표 고민 안 해도 되도록)
set -u

INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_response.filePath // .tool_input.file_path // ""')"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

[ -z "$FILE" ] && exit 0
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.css|*.json|*.md|*.html) ;;
  *) exit 0 ;;
esac

cd "$ROOT" 2>/dev/null || exit 0
./node_modules/.bin/prettier --write "$FILE" >/dev/null 2>&1 || true
exit 0
