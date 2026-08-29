import { useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Radio,
  RadioGroup,
  TextField,
  Textarea,
} from '@great-mangofarm/mango-ui'
import { updateDocMeta } from '@/lib/db'
import { useAuth } from '@/store/auth'
import type { SpecDoc } from '@/lib/types'

const MAX_BYTES = 700 * 1024

interface Props {
  doc: SpecDoc
  onClose: () => void
  onSaved: () => void
}

/**
 * 기획서를 고쳐서 다시 올린다.
 * 안 바뀐 문단에 달린 피드백은 문단 해시가 같아서 그대로 붙어 있고,
 * 사라진 문단의 피드백만 "위치를 잃은 피드백"으로 옮겨간다.
 */
export default function DocEditDialog({ doc, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [title, setTitle] = useState(doc.title)
  const [source, setSource] = useState(doc.source)
  const [orientation, setOrientation] = useState(doc.pdfOrientation ?? 'portrait')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const bodyChanged = source !== doc.source
  const changed = bodyChanged || title !== doc.title || orientation !== (doc.pdfOrientation ?? 'portrait')

  async function save() {
    if (!user) return
    if (new Blob([source]).size > MAX_BYTES) {
      setError(`문서가 너무 커요. ${Math.round(MAX_BYTES / 1024)}KB 아래로 줄여 주세요.`)
      return
    }

    setBusy(true)
    setError('')
    try {
      await updateDocMeta(
        doc.id,
        {
          title: title.trim() || doc.title,
          pdfOrientation: orientation,
          // 본문이 바뀌었을 때만 판을 올린다
          ...(bodyChanged ? { source, version: doc.version + 1 } : {}),
        },
        user,
      )
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="lg">
      <DialogHeader
        title="기획서 고치기"
        description={`내용을 바꾸면 ${doc.version + 1}판이 돼요. 그대로 남는 문단의 피드백은 계속 붙어 있어요.`}
      />
      <DialogBody className="flex flex-col gap-4">
        <TextField label="제목" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-(--color-fg-muted)">내용 ({doc.format})</span>
            <Button size="xxs" variant="outline" onClick={() => fileRef.current?.click()}>
              파일로 교체
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.html,.htm,.txt"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) setSource(await file.text())
              }}
            />
          </div>
          <Textarea
            value={source}
            onChange={(e) => {
              setSource(e.target.value)
              setError('')
            }}
            textareaClassName="min-h-80 font-mono text-xs"
            validation={error ? 'error' : undefined}
            helperText={error || undefined}
          />
        </div>

        <RadioGroup
          label="PDF 종이 방향"
          value={orientation}
          onChange={(value) => setOrientation(value as 'portrait' | 'landscape')}
          orientation="horizontal"
        >
          <Radio value="portrait" label="세로" />
          <Radio value="landscape" label="가로 (넓은 다이어그램이 많을 때)" />
        </RadioGroup>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          취소
        </Button>
        <Button onClick={save} loading={busy} disabled={!changed}>
          저장
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
