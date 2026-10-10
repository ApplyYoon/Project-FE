/// <reference types="vite/client" />

/**
 * `.env` 에 넣을 수 있는 환경변수의 이름과 모양입니다. (견본은 저장소 맨 위의 .env.example)
 * 여기에 적어 두면 `import.meta.env.VITE_API_BASE_URL` 을 쓸 때 오타를 타입 검사가 잡아 줍니다.
 */
interface ImportMetaEnv {
  /** BE 서버 주소 (예: http://localhost:8080/api/v1). 비워 두면 api.ts 의 기본값을 씁니다. */
  readonly VITE_API_BASE_URL?: string
  /** 'false' 면 로그인 화면의 테스트 로그인을 숨깁니다. 비워 두면 보입니다. (lib/testLogin.ts) */
  readonly VITE_TEST_LOGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
