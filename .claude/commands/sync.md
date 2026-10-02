---
description: 팀원들이 올린 최신 코드를 내 브랜치로 가져옵니다
---

```bash
git status --short
```

수정 중인 파일이 있으면 먼저 `/save` 를 하자고 안내하세요.

깨끗하면 **`develop` 을 기준으로** 최신화합니다.
(브랜치 전략이 `작업 브랜치 → develop → main` 이라, 팀원들의 최신 코드는 `develop` 에 모입니다.)

```bash
git fetch origin
git switch develop
git pull origin develop
git switch -       # 방금 있던 작업 브랜치로 돌아가기
git merge develop
```

지금 `develop` 나 `main` 에 있었다면 뒤의 두 줄은 건너뜁니다.
(`develop` 을 최신으로 받아두기만 하고, 작업은 `/start` 로 새 브랜치를 만들어 시작하세요.)

- 충돌(conflict)이 나면 **혼자 아무거나 고르지 말고** 어떤 파일이 왜 충돌했는지 설명한 뒤,
  각 충돌에 대해 "내 것 / 팀원 것 / 둘 다" 중 무엇으로 할지 사용자에게 물어보세요.
- 합친 뒤에는 `pnpm install` 을 한 번 돌려주세요. (팀원이 패키지를 추가했을 수 있음)
- 마지막으로 `/check` 검사를 돌려 깨진 곳이 없는지 확인하고 보고합니다.
