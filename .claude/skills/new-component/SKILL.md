---
name: new-component
description: 재사용할 UI 조각(버튼, 카드, 모달, 입력창 등)을 새로 만들 때 사용합니다. 파일 위치 결정, props 타입, cn() 으로 className 합치기, 반응형 클래스까지 이 프로젝트 규칙대로 만들어 줍니다. "컴포넌트 만들어줘", "모달 만들어줘", "이거 재사용하게 빼줘" 같은 요청에서 쓰세요.
---

# 새 컴포넌트 만들기

## 1. 어디에 만들지 정하기

| 상황                                 | 위치                       |
| ------------------------------------ | -------------------------- |
| 두 군데 이상에서 쓰는 조각 (버튼 등) | `src/components/ui/`       |
| 헤더·푸터처럼 페이지 틀              | `src/components/layout/`   |
| **한 페이지에서만** 쓰는 조각        | 그 페이지 파일 안에 그대로 |

아직 한 곳에서만 쓴다면 **미리 빼지 마세요.** 두 번째로 쓰일 때 빼면 됩니다.

## 2. 뼈대 (이 프로젝트 표준 형태)

`src/components/ui/Modal.tsx`

```tsx
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className={cn('w-full max-w-md rounded-xl bg-white p-5 shadow-lg', className)}>
        {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
        {children}
        <button type="button" onClick={onClose} className="mt-4 text-sm text-slate-500">
          닫기
        </button>
      </div>
    </div>
  )
}
```

## 3. 꼭 지킬 것

- **`className` 을 props 로 받고 `cn()` 의 맨 마지막에 둡니다.** 그래야 쓰는 쪽에서 덮어쓸 수 있습니다.
  ```tsx
  cn('rounded-lg p-4', className) // ✅
  cn(className, 'rounded-lg p-4') // ❌ 덮어쓰기가 안 됨
  ```
- 문자열로 클래스를 붙이지 마세요. `` `p-2 ${x}` `` ❌ → `cn('p-2', x)` ✅
- 파일명·함수명은 **PascalCase**, **named export**.
- props 타입은 `interface XxxProps` 로 따로 선언.
- HTML 기본 속성도 받으려면 `extends ButtonHTMLAttributes<HTMLButtonElement>` 처럼 확장하고,
  이름이 겹치는 속성(`title` 등)은 `Omit<..., 'title'>` 으로 제외한 뒤 다시 정의합니다.
- 종류(variant)가 여러 개면 객체로 모읍니다. `Button.tsx` 의 `variantStyles` 를 그대로 따라 하세요.

## 4. 반응형

`responsive-ui` 스킬의 규칙을 따릅니다. 요약하면 **모바일 기준으로 먼저 쓰고 `sm:` 로 키우기**.

- 버튼/입력창은 모바일에서 손가락으로 누를 수 있게 높이 `h-10`(40px) 이상.
- 가로로 늘어놓는 건 `flex flex-wrap` 또는 `grid grid-cols-1 sm:grid-cols-2`.

## 5. 확인

만든 뒤 `pnpm run typecheck` 을 돌리고, 어디서 어떻게 쓰는지 예시 2~3줄을 보여주세요.
