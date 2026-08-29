/**
 * mermaid 다이어그램.
 *
 * 라이브러리가 무거워서 다이어그램이 들어 있는 문서를 열 때만 받아온다.
 *
 * htmlLabels 를 반드시 꺼야 한다. 기본값이 켜져 있는데, 그러면 mermaid 가 글자를
 * SVG 안의 foreignObject(=HTML)로 그린다. 화면에서는 멀쩡하지만 PDF 로 옮길 때
 * 글자가 통째로 사라진다. 끄면 순수 SVG text 로 나와서 PDF 에서도 글자가 남는다.
 */
type MermaidApi = typeof import('mermaid').default

let mermaidPromise: Promise<MermaidApi> | null = null
let renderSeq = 0

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'Pretendard Variable, Pretendard, sans-serif',
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        class: { htmlLabels: false },
      })
      return mermaid
    })
  }
  return mermaidPromise
}

/** 화면의 자리표시자들을 실제 그림으로 채운다 */
export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const holders = Array.from(
    container.querySelectorAll<HTMLElement>('.mermaid-block[data-mermaid-src]'),
  ).filter((holder) => !holder.querySelector('svg'))

  if (holders.length === 0) return

  const mermaid = await loadMermaid()

  for (const holder of holders) {
    const source = holder.getAttribute('data-mermaid-src') ?? ''
    renderSeq += 1
    try {
      const { svg } = await mermaid.render(`mermaid-view-${renderSeq}`, source)
      // 여백 버튼은 지우지 않게, 그림만 앞에 끼워 넣는다
      const gutters = Array.from(holder.querySelectorAll('.spec-gutter'))
      holder.innerHTML = svg
      for (const gutter of gutters) holder.appendChild(gutter)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      holder.innerHTML = ''
      const box = document.createElement('pre')
      box.className = 'mermaid-error'
      box.textContent = `다이어그램 문법 오류\n${message}`
      holder.appendChild(box)
    }
  }
}

/**
 * mermaid 는 색·선·글꼴을 전부 SVG 안의 <style> 에 CSS 로 넣는다.
 * 화면에서는 그게 맞지만, PDF 변환기는 그 CSS 를 읽지 않아서 도형이 전부
 * 새까맣게 칠해지고 글자가 엉뚱한 데 찍힌다.
 *
 * 그래서 SVG 를 화면에 잠깐 붙여 CSS 가 적용된 상태로 계산된 값을 읽고,
 * 그 값을 요소마다 속성으로 박아준 다음 <style> 을 걷어낸다.
 */
const INLINE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
] as const

function inlineComputedStyles(svgText: string): string | null {
  const stage = document.createElement('div')
  // 화면 밖에 두되 display:none 은 쓰지 않는다. 숨기면 계산된 값이 안 나온다.
  stage.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden'
  stage.innerHTML = svgText
  document.body.appendChild(stage)

  try {
    const root = stage.querySelector('svg')
    if (!root) return null

    for (const element of Array.from(root.querySelectorAll<SVGElement>('*'))) {
      if (element.tagName.toLowerCase() === 'style') continue

      const computed = window.getComputedStyle(element)
      for (const prop of INLINE_PROPS) {
        const value = computed.getPropertyValue(prop)
        // 'none' 도 반드시 적어야 한다. 빼면 PDF 변환기가 기본값(검정)으로 칠해서
        // 화살표 라벨 뒤에 까만 얼룩이 생긴다.
        if (value) element.setAttribute(prop, value)
      }
      // 글꼴 이름은 PDF 에 등록한 이름과 정확히 같아야 한글이 나온다
      if (element.tagName.toLowerCase() === 'text' || element.tagName.toLowerCase() === 'tspan') {
        element.setAttribute('font-family', 'Pretendard')
      }
    }

    for (const style of Array.from(root.querySelectorAll('style'))) style.remove()

    return new XMLSerializer().serializeToString(root)
  } finally {
    stage.remove()
  }
}

export interface RenderedSvg {
  svg: string
  width: number
  height: number
}

/** PDF 용 — 화면에 붙이지 않고 SVG 문자열만 받아온다 */
export async function renderMermaidToSvg(source: string): Promise<RenderedSvg | null> {
  if (!source.trim()) return null

  try {
    const mermaid = await loadMermaid()
    renderSeq += 1
    const { svg } = await mermaid.render(`mermaid-pdf-${renderSeq}`, source)

    const inlined = inlineComputedStyles(svg)
    if (!inlined) return null

    // mermaid 는 width="100%" 에 max-width 인라인 스타일을 붙여서 내보낸다.
    // 화면에서는 그게 맞지만 pdfmake 는 실제 숫자를 못 읽어서 크기 계산이 깨지고,
    // 그러면 그 뒤 내용이 통째로 날아간다. viewBox 값으로 다시 박아준다.
    const parsed = new DOMParser().parseFromString(inlined, 'image/svg+xml')
    const root = parsed.documentElement
    if (root.nodeName === 'parsererror' || root.querySelector('parsererror')) return null

    const viewBox = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
    const width = viewBox.length === 4 && viewBox[2] > 0 ? viewBox[2] : 480
    const height = viewBox.length === 4 && viewBox[3] > 0 ? viewBox[3] : 320

    root.setAttribute('width', String(width))
    root.setAttribute('height', String(height))
    root.removeAttribute('style')

    return { svg: new XMLSerializer().serializeToString(root), width, height }
  } catch {
    return null
  }
}
