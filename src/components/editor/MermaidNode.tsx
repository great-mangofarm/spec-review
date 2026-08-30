/**
 * 편집기 안의 다이어그램 블록.
 *
 * 저장 형식은 본문과 똑같은 `<div class="mermaid-block" data-mermaid-src="...">` 라서,
 * 편집기를 거쳐도 보기 화면·PDF 가 그대로 읽는다.
 *
 * 블록을 누르면 mermaid 코드를 고치는 칸이 열리고, 닫으면 다시 그림으로 돌아온다.
 */
import { useEffect, useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Button, Textarea } from '@great-mangofarm/mango-ui'
import { renderMermaidBlocks } from '@/lib/mermaid'

const SAMPLE = `flowchart TD
    A[시작] --> B{조건}
    B -- 예 --> C[처리]
    B -- 아니오 --> D[종료]`

function MermaidNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const src = (node.attrs.src as string) ?? ''
  // 코드가 비어 있으면 새로 넣은 블록이니 바로 편집 상태로 연다
  const [editing, setEditing] = useState(!src.trim())
  const [draft, setDraft] = useState(src || SAMPLE)
  const previewRef = useRef<HTMLDivElement>(null)

  // 보기 상태일 때만 그린다
  useEffect(() => {
    if (editing || !previewRef.current) return
    const holder = previewRef.current
    holder.innerHTML = ''
    if (!src.trim()) return

    const block = document.createElement('div')
    block.className = 'mermaid-block'
    block.setAttribute('data-mermaid-src', src)
    holder.appendChild(block)
    void renderMermaidBlocks(holder)
  }, [src, editing])

  function apply() {
    updateAttributes({ src: draft })
    setEditing(false)
  }

  return (
    <NodeViewWrapper className="spec-editor-mermaid" data-drag-handle>
      {editing ? (
        <div className="flex flex-col gap-2 p-3">
          <p className="text-xs text-(--color-fg-muted)">
            mermaid 코드예요. 문법을 모르면 원하는 흐름을 말해 주면 코드를 받아 붙여넣으면 돼요.
          </p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            textareaClassName="min-h-40 font-mono text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              intent="error"
              onClick={() => deleteNode()}
              disabled={!editor.isEditable}
            >
              블록 삭제
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setDraft(src || SAMPLE)
                setEditing(false)
              }}
            >
              취소
            </Button>
            <Button size="xs" onClick={apply}>
              적용
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="block w-full cursor-pointer p-2 text-left"
          onClick={() => {
            setDraft(src)
            setEditing(true)
          }}
          title="눌러서 다이어그램 고치기"
        >
          <div ref={previewRef} />
        </button>
      )}
    </NodeViewWrapper>
  )
}

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  // 코드블록(CodeBlock)보다 먼저 잡아야 한다
  priority: 1000,

  addAttributes() {
    return {
      src: { default: '', rendered: false },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full' as const,
        getAttrs: (element) => {
          const code = (element as HTMLElement).querySelector('code')
          const isMermaid = code?.className.split(/\s+/).includes('language-mermaid')
          return isMermaid ? { src: code?.textContent ?? '' } : false
        },
      },
      // 화면용으로 이미 치환된 모양도 받아준다
      {
        tag: 'div.mermaid-block',
        getAttrs: (element) => ({ src: (element as HTMLElement).getAttribute('data-mermaid-src') ?? '' }),
      },
    ]
  },

  renderHTML({ node }) {
    // 저장 형식은 마크다운과 같은 코드블록. 속성이 아니라 텍스트라서 살균에 안 지워진다.
    return [
      'pre',
      mergeAttributes({}),
      ['code', { class: 'language-mermaid' }, (node.attrs.src as string) ?? ''],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView)
  },
})
