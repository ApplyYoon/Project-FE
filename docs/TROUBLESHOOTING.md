# 자주 나는 에러와 해결법

여기 없는 에러가 나면 `/fix <에러 메시지 붙여넣기>` 를 쓰세요.
해결한 뒤에는 **이 문서에 한 줄 추가해 주세요.** 다음 사람이 고생을 덜 합니다.

---

## 설치 / 실행

### `command not found: pnpm`

pnpm 이 안 깔려 있습니다.

```bash
npm install -g pnpm
```

### `Cannot find module` / 화면이 텅 비어 있음

패키지를 안 받았거나 꼬였습니다.

```bash
rm -rf node_modules
pnpm install
```

### `Port 5173 is already in use`

이미 개발 서버가 켜져 있습니다. 브라우저에서 http://localhost:5173 을 확인하세요.
정말 끄고 싶으면 서버를 켰던 터미널에서 `Ctrl + C`.

### Node 버전이 다르다고 나옴

이 프로젝트는 Node 22를 씁니다.

```bash
nvm use        # .nvmrc 를 읽어서 알아서 맞춰줍니다
```

---

## TypeScript

### `Property 'xxx' does not exist on type 'yyy'`

**뜻**: 그 타입에는 그런 속성이 없습니다. (오타이거나 타입 정의가 빠졌거나)

```tsx
interface User {
  name: string
}
user.nmae // ❌ 오타
user.age // ❌ User 에 age 가 없음 → interface 에 추가해야 함
```

### `Type 'string | undefined' is not assignable to type 'string'`

**뜻**: 값이 없을 수도 있는데(`undefined`) 꼭 있어야 하는 자리에 넣었습니다.

```tsx
const name = user.name ?? '이름 없음' // ✅ 없을 때 쓸 값을 정해줌
if (!user.name) return null // ✅ 없으면 미리 빠져나감
```

### `'xxx' is declared but its value is never read`

**뜻**: 만들어 놓고 안 썼습니다. 지우면 됩니다.

### `This syntax is not allowed when 'erasableSyntaxOnly' is enabled`

**뜻**: TypeScript 전용 문법 중 이 프로젝트에서 못 쓰는 것을 썼습니다.
주로 생성자 파라미터에 `public` 을 붙였을 때 납니다.

```ts
constructor(public status: number) {}   // ❌
// ✅ 이렇게
status: number
constructor(status: number) { this.status = status }
```

---

## React

### `Cannot read properties of undefined (reading 'xxx')`

**뜻**: 아직 값이 없는 것에서 뭘 꺼내려 했습니다. 데이터를 아직 못 받았을 때 자주 납니다.

```tsx
{
  user?.name
} // ✅ ?. 를 쓰면 없을 때 그냥 넘어감
{
  isLoading ? <p>불러오는 중...</p> : <p>{user.name}</p>
} // ✅
```

### `Each child in a list should have a unique "key" prop`

**뜻**: `map` 으로 목록을 만들 때 각 항목에 이름표(`key`)를 안 붙였습니다.

```tsx
{
  items.map((item) => <Card key={item.id}>...</Card>)
} // ✅ id 처럼 고유한 값
```

`key={index}` 는 되도록 피하세요. 순서가 바뀌면 화면이 이상해집니다.

### `Rendered more hooks than during the previous render`

**뜻**: `if` 문 안에서 `useState` 같은 훅을 썼습니다.
**훅은 항상 컴포넌트 맨 위에서, 조건 없이** 호출해야 합니다.

### `Too many re-renders`

**뜻**: 화면을 그리는 중에 상태를 바꿔서 무한반복에 빠졌습니다.

```tsx
<button onClick={setCount(1)}>   {/* ❌ 바로 실행됨 */}
<button onClick={() => setCount(1)}>  {/* ✅ 눌렀을 때 실행 */}
```

---

## Tailwind

### 클래스를 썼는데 아무 변화가 없음

1. 오타 확인 (`text-gray-900` ↔ `text-slate-900`)
2. 클래스 이름을 **문자열로 조립하지 않았는지** 확인 — Tailwind 가 못 찾습니다.
   ```tsx
   className={`text-${color}-500`}                    // ❌ 안 먹음
   className={cn(color === 'red' ? 'text-red-500' : 'text-blue-500')}  // ✅
   ```
3. 두 클래스가 충돌 중일 수 있습니다. → 반드시 `cn()` 으로 합치세요.

### 내가 만든 색(`bg-brand`)이 안 먹음

`src/index.css` 의 `@theme` 블록에 등록돼 있는지 확인하세요.
이 프로젝트는 Tailwind v4 라서 `tailwind.config.js` 가 **없습니다.**

---

## Git / GitHub

### `Updates were rejected because the remote contains work that you do not have`

**뜻**: GitHub에 내가 모르는 커밋이 있습니다.

```bash
git pull origin develop   # 또는  /sync
```

`git push --force` 로 해결하려 하지 마세요. 팀원 작업이 사라집니다.

### 커밋했는데 "커밋 메시지 형식이 규칙과 다릅니다" 라고 막혀요

`타입: 설명` 형식이 아니어서 그렇습니다.

```
feat: 로그인 폼 추가      ✅
로그인 폼 추가            ❌ 타입 없음
feat 로그인 폼 추가       ❌ 콜론(:) 없음
feat: 로그인 폼 추가.     ❌ 끝에 마침표
```

타입은 `feat` `fix` `refactor` `style` `docs` `chore` `test` 중 하나입니다.
`/save` 를 쓰면 메시지를 알아서 써줍니다.

### 커밋·푸시가 "main 브랜치에는 직접..." 이라고 막혀요

브랜치를 안 만들고 작업한 것입니다. 아직 커밋 전이면 그대로 브랜치만 만들면 됩니다.

```bash
git switch -c feat/작업이름
```

### husky 훅이 안 도는 것 같아요

```bash
pnpm install          # husky 는 install 할 때 설치됩니다
git config core.hooksPath    # .husky/_ 가 나와야 정상
```

### `fatal: not a git repository`

프로젝트 폴더 밖에서 명령을 쳤습니다. `cd Project-FE` 로 들어가세요.

### `/mcp` 에서 github 가 `does not support dynamic client registration` 으로 실패해요

**뜻**: GitHub MCP 에 보낼 로그인 토큰을 못 구했습니다.
GitHub 는 Authenticate 버튼 로그인을 지원하지 않아서, 이 프로젝트는 `gh` 에 로그인된 토큰을 꺼내 씁니다.

```bash
gh auth status   # 로그인 안 돼 있으면 → gh auth login
```

로그인 후 Claude Code 를 껐다 켜세요. 그래도 안 되면 `claude` 를 프로젝트 폴더 맨 위에서 켰는지 확인하세요.

---

## 기타

### 모바일에서 화면이 옆으로 밀려요 (가로 스크롤)

어딘가에 화면보다 넓은 요소가 있습니다.

- 고정 너비(`w-[600px]`) → `w-full max-w-xl` 로 바꾸기
- 긴 영어 단어/URL → `break-words` 추가
- 표나 코드블록 → `overflow-x-auto` 로 감싸기
