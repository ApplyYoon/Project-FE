import { useSearchParams } from 'react-router-dom'

interface UseQueryParamOptions {
  /**
   * true 면 기록(뒤로 가기)에 남기지 않고 지금 주소를 바꿉니다.
   * 날짜를 ◀ ▶ 로 여러 번 넘길 때처럼, 뒤로 가기를 그 횟수만큼 눌러야 하는 일을 막을 때 씁니다.
   * 기본은 false 라서, 탭을 바꾸면 뒤로 가기로 앞에 보던 탭에 돌아갑니다.
   */
  replace?: boolean
}

/**
 * 주소의 ?이름=값 을 useState 처럼 쓰는 훅입니다.
 * 탭·날짜·단계처럼 "지금 무엇을 보고 있는지" 를 주소에 담을 때 씁니다.
 *
 *   const [view, setView] = useQueryParam('view', 'weekly')
 *
 *   /report               -> view === 'weekly'    (주소에 없으면 기본값)
 *   /report?view=monthly  -> view === 'monthly'
 *   setView('monthly')    -> 주소가 /report?view=monthly 로 바뀝니다
 *   setView('weekly')     -> 주소가 /report 로 바뀝니다 (기본값은 주소에 적지 않습니다)
 *
 * 주소에 담으면 좋은 점
 *   - 새로고침해도 보던 탭이 그대로입니다.
 *   - 뒤로 가기를 누르면 앞에 보던 탭으로 돌아갑니다.
 *   - 주소를 복사해서 보내면 받는 사람에게도 같은 화면이 열립니다.
 *
 * ⚠️ 주소는 누구나 손으로 고칠 수 있습니다. 받은 값이 쓸 수 있는 값인지는 쓰는 쪽에서 꼭 확인하세요.
 *    (예: view 가 'monthly' 가 아니면 모두 'weekly' 로 본다)
 * ⚠️ 주소에는 비밀번호·이름 같은 개인 내용을 담지 않습니다. 주소는 기록에 남고 다른 사람에게 보이기 쉽습니다.
 */
export function useQueryParam(
  name: string,
  defaultValue: string,
  options: UseQueryParamOptions = {},
): [string, (nextValue: string) => void] {
  // useSearchParams: 주소의 ? 뒷부분을 읽고 바꾸는 React Router 의 훅입니다.
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(name) ?? defaultValue

  function setValue(nextValue: string) {
    setSearchParams(
      (previous) => {
        // 지금 주소의 값들을 복사한 뒤 이 이름의 값만 바꿉니다. 다른 ?값은 그대로 둡니다.
        const next = new URLSearchParams(previous)
        if (nextValue === defaultValue) next.delete(name)
        else next.set(name, nextValue)
        return next
      },
      { replace: options.replace ?? false },
    )
  }

  return [value, setValue]
}
