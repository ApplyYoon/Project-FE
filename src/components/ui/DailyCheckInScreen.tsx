import { MOOD_OPTIONS } from '@/lib/quickCheckIn'

interface DailyCheckInScreenProps {
  /** 기분을 하나 골랐을 때. 고른 값(1 ~ 5)을 넘겨줍니다. */
  onSelect: (mood: number) => void
}

/**
 * 그날 앱을 처음 열었을 때 나오는 1탭 체크인 화면입니다. (#242)
 * 기분 하나를 눌러야 앱으로 들어가고, 하루에 한 번만 나옵니다. (Layout 이 보여줍니다)
 *
 * <DailyCheckInScreen onSelect={(mood) => ...} />
 */
export function DailyCheckInScreen({ onSelect }: DailyCheckInScreenProps) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 pt-6 sm:pt-12">
      <div>
        <p className="text-brand text-sm font-semibold">오늘의 체크인</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">오늘 기분은 어때요?</h1>
        <p className="mt-2 break-keep text-slate-600">
          하루에 한 번만 물어요. 하나를 누르면 바로 시작해요.
        </p>
      </div>

      {/* grid-cols-5: 좁은 화면(375px)에서도 5개가 한 줄에 들어갑니다. min-w-0 이 있어야 글자가 길어도 칸이 안 늘어납니다. */}
      <div className="grid grid-cols-5 gap-2">
        {MOOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            // min-h-20 = 80px. 엄지로 누르기 쉬운 크기입니다.
            className="hover:border-brand hover:bg-brand-light flex min-h-20 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-1 py-2 shadow-sm transition-all active:scale-95"
          >
            {/* 이모지는 꾸밈이라 스크린리더가 읽지 않게 하고, 아래 글자를 읽게 합니다. */}
            <span aria-hidden className="text-3xl">
              {option.emoji}
            </span>
            <span className="text-xs font-medium break-keep text-slate-700">{option.label}</span>
          </button>
        ))}
      </div>

      <p className="text-sm break-keep text-slate-500">
        컨디션이나 오늘의 약속까지 적고 싶으면, 들어간 뒤 홈의 "자세히 체크인" 에서 할 수 있어요.
      </p>
    </section>
  )
}
