/**
 * 본문 DOM 에 댓글을 붙이는 장치.
 *
 * - 인라인 댓글: 문단 텍스트의 [시작, 끝) 구간을 <mark> 로 감싼다
 * - 문단 댓글: 문단 오른쪽 여백에 말풍선 배지를 단다
 *
 * 여백 버튼은 **글자가 없는 버튼**(SVG 아이콘)이다. 버튼에 글자가 들어가면
 * element.textContent 가 바뀌어서 인라인 댓글의 문자 위치가 통째로 어긋난다.
 */
import type { AnchoredComment } from './types'

export interface SelectionAnchor {
  blockId: string
  quote: string
  quoteStart: number
  rect: { top: number; left: number; width: number }
}

const HIGHLIGHT_CLASS = 'spec-hl'

/** 자식을 못 넣거나, 넣어봐야 깨지는 태그 */
const NO_GUTTER = new Set(['hr', 'img', 'tr', 'td', 'th'])

const ICON_BUBBLE =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.6c3.5 0 6.4 2.3 6.4 5.1S11.5 11.8 8 11.8c-.5 0-1-.04-1.5-.13L3 13.5l.7-2.4C2.4 10.2 1.6 8.7 1.6 6.7 1.6 3.9 4.5 1.6 8 1.6Z"/></svg>'
const ICON_PLUS =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>'

function collectTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const out: { node: Text; start: number }[] = []
  let position = 0
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    out.push({ node, start: position })
    position += node.data.length
  }
  return out
}

/** (노드, 노드 안 위치) → 문단 처음부터 센 문자 위치 */
function offsetWithinBlock(block: HTMLElement, node: Node, offset: number): number | null {
  for (const entry of collectTextNodes(block)) {
    if (entry.node === node) return entry.start + offset
  }
  // 더블클릭 등으로 텍스트 노드가 아니라 요소가 잡힌 경우
  if (node.nodeType === Node.ELEMENT_NODE) {
    const child = node.childNodes[offset]
    if (child) {
      for (const entry of collectTextNodes(block)) {
        if (entry.node === child || child.contains(entry.node)) return entry.start
      }
    }
  }
  return null
}

/** 지금 드래그한 영역을 "문단 + 위치 + 인용문"으로 바꾼다. 문단을 넘어가면 시작 문단까지만 자른다. */
export function readSelection(container: HTMLElement): SelectionAnchor | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (!container.contains(range.startContainer)) return null

  const startElement =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as HTMLElement)
  const block = startElement?.closest<HTMLElement>('[data-block-id]')
  if (!block) return null

  const blockText = block.textContent ?? ''
  const start = offsetWithinBlock(block, range.startContainer, range.startOffset)
  if (start === null) return null

  const rawEnd = block.contains(range.endContainer)
    ? offsetWithinBlock(block, range.endContainer, range.endOffset)
    : blockText.length
  const end = Math.min(blockText.length, Math.max(start + 1, rawEnd ?? blockText.length))

  const raw = blockText.slice(start, end)
  const quote = raw.trim()
  if (!quote) return null

  // 앞쪽 공백을 잘라낸 만큼 시작 위치를 밀어준다
  const lead = raw.length - raw.trimStart().length
  const rect = range.getBoundingClientRect()

  return {
    blockId: block.dataset.blockId!,
    quote: quote.slice(0, 2000),
    quoteStart: start + lead,
    rect: { top: rect.top, left: rect.left, width: rect.width },
  }
}

function locateQuote(block: HTMLElement, comment: AnchoredComment): [number, number] | null {
  const text = block.textContent ?? ''
  const quote = comment.quote
  if (!quote) return null

  const at = comment.quoteStart
  if (at !== null && at >= 0 && text.slice(at, at + quote.length) === quote) {
    return [at, at + quote.length]
  }
  const found = text.indexOf(quote)
  return found >= 0 ? [found, found + quote.length] : null
}

function wrapRange(
  block: HTMLElement,
  start: number,
  end: number,
  comment: AnchoredComment,
  active: boolean,
) {
  const targets = collectTextNodes(block).filter(
    ({ node, start: nodeStart }) => nodeStart < end && nodeStart + node.data.length > start,
  )

  for (const { node, start: nodeStart } of targets) {
    const from = Math.max(0, start - nodeStart)
    const to = Math.min(node.data.length, end - nodeStart)
    if (to <= from) continue

    let target = node
    if (to < target.data.length) target.splitText(to)
    if (from > 0) target = target.splitText(from)

    const mark = document.createElement('mark')
    mark.className = [HIGHLIGHT_CLASS, comment.resolved ? 'is-resolved' : '', active ? 'is-active' : '']
      .filter(Boolean)
      .join(' ')
    mark.dataset.threadId = comment.id
    mark.title = `${comment.authorName}: ${comment.body.slice(0, 80)}`

    target.parentNode?.replaceChild(mark, target)
    mark.appendChild(target)
  }
}

export function clearDecorations(container: HTMLElement) {
  for (const mark of Array.from(container.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`))) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
  for (const button of Array.from(container.querySelectorAll('.spec-gutter'))) {
    button.remove()
  }
  for (const block of Array.from(container.querySelectorAll<HTMLElement>('[data-block-id]'))) {
    block.classList.remove('has-comments', 'is-active-block')
    block.removeAttribute('data-thread-count')
  }
}

/** 하이라이트와 배지를 전부 다시 그린다. 자주 도는 코드가 아니라 통째로 다시 그리는 편이 안전하다. */
export function decorate(
  container: HTMLElement,
  comments: AnchoredComment[],
  activeThreadId: string | null,
) {
  clearDecorations(container)

  const roots = comments.filter((c) => !c.parentId && !c.orphaned && c.scope !== 'doc')
  const byBlock = new Map<string, AnchoredComment[]>()
  for (const comment of roots) {
    if (!comment.blockId) continue
    const list = byBlock.get(comment.blockId) ?? []
    list.push(comment)
    byBlock.set(comment.blockId, list)
  }

  for (const block of Array.from(container.querySelectorAll<HTMLElement>('[data-block-id]'))) {
    const blockId = block.dataset.blockId!
    const attached = byBlock.get(blockId) ?? []
    const decorable = !NO_GUTTER.has(block.tagName.toLowerCase())

    for (const comment of attached.filter((c) => c.scope === 'inline')) {
      const span = locateQuote(block, comment)
      if (span) wrapRange(block, span[0], span[1], comment, comment.id === activeThreadId)
    }

    if (!decorable) continue

    const blockLevel = attached.filter((c) => c.scope === 'block')
    if (blockLevel.length > 0) {
      block.classList.add('has-comments')
      block.setAttribute('data-thread-count', String(blockLevel.length))
      if (blockLevel.some((c) => c.id === activeThreadId)) block.classList.add('is-active-block')

      const badge = document.createElement('button')
      badge.type = 'button'
      badge.className = 'spec-gutter spec-gutter-badge'
      badge.dataset.threadId = blockLevel[0].id
      badge.setAttribute('aria-label', `이 문단의 댓글 ${blockLevel.length}개 보기`)
      badge.innerHTML = ICON_BUBBLE
      block.appendChild(badge)
    }

    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'spec-gutter spec-gutter-add'
    // data-block-id 를 쓰면 문단 선택자에 이 버튼까지 걸린다. 이름을 따로 둔다.
    add.dataset.addBlock = blockId
    add.setAttribute('aria-label', '이 문단에 댓글 달기')
    add.innerHTML = ICON_PLUS
    block.appendChild(add)
  }
}

export function scrollToBlock(container: HTMLElement, blockId: string) {
  const block = container.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
  if (!block) return
  block.scrollIntoView({ behavior: 'smooth', block: 'center' })
  block.classList.add('is-flash')
  window.setTimeout(() => block.classList.remove('is-flash'), 1200)
}

/**
 * 문서가 개정되면 붙어 있던 문단이 사라질 수 있다.
 * 문단이 없어졌고 인용문도 문서 어디에도 없으면 "위치를 잃음"으로 표시한다. 댓글을 지우지는 않는다.
 */
export function markOrphans<T extends { scope: string; blockId: string | null; quote: string | null; parentId: string | null }>(
  comments: T[],
  blocks: { id: string; text: string }[],
): (T & { orphaned: boolean })[] {
  const byId = new Map(blocks.map((b) => [b.id, b.text]))
  const wholeText = blocks.map((b) => b.text).join('\n')
  const collapse = (value: string) => value.replace(/\s+/g, ' ').trim()

  return comments.map((comment) => {
    if (comment.scope === 'doc' || comment.parentId) return { ...comment, orphaned: false }

    const blockText = comment.blockId === null ? undefined : byId.get(comment.blockId)
    const quote = comment.quote ? collapse(comment.quote) : ''

    if (blockText === undefined) {
      return { ...comment, orphaned: !(quote && wholeText.includes(quote)) }
    }
    if (comment.scope === 'inline' && quote && !blockText.includes(quote)) {
      return { ...comment, orphaned: !wholeText.includes(quote) }
    }
    return { ...comment, orphaned: false }
  })
}
