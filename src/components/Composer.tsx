import { useEffect, useRef, useState } from 'react'
import { Button, Textarea } from '@great-mangofarm/mango-ui'

interface Props {
  heading?: string
  quote?: string
  placeholder?: string
  initialValue?: string
  submitLabel?: string
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
}

export default function Composer({
  heading,
  quote,
  placeholder = '무엇을 고치면 좋을지 적어 주세요 (⌘+Enter 로 등록)',
  initialValue = '',
  submitLabel = '등록',
  onSubmit,
  onCancel,
}: Props) {
  const [body, setBody] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  async function submit() {
    if (!body.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(body.trim())
      setBody('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-(--color-border-brand,#3c8f66) bg-(--color-bg) p-3">
      {heading && <p className="mb-2 text-xs font-semibold text-(--color-fg-muted)">{heading}</p>}

      {quote && (
        <p className="mb-2 line-clamp-3 border-l-2 border-(--color-border-strong) pl-2 text-xs leading-relaxed text-(--color-fg-muted)">
          {quote}
        </p>
      )}

      <Textarea
        ref={ref}
        size="sm"
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
          if (e.key === 'Escape') onCancel()
        }}
        validation={error ? 'error' : undefined}
        helperText={error || undefined}
        textareaClassName="min-h-18"
      />

      <div className="mt-2 flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button size="xs" onClick={submit} loading={busy} disabled={!body.trim()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
