/**
 * "내가 준비하는 것" — 내신 · 수능 · 대회·자격증 · 기타 (2026-10-18)
 * 사용자: "시간표 바탕으로 하고, 내가 수능 준비면 그거, 대회 준비면 그거 넣어도 되고"
 *
 * 코치가 대화에서 한 번 묻고(pages/CoachPage.tsx), 설정의 계정 묶음에서 고칠 수 있습니다.
 * 코치가 오늘 계획을 같이 짤 때(AI 하루 계획) 재료로 씁니다. 읽을 때는 loadStudyFocus · describeFocus 를 씁니다.
 * 이 기기에만 저장합니다. '모든 기록 지우기' 에 들어 있습니다. (lib/myData.ts)
 */
import { loadData, saveData } from '@/lib/storage'

export type StudyFocusKind = 'SCHOOL_EXAM' | 'SUNEUNG' | 'CONTEST' | 'OTHER'

/** 내가 준비하는 것 */
export interface StudyFocus {
  kind: StudyFocusKind
  /** 대회 · 기타일 때 이름 한 줄 (예: '정보올림피아드'). 모르면 null */
  name: string | null
}

/** 고르는 칩 · 설정에 쓰는 보기 (순서대로 보여 줍니다) */
export const STUDY_FOCUS_OPTIONS: { kind: StudyFocusKind; label: string; emoji: string }[] = [
  { kind: 'SCHOOL_EXAM', label: '내신', emoji: '📘' },
  { kind: 'SUNEUNG', label: '수능', emoji: '📝' },
  { kind: 'CONTEST', label: '대회·자격증', emoji: '🏆' },
  { kind: 'OTHER', label: '기타', emoji: '✨' },
]

/** 이름 한 줄의 최대 글자 수 (서버도 30자까지 받습니다) */
export const FOCUS_NAME_MAX = 30

// 저장소에 넣는 이름입니다. (실제 키는 storage.ts 가 앞에 'study-' 를 붙여서 'study-focus')
const STORAGE_KEY = 'focus'

const KINDS: StudyFocusKind[] = STUDY_FOCUS_OPTIONS.map((option) => option.kind)

/** 이름을 따로 물어보는 종류인지 (대회 · 기타) */
export function needsFocusName(kind: StudyFocusKind): boolean {
  return kind === 'CONTEST' || kind === 'OTHER'
}

/** 보기의 이름 (예: 'SUNEUNG' -> '수능') */
export function focusLabelOf(kind: StudyFocusKind): string {
  return STUDY_FOCUS_OPTIONS.find((option) => option.kind === kind)?.label ?? '기타'
}

/**
 * 화면에 보여 줄 한 줄. 이름이 있으면 같이 씁니다.
 *
 *   describeFocus({ kind: 'SUNEUNG', name: null })              -> '수능'
 *   describeFocus({ kind: 'CONTEST', name: '정보올림피아드' })  -> '대회·자격증 · 정보올림피아드'
 */
export function describeFocus(focus: StudyFocus): string {
  const label = focusLabelOf(focus.kind)
  return focus.name ? `${label} · ${focus.name}` : label
}

/** 이름 한 줄을 다듬습니다. 비었으면 null, 길면 30자까지 */
export function cleanFocusName(text: string): string | null {
  const trimmed = text.trim().slice(0, FOCUS_NAME_MAX)
  return trimmed === '' ? null : trimmed
}

/** 저장해 둔 "내가 준비하는 것". 아직 안 골랐거나 저장된 값이 깨졌으면 null */
export function loadStudyFocus(): StudyFocus | null {
  const saved = loadData<unknown>(STORAGE_KEY, null)
  if (typeof saved !== 'object' || saved === null) return null
  const record = saved as Record<string, unknown>
  if (!KINDS.includes(record.kind as StudyFocusKind)) return null
  const name = typeof record.name === 'string' ? cleanFocusName(record.name) : null
  return { kind: record.kind as StudyFocusKind, name }
}

/** "내가 준비하는 것" 을 저장합니다. 내신 · 수능은 이름을 남기지 않습니다. */
export function saveStudyFocus(focus: StudyFocus): void {
  const name = needsFocusName(focus.kind) && focus.name ? cleanFocusName(focus.name) : null
  saveData(STORAGE_KEY, { kind: focus.kind, name })
}
