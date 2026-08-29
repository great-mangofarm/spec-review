/**
 * 아바타에 넣을 글자.
 *
 * 디자인시스템 규칙대로 이름의 **뒤 두 글자**를 쓴다.
 * 한국어 이름은 앞 글자가 성이라, 뒤 두 글자여야 사람이 구분된다. (정예푸 → 예푸)
 */
export function initialsOf(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '?'
  return trimmed.slice(-2)
}
