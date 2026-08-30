import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Checkbox, Tab, TabList, TabPanel, Tabs } from '@great-mangofarm/mango-ui'
import Composer from './Composer'
import ThreadCard from './ThreadCard'
import type { Draft } from '@/pages/DocPage'
import type { Block, Thread } from '@/lib/types'

type SubmitTarget =
  | Draft
  | { parentId: string; threadId: string; scope: Draft['scope']; blockId: string | null }

interface Props {
  threads: Thread[]
  blocks: Block[]
  activeThreadId: string | null
  draft: Draft | null
  docId: string
  onDraftChange: (draft: Draft | null) => void
  onFocusThread: (thread: Thread) => void
  onSubmit: (body: string, target: SubmitTarget) => Promise<void>
  /** 편집 중에는 새 덧글을 막는다. 이미 달린 피드백에 답글은 계속 가능. */
  disableNew?: boolean
}

export default function CommentSidebar({
  threads,
  blocks,
  activeThreadId,
  draft,
  docId,
  onDraftChange,
  onFocusThread,
  onSubmit,
  disableNew = false,
}: Props) {
  const [tab, setTab] = useState('anchored')
  const [showResolved, setShowResolved] = useState(false)

  // 새 댓글을 쓰기 시작하면 그게 보이는 탭으로 옮겨준다
  useEffect(() => {
    if (draft) setTab(draft.scope === 'doc' ? 'doc' : 'anchored')
  }, [draft])

  useEffect(() => {
    if (!activeThreadId) return
    const found = threads.find((t) => t.root.id === activeThreadId)
    if (found) setTab(found.root.scope === 'doc' ? 'doc' : 'anchored')
  }, [activeThreadId, threads])

  const blockText = useMemo(() => new Map(blocks.map((b) => [b.id, b.text])), [blocks])

  const anchored = threads.filter((t) => t.root.scope !== 'doc')
  const docThreads = threads.filter((t) => t.root.scope === 'doc')
  const visible = (list: Thread[]) => list.filter((t) => showResolved || !t.root.resolved)

  const live = visible(anchored).filter((t) => !t.root.orphaned)
  const orphaned = visible(anchored).filter((t) => t.root.orphaned)

  const renderThread = (thread: Thread) => (
    <ThreadCard
      key={thread.root.id}
      thread={thread}
      docId={docId}
      isActive={thread.root.id === activeThreadId}
      blockText={thread.root.blockId ? blockText.get(thread.root.blockId) : undefined}
      onFocus={() => onFocusThread(thread)}
      onReply={(body) =>
        onSubmit(body, {
          parentId: thread.root.id,
          threadId: thread.root.id,
          scope: thread.root.scope,
          blockId: thread.root.blockId,
        })
      }
    />
  )

  return (
    <aside className="sticky top-[var(--sr-topbar,64px)] flex h-[calc(100vh-var(--sr-topbar,64px))] flex-col border-l border-(--color-border) bg-(--color-bg)">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabList className="shrink-0 border-b border-(--color-border) px-3 pt-2">
          <Tab value="anchored" badge={<Badge size="sm" variant="soft">{anchored.filter((t) => !t.root.resolved).length}</Badge>}>
            문장 피드백
          </Tab>
          <Tab value="doc" badge={<Badge size="sm" variant="soft">{docThreads.filter((t) => !t.root.resolved).length}</Badge>}>
            전체 덧글
          </Tab>
        </TabList>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TabPanel value="anchored" className="flex flex-col gap-2">
            {draft && draft.scope !== 'doc' && (
              <Composer
                heading={draft.scope === 'inline' ? '선택한 문장에 댓글' : '이 문단에 댓글'}
                quote={draft.quote ?? (draft.blockId ? blockText.get(draft.blockId) : undefined)}
                onCancel={() => onDraftChange(null)}
                onSubmit={(body) => onSubmit(body, draft)}
              />
            )}

            {live.length === 0 && orphaned.length === 0 && !draft && (
              <p className="px-1 py-4 text-sm leading-relaxed text-(--color-fg-muted)">
                본문에서 문장을 드래그하면 그 자리에 댓글을 달 수 있어요.
                <br />
                문단 오른쪽의 <strong>+</strong> 를 누르면 문단 전체에 달려요.
              </p>
            )}

            {live.map(renderThread)}

            {orphaned.length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold text-(--color-fg-muted)">
                  위치를 잃은 피드백 ({orphaned.length})
                </p>
                <p className="mb-1 text-xs text-(--color-fg-muted)">
                  기획서가 고쳐지면서 원래 붙어 있던 문장이 사라졌어요.
                </p>
                {orphaned.map(renderThread)}
              </>
            )}
          </TabPanel>

          <TabPanel value="doc" className="flex flex-col gap-2">
            {disableNew ? (
              <p className="rounded-md bg-(--color-bg-subtle) px-3 py-2 text-xs text-(--color-fg-muted)">
                편집하는 동안에는 새 덧글을 달 수 없어요. 답글은 그대로 됩니다.
              </p>
            ) : draft?.scope === 'doc' ? (
              <Composer
                heading="문서 전체에 덧글"
                onCancel={() => onDraftChange(null)}
                onSubmit={(body) => onSubmit(body, draft)}
              />
            ) : (
              <Button
                variant="outline"
                fullWidth
                size="sm"
                onClick={() =>
                  onDraftChange({ scope: 'doc', blockId: null, quote: null, quoteStart: null })
                }
              >
                덧글 쓰기
              </Button>
            )}

            {visible(docThreads).length === 0 && (
              <p className="px-1 py-3 text-sm text-(--color-fg-muted)">
                문서 전체에 대한 의견을 남겨 주세요.
              </p>
            )}
            {visible(docThreads).map(renderThread)}
          </TabPanel>
        </div>
      </Tabs>

      <div className="shrink-0 border-t border-(--color-border) bg-(--color-bg-subtle) px-3 py-2.5">
        <Checkbox
          size="sm"
          label="해결된 피드백도 보기"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
        />
      </div>
    </aside>
  )
}
