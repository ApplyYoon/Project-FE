import { cn } from '@/lib/cn'
import { GoogleLogin } from '@react-oauth/google'
import { useEffect, useRef, useState } from 'react'

// 구글 버튼의 가장 넓은 폭(px). 구글이 400 보다 넓게는 그려 주지 않습니다.
const GOOGLE_BUTTON_MAX_WIDTH = 400

interface GoogleButtonProps {
  /** 구글이 신분증(credential)을 줬을 때 */
  onCredential: (credential: string) => void
  /** 구글 창이 실패했을 때 */
  onFail: () => void
  className?: string
}

/**
 * [Google 계정으로 계속하기] 버튼입니다. 버튼은 구글이 직접 그립니다. (@react-oauth/google 의 GoogleLogin)
 * 로그인 화면과 내 계정의 탈퇴 확인 창에서 씁니다.
 *
 * 구글 버튼은 폭을 숫자(px)로만 받아서, 감싼 칸의 폭을 재서 넘겨줍니다. 화면을 돌려 폭이 바뀌면 다시 잽니다.
 * ⚠️ 구글은 400px 보다 넓게 그려 주지 않습니다. 버튼이 칸을 꽉 채우게 하려면 쓰는 쪽의 칸을 max-w-md(448px) 이하로 둡니다.
 *
 *   <GoogleButton onCredential={handleCredential} onFail={() => setError('다시 눌러 주세요.')} />
 */
export function GoogleButton({ onCredential, onFail, className }: GoogleButtonProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  // 감싼 칸의 폭. 재기 전에는 null 이라 버튼을 그리지 않습니다.
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    // ResizeObserver: 칸의 크기가 바뀔 때마다 알려 주는 브라우저 기능입니다.
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.min(GOOGLE_BUTTON_MAX_WIDTH, Math.floor(entry.contentRect.width)))
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  return (
    // min-h-10: 버튼이 그려지기 전에도 자리를 잡아 두어서 아래 내용이 들썩이지 않게 합니다.
    <div ref={boxRef} className={cn('flex min-h-10 w-full justify-center', className)}>
      {width !== null && (
        <GoogleLogin
          onSuccess={(response) => {
            if (response.credential) onCredential(response.credential)
            else onFail()
          }}
          onError={onFail}
          text="continue_with"
          shape="rectangular"
          width={width}
        />
      )}
    </div>
  )
}
