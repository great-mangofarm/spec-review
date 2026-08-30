import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Divider, IconButton, Spinner, Tooltip } from '@great-mangofarm/mango-ui'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconMinus,
  IconPhoto,
  IconQuote,
  IconSitemap,
  IconSourceCode,
  IconStrikethrough,
  IconTable,
} from '@tabler/icons-react'
import { uploadImage } from '@/lib/cloudinary'

interface Props {
  editor: Editor
  onError: (message: string) => void
}

export default function EditorToolbar({ editor, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // 툴바를 누를 때 본문에서 커서가 빠지지 않게 — 눌러도 선택이 유지돼야 서식이 먹는다
  const hold = (event: React.MouseEvent) => event.preventDefault()

  async function pickImage(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      editor.chain().focus().setImage({ src: url }).run()
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function toggleLink() {
    const previous = editor.getAttributes('link').href as string | undefined
    const input = window.prompt('링크 주소', previous ?? 'https://')
    if (input === null) return

    if (!input.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: input.trim() }).run()
  }

  const Item = ({
    label,
    icon,
    active,
    disabled,
    onClick,
  }: {
    label: string
    icon: React.ReactElement
    active?: boolean
    disabled?: boolean
    onClick: () => void
  }) => (
    <Tooltip content={label}>
      <IconButton
        size="sm"
        variant={active ? 'solid' : 'ghost'}
        intent={active ? 'primary' : 'secondary'}
        aria-label={label}
        icon={icon}
        disabled={disabled}
        onMouseDown={hold}
        onClick={onClick}
      />
    </Tooltip>
  )

  return (
    <div className="flex flex-wrap items-center gap-0.5 py-2">
      <Item
        label="실행 취소"
        icon={<IconArrowBackUp />}
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <Item
        label="다시 실행"
        icon={<IconArrowForwardUp />}
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />

      <Divider orientation="vertical" className="mx-1 h-5" />

      <Item
        label="큰 제목"
        icon={<IconH1 />}
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <Item
        label="중간 제목"
        icon={<IconH2 />}
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <Item
        label="작은 제목"
        icon={<IconH3 />}
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <Divider orientation="vertical" className="mx-1 h-5" />

      <Item
        label="굵게"
        icon={<IconBold />}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Item
        label="기울임"
        icon={<IconItalic />}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Item
        label="취소선"
        icon={<IconStrikethrough />}
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <Item
        label="글자 코드"
        icon={<IconCode />}
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <Item
        label="링크"
        icon={<IconLink />}
        active={editor.isActive('link')}
        onClick={toggleLink}
      />

      <Divider orientation="vertical" className="mx-1 h-5" />

      <Item
        label="글머리 목록"
        icon={<IconList />}
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Item
        label="번호 목록"
        icon={<IconListNumbers />}
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Item
        label="체크 목록"
        icon={<IconListCheck />}
        active={editor.isActive('taskList')}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <Item
        label="인용"
        icon={<IconQuote />}
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <Item
        label="코드 블록"
        icon={<IconSourceCode />}
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />

      <Divider orientation="vertical" className="mx-1 h-5" />

      <Item
        label={editor.isActive('table') ? '표 (안에서 우클릭·아래 버튼으로 행·열 조절)' : '표 넣기'}
        icon={<IconTable />}
        active={editor.isActive('table')}
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />
      <Item
        label="다이어그램"
        icon={<IconSitemap />}
        onClick={() => editor.chain().focus().insertContent({ type: 'mermaidBlock' }).run()}
      />
      <Item label="구분선" icon={<IconMinus />} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <Item
        label="이미지"
        icon={uploading ? <Spinner size={16} /> : <IconPhoto />}
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void pickImage(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/* 표 안에 커서가 있을 때만 나오는 줄 — 평소엔 툴바를 어지럽히지 않는다 */}
      {editor.isActive('table') && (
        <div className="flex w-full flex-wrap items-center gap-1 pt-2 text-xs text-(--color-fg-muted)">
          <span className="pr-1">표</span>
          {[
            ['위에 행 추가', () => editor.chain().focus().addRowBefore().run()],
            ['아래에 행 추가', () => editor.chain().focus().addRowAfter().run()],
            ['행 삭제', () => editor.chain().focus().deleteRow().run()],
            ['왼쪽에 열 추가', () => editor.chain().focus().addColumnBefore().run()],
            ['오른쪽에 열 추가', () => editor.chain().focus().addColumnAfter().run()],
            ['열 삭제', () => editor.chain().focus().deleteColumn().run()],
            ['칸 합치기·나누기', () => editor.chain().focus().mergeOrSplit().run()],
            ['표 삭제', () => editor.chain().focus().deleteTable().run()],
          ].map(([label, run]) => (
            <button
              key={label as string}
              type="button"
              className="rounded-md border border-(--color-border) px-2 py-1 hover:bg-(--color-bg-subtle)"
              onMouseDown={hold}
              onClick={run as () => void}
            >
              {label as string}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
