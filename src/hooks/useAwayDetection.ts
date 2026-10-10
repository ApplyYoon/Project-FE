import { toDateString } from '@/lib/away'
import { loadData, removeData, saveData } from '@/lib/storage'
import type { AwayRecord } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-away-records' 가 됩니다)
// 딴짓 기록 목록
const RECORDS_KEY = 'away-records'
// 나갔지만 아직 돌아오지 않은 상태. 돌아오기 전에 페이지가 닫히거나 새로 열려도 기록이 사라지지 않게 따로 적어 둡니다.
const PENDING_KEY = 'away-pending'

// 새로고침이 끝나기까지 걸리는 시간의 한계(밀리초). 이보다 오래 걸렸다면 새로고침이 아니라 정말 나갔다 온 것으로 봅니다.
const RELOAD_LIMIT_MS = 10_000

/** 나간 순간에 적어 두는 값입니다. 돌아오면 이걸로 AwayRecord 를 완성합니다. */
interface PendingAway {
  /** 나간 시각 (Date.now() 값) */
  leftAt: number
  /** 공부하던 과목 (Subject 의 id). 알 수 없으면 null */
  subjectId: string | null
}

/** 저장소에서 꺼낸 값이 우리가 저장한 딴짓 기록 모양이 맞는지 확인합니다. (깨진 값이 섞여도 앱이 멈추지 않게) */
function isAwayRecord(value: unknown): value is AwayRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    (record.subjectId === null || typeof record.subjectId === 'string') &&
    typeof record.leftAt === 'number' &&
    typeof record.returnedAt === 'number' &&
    typeof record.awayMs === 'number'
  )
}

function loadRecords(): AwayRecord[] {
  const saved = loadData<unknown>(RECORDS_KEY, [])
  return Array.isArray(saved) ? saved.filter(isAwayRecord) : []
}

function loadPending(): PendingAway | null {
  const saved = loadData<unknown>(PENDING_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const pending = saved as Record<string, unknown>
  if (typeof pending.leftAt !== 'number') return null
  if (pending.subjectId !== null && typeof pending.subjectId !== 'string') return null
  return { leftAt: pending.leftAt, subjectId: pending.subjectId }
}

/** 나간 정보(PendingAway)와 돌아온 시각으로 딴짓 기록 한 건을 만듭니다. */
function createRecord(pending: PendingAway, returnedAt: number): AwayRecord {
  return {
    id: `away-${pending.leftAt}`,
    date: toDateString(pending.leftAt),
    subjectId: pending.subjectId,
    leftAt: pending.leftAt,
    returnedAt,
    awayMs: Math.max(0, returnedAt - pending.leftAt),
  }
}

/**
 * 지금 페이지가 "새로고침으로 막 열린 것" 인지 확인합니다.
 * 브라우저는 새로고침할 때도 "화면이 사라졌다(hidden)" 는 신호를 보내서, 이걸 구분하지 않으면
 * F5 만 눌러도 딴짓으로 기록되고 타이머가 멈춰 버립니다.
 */
function isJustReloaded(leftAt: number): boolean {
  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined
  return navigation?.type === 'reload' && Date.now() - leftAt < RELOAD_LIMIT_MS
}

/**
 * 페이지가 (새로) 열렸을 때 저장소에 "나갔는데 아직 마무리 안 된" 흔적이 있으면, 어떻게 할지입니다.
 *   none     흔적 없음
 *   discard  이미 정지했거나 기록을 지운 뒤에 남은 오래된 흔적. 지우기만 합니다.
 *   wait     화면이 숨겨진 채 열렸습니다. 다시 보이게 될 때 마무리합니다.
 *   reload   새로고침이었습니다. 나간 게 아니니 흔적을 지우고 타이머를 다시 흐르게 합니다.
 *   finish   정말 나갔다가 돌아왔습니다. (예: 다른 주소로 갔다가 뒤로 가기, 닫았던 탭 다시 열기)
 */
type Leftover =
  | { action: 'none' }
  | { action: 'discard' }
  | { action: 'wait'; pending: PendingAway }
  | { action: 'reload' }
  | { action: 'finish'; record: AwayRecord }

/** 저장소의 흔적을 읽어서 할 일을 정합니다. 읽기만 하고 저장소는 바꾸지 않습니다. (바꾸는 건 훅 안의 effect 가 합니다) */
function readLeftover(isStarted: boolean): Leftover {
  const pending = loadPending()
  if (pending === null) return { action: 'none' }
  if (!isStarted) return { action: 'discard' }
  if (document.hidden) return { action: 'wait', pending }
  if (isJustReloaded(pending.leftAt)) return { action: 'reload' }
  return { action: 'finish', record: createRecord(pending, Date.now()) }
}

interface UseAwayDetectionOptions {
  /** 시작한 뒤 정지하기 전이면 true (일시정지 중이어도 true) */
  isStarted: boolean
  /** 시간이 흐르는 중이면 true */
  isRunning: boolean
  /** 쉬는 시간(뽀모도로 휴식)이면 true. 쉬는 중에 나가는 건 딴짓이 아니라서 멈추지도 기록하지도 않습니다. */
  isResting: boolean
  /** 공부 중인 과목 (Subject 의 id) */
  subjectId: string | null
  /** 타이머를 일시정지하는 함수 */
  pause: () => void
  /** 타이머를 다시 흐르게 하는 함수 */
  start: () => void
}

/**
 * 공부 중에 다른 탭·앱으로 나가면 타이머를 자동으로 일시정지하고,
 * 돌아오면 "얼마나 나갔다 왔는지" 알려 주면서 딴짓 기록으로 저장합니다.
 *
 *   const { awayNotice, awayCountToday, dismissAwayNotice } = useAwayDetection({ ... })
 *
 * 나갔는지는 `visibilitychange` 이벤트와 `document.hidden` 으로 압니다.
 * (탭을 바꾸거나, 다른 앱으로 가거나, 휴대폰 화면이 꺼지면 document.hidden 이 true 가 됩니다)
 * 돌아와도 타이머는 저절로 다시 흐르지 않습니다. 사용자가 시작을 눌러야 이어집니다.
 */
export function useAwayDetection(options: UseAwayDetectionOptions) {
  // 페이지가 열릴 때 한 번만 읽습니다. 나갔다 돌아와서 열린 거라면 그 기록이 처음부터 들어 있게 됩니다.
  const [leftover] = useState(() => readLeftover(options.isStarted))

  const [records, setRecords] = useState<AwayRecord[]>(() => {
    const saved = loadRecords()
    return leftover.action === 'finish' ? [...saved, leftover.record] : saved
  })
  // 돌아왔을 때 보여줄 안내. 방금 끝난 딴짓 한 번의 기록입니다.
  const [awayNotice, setAwayNotice] = useState<AwayRecord | null>(
    leftover.action === 'finish' ? leftover.record : null,
  )

  // 나간 뒤 아직 돌아오지 않았다면 그 정보가 들어 있습니다.
  const pendingRef = useRef<PendingAway | null>(null)

  // 이벤트 함수는 처음 한 번만 달아 두기 때문에, 항상 "가장 최근 값"을 보도록 ref 에 담아 둡니다.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  // 기록이 늘어날 때마다 저장합니다.
  useEffect(() => {
    saveData(RECORDS_KEY, records)
  }, [records])

  // 페이지가 열릴 때 읽어 둔 흔적을 정리합니다. (여러 번 실행돼도 결과가 같습니다)
  useEffect(() => {
    if (leftover.action === 'none') return

    if (leftover.action === 'wait') {
      pendingRef.current = leftover.pending
      return
    }

    // discard · reload · finish 는 모두 저장소의 흔적을 지우면 끝입니다.
    removeData(PENDING_KEY)

    // 새로고침 때문에 멈춰 버린 타이머는 다시 흐르게 합니다.
    if (leftover.action === 'reload' && !optionsRef.current.isRunning) {
      optionsRef.current.start()
    }
  }, [leftover])

  // 탭을 떠나거나 돌아올 때를 지켜봅니다.
  useEffect(() => {
    function handleVisibilityChange() {
      const { isRunning, isResting, subjectId, pause } = optionsRef.current

      if (document.hidden) {
        // 시간이 흐르는 중일 때만 딴짓입니다. (이미 멈춰 있거나, 쉬는 중이거나, 이미 나간 상태면 무시)
        if (!isRunning || isResting || pendingRef.current !== null) return

        const pending: PendingAway = { leftAt: Date.now(), subjectId }
        pendingRef.current = pending
        // 휴대폰은 화면이 꺼진 직후 페이지가 얼어붙을 수 있어서, 나간 사실을 지금 바로 저장소에 적어 둡니다.
        saveData(PENDING_KEY, pending)
        // flushSync: 일시정지도 지금 바로 화면·저장소에 반영합니다. (평소 방식은 조금 뒤에 반영돼서 그 사이에 얼어붙을 수 있습니다)
        flushSync(() => pause())
        return
      }

      // 돌아왔고, 나갔던 기록이 있다면 마무리합니다.
      const pending = pendingRef.current
      if (pending === null) return

      const record = createRecord(pending, Date.now())
      // 같은 딴짓이 두 번 기록되지 않도록 먼저 지웁니다.
      pendingRef.current = null
      removeData(PENDING_KEY)

      setRecords((prev) => [...prev, record])
      setAwayNotice(record)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const dismissAwayNotice = useCallback(() => setAwayNotice(null), [])

  // 안내가 뜬 날, 몇 번째 딴짓인지 알려 줍니다.
  const awayCountToday = awayNotice
    ? records.filter((record) => record.date === awayNotice.date).length
    : 0

  return { awayNotice, awayCountToday, dismissAwayNotice }
}
