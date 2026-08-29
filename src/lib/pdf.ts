/**
 * 기획서를 PDF 로 내보낸다.
 *
 * 화면을 사진 찍는 방식이 아니라 문서 구조를 PDF 로 다시 그린다. 그래서
 * 나온 PDF 에서 글자를 드래그해 복사할 수 있고 검색도 된다. 다이어그램도
 * mermaid 가 만든 SVG 를 벡터 그대로 넣기 때문에 확대해도 안 깨진다.
 *
 * 무거운 것(pdfmake, mermaid, 한글 폰트 2.5MB×2)은 전부 내보내기를 누른 뒤에
 * 받아온다. 평소 화면 로딩에는 얹히지 않는다.
 */
import type { Content, ContentTable, TDocumentDefinitions } from 'pdfmake/interfaces'
import { renderDocument } from './blocks'
import { renderMermaidToSvg } from './mermaid'
import type { DocFormat } from './types'

export type PdfOrientation = 'portrait' | 'landscape'

const PAGE_MARGIN = 44
const PAGE_WIDTH = { portrait: 595.28, landscape: 841.89 }
const PAGE_HEIGHT = { portrait: 841.89, landscape: 595.28 }

const contentWidth = (orientation: PdfOrientation) => PAGE_WIDTH[orientation] - PAGE_MARGIN * 2
// 바닥글 자리까지 빼둔다
const contentHeight = (orientation: PdfOrientation) => PAGE_HEIGHT[orientation] - PAGE_MARGIN * 2 - 24

// ── 폰트 ──────────────────────────────────────────────────────

let fontsReady: Promise<void> | null = null

async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`폰트를 불러오지 못했습니다: ${url}`)
  const buffer = new Uint8Array(await response.arrayBuffer())

  // btoa 는 인수 길이 제한이 있어서 잘라서 넘긴다
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function ensureFonts(pdfMake: typeof import('pdfmake/build/pdfmake')) {
  if (fontsReady) return fontsReady

  fontsReady = (async () => {
    const [regular, bold] = await Promise.all([
      fetchAsBase64('/fonts/Pretendard-Regular.ttf'),
      fetchAsBase64('/fonts/Pretendard-Bold.ttf'),
    ])

    pdfMake.addVirtualFileSystem({
      'Pretendard-Regular.ttf': regular,
      'Pretendard-Bold.ttf': bold,
    })
    // Pretendard 에는 이탤릭 자체가 없다. 기울임은 정체로 대체된다.
    pdfMake.addFonts({
      Pretendard: {
        normal: 'Pretendard-Regular.ttf',
        bold: 'Pretendard-Bold.ttf',
        italics: 'Pretendard-Regular.ttf',
        bolditalics: 'Pretendard-Bold.ttf',
      },
    })
  })()

  return fontsReady
}

// ── 인라인 서식 ────────────────────────────────────────────────

interface Run {
  text: string
  bold?: boolean
  italics?: boolean
  link?: string
  color?: string
  decoration?: 'underline'
  style?: string
}

/** 문단 안의 굵게·기울임·링크·인라인코드를 조각으로 편다 */
function inlineRuns(node: Node, inherited: Partial<Run> = {}): Run[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return text ? [{ ...inherited, text }] : []
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  const next: Partial<Run> = { ...inherited }

  if (tag === 'strong' || tag === 'b') next.bold = true
  if (tag === 'em' || tag === 'i') next.italics = true
  if (tag === 'code') next.style = 'inlineCode'
  if (tag === 'br') return [{ text: '\n' }]
  if (tag === 'a') {
    const href = element.getAttribute('href')
    if (href && /^https?:/i.test(href)) {
      next.link = href
      next.color = '#1d4ed8'
      next.decoration = 'underline'
    }
  }

  return Array.from(element.childNodes).flatMap((child) => inlineRuns(child, next))
}

const runsOf = (element: Element): Run[] =>
  Array.from(element.childNodes).flatMap((child) => inlineRuns(child))

const plainText = (element: Element) => (element.textContent ?? '').trim()

// ── 이미지 ────────────────────────────────────────────────────

async function imageToDataUrl(src: string): Promise<string | null> {
  if (src.startsWith('data:')) return src
  try {
    const response = await fetch(src, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    // 다른 도메인 이미지는 브라우저가 막을 수 있다. 그 자리에 대체 문구를 넣는다.
    return null
  }
}

// ── 표 ────────────────────────────────────────────────────────

function tableToContent(table: HTMLTableElement, maxWidth: number): Content {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length === 0) return { text: '' }

  const body = rows.map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) => ({
      text: runsOf(cell),
      bold: cell.tagName.toLowerCase() === 'th',
      fillColor: cell.tagName.toLowerCase() === 'th' ? '#f4f4f2' : undefined,
      margin: [2, 3, 2, 3] as [number, number, number, number],
    })),
  )

  const columns = Math.max(...body.map((row) => row.length))
  // 칸 수가 다른 행이 있으면 pdfmake 가 통째로 던진다. 빈 칸으로 맞춰준다.
  for (const row of body) {
    while (row.length < columns) {
      row.push({ text: [], bold: false, fillColor: undefined, margin: [2, 3, 2, 3] })
    }
  }

  const content: ContentTable = {
    table: {
      headerRows: rows[0]?.querySelector('th') ? 1 : 0,
      widths: Array.from({ length: columns }, () => maxWidth / columns),
      body,
      dontBreakRows: true,
    },
    layout: {
      hLineColor: () => '#dcdcd8',
      vLineColor: () => '#dcdcd8',
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
    },
    margin: [0, 6, 0, 10],
  }
  return content
}

// ── 문단 → PDF 요소 ────────────────────────────────────────────

const HEADING_STYLE: Record<string, string> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h4',
  h6: 'h4',
}

function listToContent(list: HTMLElement, depth: number): Content {
  const items: Content[] = Array.from(list.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((item) => {
      const nested = item.querySelector(':scope > ul, :scope > ol') as HTMLElement | null
      const own = Array.from(item.childNodes)
        .filter((child) => child !== nested)
        .flatMap((child) => inlineRuns(child))

      if (!nested) return { text: own }
      return { stack: [{ text: own }, listToContent(nested, depth + 1)] }
    })

  const ordered = list.tagName.toLowerCase() === 'ol'
  return ordered
    ? { ol: items, margin: [0, 3, 0, 8] }
    : { ul: items, margin: [0, 3, 0, 8] }
}

async function blockToContent(
  element: Element,
  maxWidth: number,
  maxHeight: number,
): Promise<Content | null> {
  const tag = element.tagName.toLowerCase()

  if (element.classList.contains('mermaid-block')) {
    const source = element.getAttribute('data-mermaid-src') ?? ''
    const rendered = await renderMermaidToSvg(source)
    if (!rendered) {
      return { text: '(다이어그램을 그리지 못했습니다)', style: 'note', margin: [0, 6, 0, 10] }
    }
    // 폭뿐 아니라 높이도 페이지를 넘으면 안 된다. 세로로 긴 순서도가 특히 그렇다.
    const byHeight = rendered.height > 0 ? (rendered.width * maxHeight) / rendered.height : maxWidth
    const width = Math.min(rendered.width || maxWidth, maxWidth, byHeight)
    return {
      stack: [{ svg: rendered.svg, width }],
      unbreakable: true, // 다이어그램이 페이지 경계에서 잘리면 못 읽는다
      margin: [0, 8, 0, 12],
    }
  }

  if (HEADING_STYLE[tag]) {
    return { text: runsOf(element), style: HEADING_STYLE[tag] }
  }

  if (tag === 'p') {
    const runs = runsOf(element)
    if (runs.length === 0) return null
    return { text: runs, margin: [0, 4, 0, 8] }
  }

  if (tag === 'ul' || tag === 'ol') {
    return listToContent(element as HTMLElement, 0)
  }

  if (tag === 'blockquote') {
    return {
      table: {
        widths: [maxWidth - 12],
        body: [[{ text: runsOf(element), color: '#555550', margin: [10, 6, 6, 6] }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
        vLineColor: () => '#c9c9c2',
        paddingLeft: () => 0,
        paddingRight: () => 0,
      },
      margin: [0, 6, 0, 10],
    }
  }

  if (tag === 'pre') {
    return {
      table: {
        widths: [maxWidth - 20],
        body: [[{ text: plainText(element), style: 'code', margin: [10, 8, 10, 8] }]],
        dontBreakRows: false,
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => '#f5f5f3',
        paddingLeft: () => 0,
        paddingRight: () => 0,
      },
      margin: [0, 6, 0, 10],
    }
  }

  if (tag === 'table') {
    return { stack: [tableToContent(element as HTMLTableElement, maxWidth)], unbreakable: true }
  }

  if (tag === 'hr') {
    return {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: maxWidth, y2: 0, lineWidth: 0.6, lineColor: '#dcdcd8' }],
      margin: [0, 12, 0, 12],
    }
  }

  if (tag === 'img') {
    const image = element as HTMLImageElement
    const dataUrl = await imageToDataUrl(image.getAttribute('src') ?? '')
    if (!dataUrl) {
      const alt = image.getAttribute('alt') || '이미지'
      return { text: `(${alt} — 다른 도메인 이미지라 PDF 에 담지 못했습니다)`, style: 'note', margin: [0, 6, 0, 10] }
    }
    return {
      stack: [{ image: dataUrl, fit: [maxWidth, maxHeight] }],
      unbreakable: true,
      margin: [0, 8, 0, 12],
    }
  }

  return null
}

/** 최상위 자식만 훑는다. 중첩된 건 각 처리기가 알아서 파고든다. */
async function documentToContent(
  root: HTMLElement,
  maxWidth: number,
  maxHeight: number,
): Promise<Content[]> {
  const out: Content[] = []
  for (const child of Array.from(root.children)) {
    const content = await blockToContent(child, maxWidth, maxHeight)
    if (content) out.push(content)
  }
  return out
}

// ── 진입점 ────────────────────────────────────────────────────

const safeFilename = (title: string) =>
  (title.replace(/[\\/:*?"<>|]/g, '').trim() || '기획서').slice(0, 80)

export interface ExportInput {
  title: string
  source: string
  format: DocFormat
}

/** pdfmake 문서를 만들어 돌려준다. download() / getBlob() 등을 붙여 쓸 수 있다. */
export async function buildDocPdf(doc: ExportInput, orientation: PdfOrientation = 'portrait') {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  await ensureFonts(pdfMake)

  const maxWidth = contentWidth(orientation)
  const maxHeight = contentHeight(orientation)

  // 화면용 렌더 결과를 그대로 쓰되, 댓글 표시가 붙지 않은 깨끗한 상태로 다시 만든다
  const { html } = renderDocument(doc.source, doc.format)
  const holder = document.createElement('div')
  holder.innerHTML = html

  const content = await documentToContent(holder, maxWidth, maxHeight)

  const definition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: orientation,
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    defaultStyle: { font: 'Pretendard', fontSize: 10.5, lineHeight: 1.5, color: '#1f1f1d' },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0, 14, 0, 8] },
      h2: { fontSize: 15.5, bold: true, margin: [0, 14, 0, 6] },
      h3: { fontSize: 13, bold: true, margin: [0, 10, 0, 5] },
      h4: { fontSize: 11.5, bold: true, margin: [0, 8, 0, 4] },
      code: { fontSize: 9.5, color: '#333330', lineHeight: 1.4 },
      inlineCode: { fontSize: 9.8, color: '#8a3b2f' },
      note: { fontSize: 9.5, color: '#8a8a84', italics: true },
    },
    info: { title: doc.title },
    footer: (current: number, total: number) => ({
      text: `${current} / ${total}`,
      alignment: 'center',
      fontSize: 8.5,
      color: '#9a9a94',
      margin: [0, 8, 0, 0],
    }),
    content,
  }

  return { pdf: pdfMake.createPdf(definition), definition, filename: `${safeFilename(doc.title)}.pdf` }
}

export async function downloadDocPdf(doc: ExportInput, orientation: PdfOrientation = 'portrait') {
  const { pdf, filename } = await buildDocPdf(doc, orientation)
  pdf.download(filename)
}
