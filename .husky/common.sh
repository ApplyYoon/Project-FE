# 여러 훅에서 함께 쓰는 함수입니다.

# 보호 브랜치(main, dev)인지 확인합니다.
is_protected_branch() {
  case "$1" in
    main|master|dev) return 0 ;;
    *) return 1 ;;
  esac
}

# 빨간 글씨로 안내문을 출력합니다.
say() {
  printf '\n\033[31m%s\033[0m\n\n' "$1" >&2
}
