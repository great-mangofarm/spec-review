import { useState } from 'react'
import { Avatar, Badge, Button, useToast } from '@great-mangofarm/mango-ui'
import Composer from './Composer'
import { canModerate, useAuth } from '@/store/auth'
import { deleteComment, updateComment } from '@/lib/db'
import { initialsOf } from '@/lib/name'
import type { AnchoredComment, Thread } from '@/lib/types'

const SCOPE_LABEL: Record<string, string> = { inline: '문장', block: '문단', doc: '전체' }

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

interface Props {
  thread: Thread
  docId: string
  isActive: boolean
  blockText?: string
  onFocus: () => void
  onReply: (body: string) => Promise<void>
}

export default function ThreadCard({ thread, docId, isActive, blockText, onFocus, onReply }: Props) {
  const { root, replies } = thread
  const { user } = useAuth()
  const { toast } = useToast()

  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const mine = root.authorUid === user?.uid
  const moderator = canModerate(user)

  async function toggleResolved() {
    if (!user) return
    setBusy(true)
    try {
      await updateComment(root.id, docId, {
        resolved: !root.resolved,
        resolvedBy: root.resolved ? null : user.uid,
        resolvedByName: root.resolved ? null : user.displayName,
        resolvedAt: root.resolved ? null : new Date().toISOString(),
      })
    } catch (err) {
      toast({ intent: 'error', title: '바꾸지 못했어요', description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function remove(comment: AnchoredComment) {
    const isRoot = !comment.parentId
    const message =
      isRoot && replies.length > 0 ? '답글까지 함께 지워져요. 계속할까요?' : '이 댓글을 지울까요?'
    if (!window.confirm(message)) return

    try {
      await deleteComment(comment.id, docId, isRoot)
    } catch (err) {
      toast({ intent: 'error', title: '지우지 못했어요', description: (err as Error).message })
    }
  }

  const border = root.orphaned
    ? 'border-dashed border-(--color-border-warning,#c98a3c)'
    : isActive
      ? 'border-(--color-border-brand,#3c8f66) ring-2 ring-(--color-bg-brand-subtle,#e6f0ea)'
      : 'border-(--color-border)'

  return (
    <div
      className={`rounded-lg border bg-(--color-bg) p-3 transition-colors ${border} ${root.resolved ? 'opacity-70' : ''}`}
      onClick={onFocus}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar size="xs" name={root.authorName} initials={initialsOf(root.authorName)} />
        <span className="text-xs font-semibold">{root.authorName}</span>
        <span className="text-xs text-(--color-fg-muted)">{timeAgo(root.createdAt)}</span>
        <Badge size="sm" variant="soft" intent="secondary" className="ml-auto">
          {SCOPE_LABEL[root.scope]}
        </Badge>
      </div>

      {root.scope === 'inline' && root.quote && (
        <p className="mb-2 line-clamp-3 border-l-2 border-(--color-border-warning,#f0cf55) pl-2 text-xs leading-relaxed text-(--color-fg-muted)">
          “{root.quote}”
        </p>
      )}
      {root.scope === 'block' && blockText && (
        <p className="mb-2 line-clamp-2 border-l-2 border-(--color-border-strong) pl-2 text-xs leading-relaxed text-(--color-fg-muted)">
          {blockText}
        </p>
      )}

      {root.orphaned && (
        <p className="mb-1.5 text-xs text-(--color-fg-warning,#8a5a1e)">
          원래 붙어 있던 문장이 사라졌어요.
        </p>
      )}

      {editing ? (
        <Composer
          initialValue={root.body}
          submitLabel="저장"
          onSubmit={async (body) => {
            await updateComment(root.id, docId, { body, editedAt: new Date().toISOString() })
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{root.body}</p>
      )}

      {root.resolved && root.resolvedByName && (
        <p className="mt-1.5 text-xs text-(--color-fg-muted)">
          {root.resolvedByName} 님이 해결로 표시했어요
        </p>
      )}

      {replies.map((reply) => (
        <div key={reply.id} className="mt-2.5 border-t border-dashed border-(--color-border) pt-2.5">
          <div className="mb-1 flex items-center gap-2">
            <Avatar size="xs" name={reply.authorName} initials={initialsOf(reply.authorName)} />
            <span className="text-xs font-semibold">{reply.authorName}</span>
            <span className="text-xs text-(--color-fg-muted)">{timeAgo(reply.createdAt)}</span>
            {(reply.authorUid === user?.uid || moderator) && (
              <Button size="xxs" variant="ghost" className="ml-auto" onClick={() => remove(reply)}>
                삭제
              </Button>
            )}
          </div>
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{reply.body}</p>
        </div>
      ))}

      {replying ? (
        <div className="mt-2">
          <Composer
            placeholder="답글을 남겨 주세요"
            submitLabel="답글"
            onSubmit={async (body) => {
              await onReply(body)
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      ) : (
        !editing && (
          <div className="mt-2 flex items-center gap-0.5 border-t border-(--color-border) pt-2">
            <Button size="xxs" variant="ghost" onClick={() => setReplying(true)}>
              답글
            </Button>
            <Button size="xxs" variant="ghost" onClick={toggleResolved} loading={busy}>
              {root.resolved ? '다시 열기' : '해결'}
            </Button>
            {mine && (
              <Button size="xxs" variant="ghost" onClick={() => setEditing(true)}>
                수정
              </Button>
            )}
            {(mine || moderator) && (
              <Button size="xxs" variant="ghost" intent="error" onClick={() => remove(root)}>
                삭제
              </Button>
            )}
          </div>
        )
      )}
    </div>
  )
}
