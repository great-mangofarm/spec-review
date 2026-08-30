import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  FileUpload,
  TextField,
  Textarea,
} from '@great-mangofarm/mango-ui'
import { detectFormat, guessTitle, toStoredHtml } from '@/lib/blocks'
import { createDoc } from '@/lib/db'
import { useAuth } from '@/store/auth'

/** Firestore 문서 하나가 1MB 를 못 넘는다. 본문을 같이 담으니 여유를 두고 잘라둔다. */
const MAX_BYTES = 700 * 1024

interface Props {
  systemId: string
  onClose: () => void
  onCreated: (docId: string) => void
}

export default function DocUploadDialog({ systemId, onClose, onCreated }: Props) {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pickFile(next: File | null) {
    setFile(next)
    setError('')
    if (!next) {
      setFilename('')
      return
    }
    const text = await next.text()
    setFilename(next.name)
    setSource(text)
    if (!title.trim()) setTitle(guessTitle(text, detectFormat(next.name, text), next.name))
  }

  async function save() {
    if (!user) return

    const body = source.trim()
    if (!body) {
      setError('내용이 비어 있어요')
      return
    }
    if (new Blob([body]).size > MAX_BYTES) {
      setError(`문서가 너무 커요. ${Math.round(MAX_BYTES / 1024)}KB 아래로 줄여 주세요.`)
      return
    }

    setBusy(true)
    setError('')
    try {
      const format = detectFormat(filename, body)
      // 저장 형식은 HTML 하나로 통일한다. 마크다운으로 올려도 여기서 한 번 바꿔 넣으면
      // 그 뒤로는 위지윅 편집기가 그대로 열고 닫을 수 있다.
      const docId = await createDoc(
        {
          systemId,
          title: title.trim() || guessTitle(body, format, filename),
          format: 'html',
          source: toStoredHtml(body, format),
        },
        user,
      )
      onCreated(docId)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="md">
      <DialogHeader
        title="기획서 올리기"
        description="마크다운(.md)이나 HTML 파일을 올리거나, 내용을 그대로 붙여넣어도 돼요."
      />
      <DialogBody className="flex flex-col gap-4">
        <FileUpload
          value={file}
          onChange={pickFile}
          accept=".md,.markdown,.html,.htm,.txt"
          maxSize={MAX_BYTES}
          title="파일을 끌어다 놓으세요"
          description="md, html, txt"
          onReject={() => setError('md, html, txt 파일만 올릴 수 있어요')}
        />

        <Textarea
          label="또는 내용 붙여넣기"
          placeholder={'# 기획서 제목\n\n작성일: 2026-08-30\n버전: v1.0\n\n## 1. 배경'}
          value={source}
          onChange={(e) => {
            setSource(e.target.value)
            setError('')
          }}
          textareaClassName="min-h-40 font-mono text-xs"
        />

        <TextField
          label="제목"
          helperText={error || '비워두면 본문 첫 제목에서 가져와요'}
          validation={error ? 'error' : undefined}
          placeholder="예: 결제 모듈 개편 기획서"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          취소
        </Button>
        <Button onClick={save} loading={busy} disabled={!source.trim()}>
          올리기
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
