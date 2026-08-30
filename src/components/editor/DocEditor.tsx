/**
 * 기획서 인플레이스 편집기.
 *
 * 보기 화면과 같은 자리·같은 폭에서 그대로 편집한다. 저장 형식은 HTML 이고,
 * 그게 곧 편집기가 다루는 형식이라 마크다운 문법을 몰라도 된다.
 */
import { useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Button, TextField } from '@great-mangofarm/mango-ui'
import EditorToolbar from './EditorToolbar'
import { buildExtensions } from './extensions'
import { uploadImage } from '@/lib/cloudinary'
import type { PdfOrientation } from '@/lib/pdf'

export interface DocEditorProps {
  initialTitle: string
  /** 보기 화면과 같은 규칙으로 만든 HTML */
  initialHtml: string
  initialOrientation: PdfOrientation
  saving: boolean
  onCancel: () => void
  onSave: (next: { title: string; html: string; orientation: PdfOrientation }) => void
}

export default function DocEditor({
  initialTitle,
  initialHtml,
  initialOrientation,
  saving,
  onCancel,
  onSave,
}: DocEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [orientation, setOrientation] = useState<PdfOrientation>(initialOrientation)
  const [error, setError] = useState('')

  const editor = useEditor({
    extensions: buildExtensions({ placeholder: '내용을 쓰거나 위 도구를 눌러 넣어 보세요' }),
    content: initialHtml,
    editorProps: {
      attributes: { class: 'spec-body spec-editor-surface' },
      // 이미지를 붙여넣거나 끌어다 놓으면 바로 올린다
      handlePaste: (_view, event) => consumeImages(event.clipboardData?.files),
      handleDrop: (_view, event) => consumeImages((event as DragEvent).dataTransfer?.files),
    },
  })

  function consumeImages(files: FileList | undefined): boolean {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return false

    void (async () => {
      for (const file of images) {
        try {
          const url = await uploadImage(file)
          editor?.chain().focus().setImage({ src: url }).run()
        } catch (err) {
          setError((err as Error).message)
        }
      }
    })()
    return true // 기본 붙여넣기(base64 삽입)를 막는다
  }

  if (!editor) return null

  return (
    <div className="flex min-w-0 flex-col">
      {/* 제목줄과 툴바를 한 덩어리로 붙여둔다. 따로 sticky 를 걸면 같은 높이에서 겹친다. */}
      <div className="sticky top-[var(--sr-topbar,64px)] z-30 border-b border-(--color-border) bg-(--color-bg)">
      <div className="flex flex-wrap items-center gap-2 py-3">
        <TextField
          className="min-w-60 flex-1"
          size="sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="기획서 제목"
          aria-label="기획서 제목"
        />
        <div className="flex items-center gap-1">
          <span className="pr-0.5 text-xs text-(--color-fg-muted)">PDF 방향</span>
          <Button
            size="xs"
            variant={orientation === 'portrait' ? 'solid' : 'outline'}
            onClick={() => setOrientation('portrait')}
          >
            세로
          </Button>
          <Button
            size="xs"
            variant={orientation === 'landscape' ? 'solid' : 'outline'}
            onClick={() => setOrientation('landscape')}
          >
            가로
          </Button>
        </div>

        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button
          size="sm"
          loading={saving}
          onClick={() =>
            onSave({ title: title.trim() || initialTitle, html: editor.getHTML(), orientation })
          }
        >
          저장
        </Button>
      </div>

        <EditorToolbar editor={editor} onError={setError} />
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-(--color-bg-error-subtle,#fdeceb) px-3 py-2 text-sm text-(--color-fg-error,#b3261e)">
          {error}
        </p>
      )}

      <EditorContent editor={editor} className="spec-editor" />
    </div>
  )
}
