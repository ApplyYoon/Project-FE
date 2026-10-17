import { Card } from '@/components/ui/Card'
import { useManualItems } from '@/hooks/useManualItems'
import type { ManualItem, ManualItemCategory } from '@/types'

// 분류 이름. 화면에 보여주는 순서도 이 배열 순서를 따릅니다.
const categories: { key: ManualItemCategory; label: string }[] = [
  { key: 'rhythm', label: '리듬' },
  { key: 'cautionDay', label: '주의할 날' },
  { key: 'effectiveMethod', label: '효과 있는 방법' },
  { key: 'careStyle', label: '잘 맞는 관리 방식' },
]

/** 'YYYY-MM-DD' 를 '10월 2일' 처럼 바꿉니다. */
function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}

export function ManualPage() {
  // 실험(#93)에서 효과가 확인되어 "나 사용설명서에 올리기" 를 누른 항목들입니다.
  const { items } = useManualItems()

  // 분류별로 묶습니다. 항목이 없는 분류는 카드를 만들지 않습니다.
  const groups = categories
    .map((category) => ({
      ...category,
      items: items.filter((item) => item.category === category.key),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">나 사용설명서</h1>
        <p className="mt-1 text-slate-600">
          실험과 기록으로 확인된 것만 쌓여요.
          {items.length > 0 && ` 지금까지 ${items.length}개, 하나하나가 내 나무의 열매예요.`}
        </p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-slate-500">
            실험에서 효과가 확인되면 여기에 쌓여요.
          </p>
        </Card>
      ) : (
        // 모바일 1열, PC 2열. items-start 로 카드마다 자기 높이만큼만 차지합니다.
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.key}>
              <h2 className="text-brand text-sm font-semibold">{group.label}</h2>
              {/* 한 분류에 항목이 여러 개면 가는 선으로 나눕니다. */}
              <ul className="mt-3 flex flex-col divide-y divide-slate-100">
                {group.items.map((item) => (
                  <ManualItemRow key={item.id} item={item} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

interface ManualItemRowProps {
  item: ManualItem
}

/** 항목 한 줄: 제목 + 근거 + 확인된 날짜 */
function ManualItemRow({ item }: ManualItemRowProps) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <h3 className="text-lg font-bold break-words text-slate-900">{item.title}</h3>
      <p className="mt-1 text-sm break-words text-slate-700">{item.evidence}</p>
      <p className="mt-2 text-xs text-slate-500">
        <time dateTime={item.confirmedDate}>{formatMonthDay(item.confirmedDate)}</time> 확인
      </p>
    </li>
  )
}
