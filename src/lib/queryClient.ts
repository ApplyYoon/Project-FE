/**
 * TanStack Query 의 "보관함"(QueryClient)입니다. 앱 전체에서 하나만 만들어 씁니다. (App.tsx 에서 앱을 감쌉니다)
 *
 * 서버에서 받아온 데이터를 여기에 잠깐 보관(캐시)해 두어서, 같은 것을 또 물어보면 서버에 다시 가지 않고 바로 보여줍니다.
 * 쓰는 법은 docs/DATA-FETCHING.md 에 있습니다.
 *
 * ⚠️ 여기에는 "서버에서 받아오는 데이터" 만 넣습니다. 브라우저 저장소(localStorage)에 있는 계획·기록은
 *    지금처럼 hooks/ 의 훅으로 읽습니다. 서버 API 가 생기면 그때 이쪽으로 옮깁니다. (#201 ~ #203)
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 받아온 뒤 1분 동안은 "아직 새것" 으로 보고 다시 받아오지 않습니다. (staleTime = 신선한 시간)
      staleTime: 60 * 1000,
      // 실패하면 한 번만 더 시도합니다. 기본값(3번)은 실패 안내가 뜰 때까지 너무 오래 걸립니다.
      retry: 1,
      // 다른 탭·앱에 갔다 돌아왔을 때 저절로 다시 받아오지 않습니다. 공부 타이머 화면이 깜빡이지 않게 하려는 것입니다.
      refetchOnWindowFocus: false,
    },
  },
})
