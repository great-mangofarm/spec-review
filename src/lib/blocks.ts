/**
 * 기획서(md/html) → 안전한 HTML + 문단 목록.
 *
 * 댓글은 "문단 id + 인용문"에 붙는다. 문단 id 를 위치가 아니라 **본문 텍스트의 해시**로
 * 만들기 때문에, 기획서를 고쳐 올려도 안 바뀐 문단의 댓글은 그 자리에 그대로 남는다.
 *
 * 해시 규칙은 한번 정하면 못 바꾼다. 바꾸는 순간 이미 달린 댓글이 전부 길을 잃는다.
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Block, DocFormat } from './types'

/** 이 목록에 해당하면서, 같은 목록에 해당하는 자손이 없는 요소만 "문단"으로 본다 */
const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, hr, img, figcaption, .mermaid-block'

marked.setOptions({ gfm: true, breaks: false })

/** 공백을 접어서 사소한 서식 차이로 해시가 흔들리지 않게 한다 */
const normalize = (text: string) => String(text ?? '').replace(/\s+/g, ' ').trim()

/**
 * FNV-1a 를 서로 다른 곱수로 두 번 돌려 64비트를 만든다.
 * crypto.subtle 은 비동기라 렌더 중에 못 쓰고, 문단 구분에는 이 정도면 충분하다.
 */
function hashText(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 0x01000193)
    h2 = Math.imul(h2 ^ code, 0x85ebca6b)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

export function sanitize(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'colspan', 'rowspan', 'align', 'start', 'type'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset'],
  })
}

/**
 * ```mermaid 코드블록을 그림이 들어갈 자리로 바꿔둔다.
 * 실제 그리기는 mermaid 라이브러리를 받아온 뒤에 따로 한다 (라이브러리가 무거워서).
 */
function extractMermaid(root: HTMLElement) {
  for (const code of Array.from(root.querySelectorAll('pre > code'))) {
    const isMermaid = code.className.split(/\s+/).includes('language-mermaid')
    if (!isMermaid) continue

    const holder = root.ownerDocument.createElement('div')
    holder.className = 'mermaid-block'
    holder.setAttribute('data-mermaid-src', code.textContent ?? '')
    holder.textContent = '' // 그리기 전에는 비워둔다

    code.parentElement?.replaceWith(holder)
  }
}

export interface RenderedDoc {
  html: string
  blocks: Block[]
}

export function renderDocument(source: string, format: DocFormat): RenderedDoc {
  const rawHtml =
    format === 'html' ? String(source ?? '') : (marked.parse(String(source ?? ''), { async: false }) as string)

  const holder = document.createElement('div')
  holder.innerHTML = sanitize(rawHtml)

  extractMermaid(holder)

  const blocks: Block[] = []
  const seen = new Map<string, number>()
  let index = 0

  for (const element of Array.from(holder.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))) {
    if (element.querySelector(BLOCK_SELECTOR)) continue // 가장 안쪽 문단만

    const text =
      element.classList.contains('mermaid-block')
        ? normalize(element.getAttribute('data-mermaid-src') ?? '')
        : normalize(element.textContent ?? '')

    const hash = hashText(text || `${element.tagName}:${index}`)
    const occurrence = (seen.get(hash) ?? 0) + 1
    seen.set(hash, occurrence)

    const id = `b_${hash}_${occurrence}`
    element.setAttribute('data-block-id', id)
    element.setAttribute('data-block-index', String(index))

    blocks.push({
      id,
      index,
      tag: element.classList.contains('mermaid-block') ? 'mermaid' : element.tagName.toLowerCase(),
      text,
    })
    index += 1
  }

  // 외부 링크는 새 탭으로, referrer 는 안 흘리게
  for (const anchor of Array.from(holder.querySelectorAll('a[href]'))) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }

  return { html: holder.innerHTML, blocks }
}

/** 업로드한 파일 이름과 내용으로 형식을 추정한다 */
export function detectFormat(filename = '', content = ''): DocFormat {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md'
  return /<(html|body|div|section|article|h[1-6]|table)\b/i.test(content) ? 'html' : 'md'
}

/** 제목 추정: md 는 첫 h1, html 은 title 또는 h1, 없으면 파일 이름 */
export function guessTitle(source: string, format: DocFormat, filename = ''): string {
  const text = String(source ?? '')

  if (format === 'md') {
    const heading = text.match(/^\s*#\s+(.+)$/m)
    if (heading) return heading[1].trim().slice(0, 200)
  } else {
    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (title) return normalize(title[1]).slice(0, 200)
    const h1 = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    if (h1) return normalize(h1[1].replace(/<[^>]+>/g, '')).slice(0, 200)
  }

  const base = filename.replace(/\.[^.]+$/, '').trim()
  return base || '제목 없는 기획서'
}
