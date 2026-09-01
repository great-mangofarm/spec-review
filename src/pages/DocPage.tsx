import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Spinner, useToast } from '@great-mangofarm/mango-ui'
import AppShell from '@/components/AppShell'
import CommentSidebar from '@/components/CommentSidebar'

// 편집기(Tiptap·아이콘 묶음)는 무거워서 고치기를 누를 때만 받아온다
const DocEditor = lazy(() => import('@/components/editor/DocEditor'))
import { canManage, useAuth } from '@/store/auth'
import { renderDocument, toStoredHtml } from '@/lib/blocks'
import { decorate, markOrphans, readSelection, scrollToBlock, type SelectionAnchor } from '@/lib/anchor'
import { renderMermaidBlocks } from '@/lib/mermaid'
import { downloadDocPdf } from '@/lib/pdf'
import { createComment, updateDocMeta, watchComments, watchDoc, type NewComment } from '@/lib/db'
import type { AnchoredComment, SpecComment, SpecDoc, Thread } from '@/lib/types'

export interface Draft {
  scope: 'inline' | 'block' | 'doc'
  blockId: string | null
  quote: string | null
  quoteStart: number | null
}

export default function DocPage() {
  const { systemId = '', docId = '' } = useParams()
  const { user } = useAuth()
  const { toast } = useToast()

  const [doc, setDoc] = useState<SpecDoc | null | undefined>(undefined)
  const [raw, setRaw] = useState<SpecComment[]>([])
  const [error, setError] = useState('')
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [bubble, setBubble] = useState<SelectionAnchor | null>(null)
  const [editing, setEditing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)

  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      watchDoc(
        docId,
        (next) => {
          setDoc(next)
          setError('')
        },
        (err) => setError(err.message),
      ),
    [docId],
  )

  useEffect(
    () => watchComments(docId, setRaw, (err) => setError(err.message)),
    [docId],
  )

  const rendered = useMemo(
    () => (doc ? renderDocument(doc.source, doc.format) : { html: '', blocks: [] }),
    [doc],
  )

  const comments = useMemo<AnchoredComment[]>(
    () => markOrphans(raw, rendered.blocks) as AnchoredComment[],
    [raw, rendered.blocks],
  )

  /**
   * 본문은 React 가 아니라 우리가 직접 넣는다.
   * 하이라이트를 DOM 에 심는 방식이라, React 가 리렌더 때 innerHTML 을 되돌리면
   * 표시가 통째로 날아간다. 이 구역만 React 관리 밖에 둔다.
   */
  // editing 이 deps 에 있어야 한다 — 편집을 마치고 돌아오면 본문 div 가 새로 마운트되는데,
  // 내용이 그대로면 rendered.html 이 안 바뀌어서 다시 채워지지 않고 빈 화면이 된다.
  useEffect(() => {
    const container = bodyRef.current
    if (!container) return
    container.innerHTML = rendered.html
    void renderMermaidBlocks(container)
  }, [rendered.html, editing])

  // 하이라이트·배지 다시 그리기 (위 효과 다음에 실행된다)
  useEffect(() => {
    if (bodyRef.current) decorate(bodyRef.current, comments, activeThreadId)
  }, [comments, activeThreadId, rendered.html, editing])

  // 본문에서 문장을 드래그하면 뜨는 버블
  useEffect(() => {
    const container = bodyRef.current
    if (!container) return

    const update = () => setBubble(readSelection(container))
    const hide = () => setBubble(null)
    const onPointerDown = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-selection-bubble]')) return
      setBubble(null)
    }

    container.addEventListener('mouseup', update)
    container.addEventListener('keyup', update)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('scroll', hide, { passive: true })

    return () => {
      container.removeEventListener('mouseup', update)
      container.removeEventListener('keyup', update)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('scroll', hide)
    }
  }, [rendered.html, editing])

  const onBodyClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement

    const add = target.closest<HTMLElement>('.spec-gutter-add')
    if (add) {
      setDraft({ scope: 'block', blockId: add.dataset.addBlock ?? null, quote: null, quoteStart: null })
      setActiveThreadId(null)
      return
    }

    const badge = target.closest<HTMLElement>('.spec-gutter-badge')
    if (badge) {
      setActiveThreadId(badge.dataset.threadId ?? null)
      return
    }

    const mark = target.closest<HTMLElement>('mark.spec-hl')
    if (mark) setActiveThreadId(mark.dataset.threadId ?? null)
  }, [])

  const startInlineComment = useCallback(() => {
    if (!bubble) return
    setDraft({
      scope: 'inline',
      blockId: bubble.blockId,
      quote: bubble.quote,
      quoteStart: bubble.quoteStart,
    })
    setActiveThreadId(null)
    setBubble(null)
    window.getSelection()?.removeAllRanges()
  }, [bubble])

  const submitComment = useCallback(
    async (body: string, target: Draft | { parentId: string; threadId: string; scope: Draft['scope']; blockId: string | null }) => {
      if (!user || !doc) return

      const payload: NewComment =
        'parentId' in target
          ? {
              docId: doc.id,
              systemId,
              scope: target.scope,
              blockId: target.blockId,
              quote: null,
              quoteStart: null,
              docVersion: doc.version,
              body,
              parentId: target.parentId,
              threadId: target.threadId,
            }
          : {
              docId: doc.id,
              systemId,
              scope: target.scope,
              blockId: target.blockId,
              quote: target.quote,
              quoteStart: target.quoteStart,
              docVersion: doc.version,
              body,
              parentId: null,
              threadId: null,
            }

      await createComment(payload, user)
      setDraft(null)
    },
    [user, doc, systemId],
  )

  const threads = useMemo<Thread[]>(() => {
    const roots = comments.filter((c) => !c.parentId)
    const replies = new Map<string, AnchoredComment[]>()
    for (const comment of comments) {
      if (!comment.parentId) continue
      const list = replies.get(comment.threadId) ?? []
      list.push(comment)
      replies.set(comment.threadId, list)
    }
    return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }))
  }, [comments])

  const focusThread = useCallback((thread: Thread) => {
    setActiveThreadId(thread.root.id)
    if (thread.root.blockId && bodyRef.current) scrollToBlock(bodyRef.current, thread.root.blockId)
  }, [])

  async function saveEdit(next: { title: string; html: string; orientation: 'portrait' | 'landscape' }) {
    if (!user || !doc) return
    setSaving(true)
    try {
      // 편집기가 낸 HTML 도 한 번 더 살균해서 저장한다. 붙여넣기로 들어온 태그를 믿지 않는다.
      const html = toStoredHtml(next.html, 'html')
      const bodyChanged = html !== doc.source

      await updateDocMeta(
        doc.id,
        {
          title: next.title,
          pdfOrientation: next.orientation,
          // 내용이 바뀐 경우에만 판을 올린다
          ...(bodyChanged ? { source: html, format: 'html' as const, version: doc.version + 1 } : {}),
        },
        user,
      )
      setEditing(false)
      toast({ intent: 'success', title: '저장했어요', description: bodyChanged ? '새 판으로 올라갔어요.' : '' })
    } catch (err) {
      toast({ intent: 'error', title: '저장하지 못했어요', description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function exportPdf() {
    if (!doc) return
    setExporting(true)
    try {
      await downloadDocPdf(
        { title: doc.title, source: doc.source, format: doc.format },
        doc.pdfOrientation ?? 'portrait',
      )
    } catch (err) {
      toast({ intent: 'error', title: 'PDF 를 만들지 못했어요', description: (err as Error).message })
    } finally {
      setExporting(false)
    }
  }

  if (doc === undefined) {
    return (
      <AppShell>
        <div className="grid place-items-center py-24">
          <Spinner size={26} label="불러오는 중" />
        </div>
      </AppShell>
    )
  }

  if (doc === null) {
    return (
      <AppShell>
        <p className="py-20 text-center text-sm text-(--color-fg-muted)">
          기획서를 찾을 수 없어요.{' '}
          <Link to={`/s/${systemId}`} className="underline">
            목록으로
          </Link>
        </p>
      </AppShell>
    )
  }

  const openCount = threads.filter((t) => !t.root.resolved).length
  const editable = canManage(user) || doc.ownerUid === user?.uid

  return (
    <AppShell
      contained={false}
      center={<span className="block truncate text-sm font-medium">{doc.title}</span>}
      actions={
        <>
          <Badge size="sm" variant="soft" intent={openCount ? 'warning' : 'success'}>
            열린 피드백 {openCount}
          </Badge>
          <Button size="xs" variant="outline" onClick={exportPdf} loading={exporting}>
            PDF 다운로드
          </Button>
          {editable && (
            <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
              고치기
            </Button>
          )}
        </>
      }
    >
      {error && (
        <p className="mx-8 mt-4 rounded-md bg-(--color-bg-error-subtle,#fdeceb) px-3 py-2 text-sm text-(--color-fg-error,#b3261e)">
          {error}
        </p>
      )}

      <div className="grid items-start lg:grid-cols-[minmax(0,1fr)_480px]">
        <div className="min-w-0 py-7 pr-18 pb-28 pl-8">
          {editing ? (
            <Suspense
              fallback={
                <div className="grid place-items-center py-24">
                  <Spinner size={24} label="편집기 여는 중" />
                </div>
              }
            >
              <DocEditor
                initialTitle={doc.title}
                // 편집기에는 저장 형식(다이어그램이 코드블록인 상태)을 그대로 넘긴다
                initialHtml={toStoredHtml(doc.source, doc.format)}
                initialOrientation={doc.pdfOrientation ?? 'portrait'}
                saving={saving}
                onCancel={() => setEditing(false)}
                onSave={saveEdit}
              />
            </Suspense>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--color-border) pb-3 text-xs text-(--color-fg-muted)">
                <Link to={`/s/${systemId}`} className="no-underline hover:underline">
                  ← 기획서 목록
                </Link>
                <span>
                  {doc.ownerName} 올림 · {doc.version}판
                </span>
                {doc.lastEditedBy && <span>마지막 수정 {doc.lastEditedBy}</span>}
              </div>

              <div ref={bodyRef} className="spec-body" onClick={onBodyClick} />
            </>
          )}
        </div>

        <CommentSidebar
          threads={threads}
          blocks={rendered.blocks}
          activeThreadId={activeThreadId}
          draft={draft}
          docId={doc.id}
          onDraftChange={setDraft}
          onFocusThread={focusThread}
          onSubmit={submitComment}
          disableNew={editing}
        />
      </div>

      {bubble && (
        <div
          data-selection-bubble
          className="fixed z-40 -translate-x-1/2 -translate-y-full"
          style={{ top: bubble.rect.top - 8, left: bubble.rect.left + bubble.rect.width / 2 }}
        >
          <Button size="xs" onMouseDown={(e) => e.preventDefault()} onClick={startInlineComment}>
            이 문장에 댓글
          </Button>
        </div>
      )}

    </AppShell>
  )
}
