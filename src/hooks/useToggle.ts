import { useCallback, useState } from 'react'

/**
 * true/false 를 뒤집는 상태를 만들어 줍니다. (모달 열기/닫기 등에 사용)
 *
 *   const [isOpen, toggle, setIsOpen] = useToggle()
 */
export function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => setValue((prev) => !prev), [])

  return [value, toggle, setValue] as const
}
