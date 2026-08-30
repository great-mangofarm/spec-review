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
    // input 은 체크리스트(할 일 목록) 때문에 남긴다. form 을 막아둬서 제출은 안 된다.
    FORBID_TAGS: ['style', 'form', 'button', 'iframe', 'object', 'embed'],
    ADD_TAGS: ['input'],
    // hidden 도 지운다. 탭처럼 스크립트로 펼치는 문서는 스크립트가 지워지는 순간
    // 접힌 부분이 영영 안 보이게 되므로, 리뷰 화면에서는 전부 펼쳐 보인다.
    FORBID_ATTR: ['style', 'srcset', 'hidden'],
  })
}

/**
 * ```mermaid 코드블록을 그림이 들어갈 자리로 바꿔둔다.
 * 실제 그리기는 mermaid 라이브러리를 받아온 뒤에 따로 한다 (라이브러리가 무거워서).
 *
 * 이건 화면에 그릴 때만 한다. **저장 형식에는 코드블록 그대로 남긴다.**
 * DOMPurify 가 `-->` 가 들어간 속성값을 통째로 지우는데(mXSS 방어), mermaid 화살표가
 * 전부 `-->` 라서 다이어그램 코드를 data 속성에 담아 저장하면 다시 읽을 때 사라진다.
 * 텍스트(코드블록 안)로 두면 그 검사에 걸리지 않는다.
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

/**
 * 목록 항목과 표 칸 안의 문단 껍데기를 벗겨낸다.
 *
 * 마크다운 변환기는 `<li>글자</li>` 를 만들지만 편집기는 `<li><p>글자</p></li>` 로 되돌린다
 * (표 칸도 마찬가지). 그대로 두면 li·tr 이 최말단 문단이 아니게 되면서 문단 단위가
 * 통째로 달라지고, 거기 달아둔 댓글이 전부 위치를 잃는다.
 *
 * 벗겨내도 글자는 그대로라 문단 id(글자 해시)는 안 바뀐다. 느슨한 목록처럼 원래부터
 * `<li><p>` 인 문서도 여기서 같은 모양으로 맞춰진다.
 */
function unwrapContainerParagraphs(root: HTMLElement) {
  for (const container of Array.from(root.querySelectorAll('li, td, th'))) {
    for (const child of Array.from(container.children)) {
      if (child.tagName.toLowerCase() !== 'p') continue
      while (child.firstChild) container.insertBefore(child.firstChild, child)
      child.remove()
    }
  }
}

/**
 * iframe 포장을 벗긴다.
 *
 * AI 도구들이 HTML 을 내보낼 때 문서 전체를 `<iframe srcdoc="...">` 하나로 감싸는
 * 경우가 있다 (샌드박스 래퍼). iframe 은 살균에서 지워지므로 그대로 두면 문서가
 * 통째로 빈 화면이 된다. 본문이 사실상 iframe 하나뿐이면 안쪽 문서를 꺼내 쓴다.
 * DOMParser 는 스크립트를 실행하지 않으므로 살균 전에 파싱해도 안전하다.
 */
function unwrapIframeWrapper(raw: string): string {
  let current = raw
  for (let depth = 0; depth < 3; depth += 1) {
    const parsed = new DOMParser().parseFromString(current, 'text/html')
    const body = parsed.body
    const frames = body.querySelectorAll('iframe[srcdoc]')
    if (frames.length !== 1) return current

    // iframe 을 뺀 나머지에 실제 내용이 있으면 포장이 아니다
    const clone = body.cloneNode(true) as HTMLElement
    clone.querySelector('iframe[srcdoc]')?.remove()
    if ((clone.textContent ?? '').trim().length > 40) return current

    current = frames[0].getAttribute('srcdoc') ?? ''
  }
  return current
}

/** 살균 + 표 칸 정리까지만 한 상태의 본문 조각 */
function prepare(source: string, format: DocFormat): HTMLElement {
  const rawHtml =
    format === 'html'
      ? unwrapIframeWrapper(String(source ?? ''))
      : (marked.parse(String(source ?? ''), { async: false }) as string)

  const holder = document.createElement('div')
  holder.innerHTML = sanitize(rawHtml)
  unwrapContainerParagraphs(holder)
  return holder
}

/**
 * 저장할 HTML. 위지윅 편집기가 다루는 형식이 곧 저장 형식이라, 마크다운으로 올린
 * 문서도 올리는 시점에 한 번 HTML 로 바꿔 넣는다.
 *
 * data-block-id 는 넣지 않는다. 그건 화면에 그릴 때마다 본문에서 다시 계산하는
 * 값이라, 저장해두면 편집 후에 낡은 값이 남아 댓글 위치가 어긋난다.
 */
export function toStoredHtml(source: string, format: DocFormat): string {
  return prepare(source, format).innerHTML
}

/**
 * 문단을 대표하는 글자. 이 값의 해시가 곧 문단 id 라서, 같은 내용이면 어떤 경로로
 * 만들어진 HTML이든 같은 값이 나와야 한다.
 *
 * 표의 행이 까다롭다. 마크다운 변환기는 칸 사이에 줄바꿈을 넣고 편집기는 안 넣어서,
 * textContent 를 그냥 쓰면 "가 나 다" 와 "가나다" 로 갈린다. 칸 단위로 뽑아
 * 한 칸씩 띄워 붙이면 양쪽이 같아진다.
 */
function blockText(element: HTMLElement): string {
  if (element.classList.contains('mermaid-block')) {
    return normalize(element.getAttribute('data-mermaid-src') ?? '')
  }
  if (element.tagName.toLowerCase() === 'tr') {
    return normalize(
      Array.from(element.querySelectorAll('td, th'))
        .map((cell) => normalize(cell.textContent ?? ''))
        .join(' '),
    )
  }
  return normalize(element.textContent ?? '')
}

export interface RenderedDoc {
  html: string
  blocks: Block[]
}

export function renderDocument(source: string, format: DocFormat): RenderedDoc {
  const holder = prepare(source, format)
  extractMermaid(holder)

  const blocks: Block[] = []
  const seen = new Map<string, number>()
  let index = 0

  for (const element of Array.from(holder.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))) {
    if (element.querySelector(BLOCK_SELECTOR)) continue // 가장 안쪽 문단만

    const text = blockText(element)

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
