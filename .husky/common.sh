# 여러 훅에서 함께 쓰는 함수입니다.

# 보호 브랜치(main, develop)인지 확인합니다.
is_protected_branch() {
  case "$1" in
    # dev 는 develop 의 예전 이름입니다. 옛 브랜치가 남아 있는 컴퓨터를 위해 같이 막습니다.
    main|master|develop|dev) return 0 ;;
    *) return 1 ;;
  esac
}

# 빨간 글씨로 안내문을 출력합니다.
say() {
  printf '\n\033[31m%s\033[0m\n\n' "$1" >&2
}
