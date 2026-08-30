/**
 * 편집기가 다루는 요소 목록.
 *
 * 여기 없는 요소는 편집기를 거치는 순간 조용히 사라진다. 그래서 본문 렌더가
 * 만들어내는 것들(제목·목록·표·인용·코드·구분선·이미지·링크·체크목록·다이어그램)이
 * 빠짐없이 들어 있어야 한다. 왕복 검사(scripts/roundtrip)로 확인한다.
 */
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { MermaidBlock } from './MermaidNode'

export function buildExtensions({ placeholder }: { placeholder?: string } = {}) {
  return [
    StarterKit.configure({
      // 링크는 StarterKit 에 들어 있다. 새 탭으로 열되 referrer 는 안 흘린다.
      link: {
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    TableKit.configure({ table: { resizable: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ HTMLAttributes: { loading: 'lazy' } }),
    MermaidBlock,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ]
}
