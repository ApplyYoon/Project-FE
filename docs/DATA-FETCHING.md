# 서버에서 데이터 받아오기 (TanStack Query)

서버에서 받아오는 데이터는 **TanStack Query** 로 다룹니다. (2026-10-10 에 정했습니다)
이 문서는 "서버 데이터를 화면에 보여주려면 무엇을 어디에 쓰는지" 를 정리한 것입니다.

> 한 줄 요약: **쿼리 설정은 `lib/` 에, 받아오는 컴포넌트는 `useSuspenseQuery` 로, 그 바깥을 `AsyncBoundary` 로 감싼다.**

---

## 1. 왜 쓰나요?

`useEffect` 안에서 `fetch` 를 직접 부르면 화면마다 이런 것을 손으로 만들어야 합니다.

- 받아오는 중인지(`isLoading`), 실패했는지(`error`) 를 `useState` 로 들고 있기
- 같은 데이터를 두 화면에서 쓰면 두 번 받아오기
- 응답이 늦게 온 것이 나중 것을 덮어쓰지 않게 막기

TanStack Query 는 이것을 대신 해 줍니다. 받아온 데이터를 잠깐 보관해 두고(캐시), 같은 것을 또 물으면 바로 보여줍니다.

## 2. 무엇에 쓰고, 무엇에는 안 쓰나요?

| 데이터                                       | 어떻게                                  |
| -------------------------------------------- | --------------------------------------- |
| **서버에서 받아오는 것** (학교 검색 등)      | TanStack Query (`useSuspenseQuery`)     |
| **브라우저 저장소에 있는 것** (계획·기록 등) | 지금처럼 `hooks/` 의 훅 (`usePlans` 등) |
| 화면 안에서만 쓰는 값 (입력 칸, 열림·닫힘)   | `useState`                              |

계획·기록·과목은 아직 브라우저 저장소(localStorage)에 있습니다. 서버 API 가 생기면(#201 ~ #203) 그때 이 방식으로 옮깁니다.

## 3. 세 조각

### ① 쿼리 설정 — `lib/` 에 `queryOptions` 로

서버를 부르는 함수 바로 옆에 둡니다. **무엇을(queryKey) 어떻게(queryFn) 받아오는지** 를 한 곳에 적습니다.

```ts
// src/lib/schoolSearch.ts
import { queryOptions } from '@tanstack/react-query'

export function schoolSearchQuery(query: string) {
  return queryOptions({
    // 이름표. 이름표가 같으면 같은 데이터로 보고, 보관해 둔 것을 다시 씁니다.
    queryKey: ['schools', normalizeSchoolQuery(query)],
    // 실제로 받아오는 함수
    queryFn: () => searchHighSchools(query),
    // 이 시간 동안은 다시 받아오지 않습니다 (10분)
    staleTime: 10 * 60 * 1000,
  })
}
```

- 이름은 `무엇Query` 로 짓습니다. (`schoolSearchQuery`, `subjectsQuery`)
- `queryKey` 의 첫 칸은 데이터의 종류(`'schools'`), 그 뒤는 조건(검색어·날짜·id)입니다.
- 받아오는 함수가 받는 값은 **전부 `queryKey` 에도** 넣습니다. 안 넣으면 조건이 바뀌어도 예전 결과가 보입니다.

### ② 받아오는 컴포넌트 — `useSuspenseQuery`

```tsx
function SchoolResults({ query }: SchoolResultsProps) {
  const { data } = useSuspenseQuery(schoolSearchQuery(query))
  // 여기서는 data 가 항상 있습니다. 로딩 중·실패를 if 로 나누지 않습니다.
  return (
    <ul>
      {data.schools.map((school) => (
        <li key={school.code}>{school.name}</li>
      ))}
    </ul>
  )
}
```

`useSuspenseQuery` 는 받아오는 동안 이 컴포넌트를 **잠깐 멈춰** 둡니다. 그래서 `data` 가 "있을 때" 만 그리면 됩니다.

### ③ 감싸는 틀 — `AsyncBoundary` + 스켈레톤

멈춰 있는 동안 무엇을 보여줄지, 실패하면 무엇을 보여줄지는 **바깥에서** 정합니다.

```tsx
<AsyncBoundary
  pendingFallback={<SchoolResultsSkeleton />} // 받아오는 동안 (스켈레톤)
  errorMessage="학교를 검색하지 못했어요. 다시 시도해 주세요." // 실패했을 때
  resetKeys={[query]} // 이 값이 바뀌면 실패 상태를 지움
>
  <SchoolResults query={query} />
</AsyncBoundary>
```

- `AsyncBoundary` (`components/ui/AsyncBoundary.tsx`) 는 `Suspense` + `react-error-boundary` 의 `ErrorBoundary` 를 묶어 둔 것입니다. 실패하면 안내와 **"다시 시도"** 버튼이 나옵니다.
- 스켈레톤은 `Skeleton` (`components/ui/Skeleton.tsx`) 으로 만듭니다. **진짜 내용과 같은 크기**로 그려야 내용이 도착했을 때 화면이 덜컹거리지 않습니다.

```tsx
function SchoolResultsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">학교를 찾는 중이에요</span>
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  )
}
```

## 4. 자주 하는 실수

- ❌ **`useSuspenseQuery` 를 부르는 컴포넌트 안에서 `AsyncBoundary` 를 쓰기.** 틀은 반드시 **바깥(부모)** 에 있어야 합니다. 그래서 받아오는 부분을 작은 컴포넌트로 따로 뺍니다.
- ❌ `useEffect` + `fetch` + `useState` 로 서버 데이터를 받아오기. → `useSuspenseQuery` 를 씁니다.
- ❌ `queryKey` 를 문자열 하나로 쓰기 (`['schools-디지털']`). → 종류와 조건을 나눕니다 (`['schools', '디지털']`).
- ❌ 받아온 데이터를 다시 `useState` 에 복사하기. → `data` 를 그대로 씁니다.
- ❌ 로그인 토큰·비밀번호 같은 것을 `queryKey` 에 넣기. → `queryKey` 는 개발자 도구에 그대로 보입니다.

## 5. 값을 바꿀 때 (추가·수정·삭제)

서버의 값을 바꾸는 일은 `useMutation` 으로 하고, 성공하면 관련 쿼리를 다시 받아오게(`invalidateQueries`) 합니다.
아직 이 프로젝트에 쓰는 곳이 없습니다. 서버 저장을 붙일 때(#201 ~ #203) 예시를 이 문서에 더합니다.

## 6. 기본 설정

`src/lib/queryClient.ts` 에 있습니다.

| 설정                   | 값    | 이유                                                             |
| ---------------------- | ----- | ---------------------------------------------------------------- |
| `staleTime`            | 1분   | 받아온 뒤 1분은 다시 받아오지 않음                               |
| `retry`                | 1번   | 실패하면 한 번만 더 시도 (기본 3번은 실패 안내가 늦게 뜸)        |
| `refetchOnWindowFocus` | 꺼 둠 | 다른 탭에 갔다 와도 저절로 다시 받지 않음 (타이머 화면이 깜빡임) |
