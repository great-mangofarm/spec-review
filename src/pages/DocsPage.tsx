import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Spinner,
  useToast,
} from '@great-mangofarm/mango-ui'
import AppShell from '@/components/AppShell'
import DocUploadDialog from '@/components/DocUploadDialog'
import { canManage, useAuth } from '@/store/auth'
import { deleteSpecDoc, getSystem, watchDocs } from '@/lib/db'
import type { SpecDocMeta, SpecSystem } from '@/lib/types'

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function DocsPage() {
  const { systemId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [system, setSystem] = useState<SpecSystem | null>(null)
  const [docs, setDocs] = useState<SpecDocMeta[] | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    getSystem(systemId).then(setSystem).catch((err) => setError(err.message))
  }, [systemId])

  useEffect(
    () =>
      watchDocs(
        systemId,
        (list) => {
          setDocs(list)
          setError('')
        },
        (err) => {
          // 실패해도 목록을 비워둬야 스피너가 안 멈추고 도는 대신 오류가 보인다
          setDocs([])
          setError(err.message)
        },
      ),
    [systemId],
  )

  const manager = canManage(user)

  async function remove(target: SpecDocMeta) {
    if (!window.confirm(`"${target.title}" 과 거기 달린 피드백을 전부 지울까요?`)) return
    try {
      await deleteSpecDoc(target.id, systemId)
      toast({ intent: 'success', title: '삭제했어요', description: target.title })
    } catch (err) {
      toast({ intent: 'error', title: '삭제하지 못했어요', description: (err as Error).message })
    }
  }

  return (
    <AppShell>
      <div className="mb-1">
        <Link to="/" className="text-xs text-(--color-fg-muted) no-underline hover:underline">
          ← 시스템 목록
        </Link>
      </div>

      <PageHeader title={system?.name ?? '기획서'}>
        {manager && <Button onClick={() => setUploading(true)}>기획서 올리기</Button>}
      </PageHeader>

      {system?.description && (
        <p className="mt-1 mb-6 text-sm text-(--color-fg-muted)">{system.description}</p>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-(--color-bg-error-subtle,#fdeceb) px-3 py-2 text-sm text-(--color-fg-error,#b3261e)">
          {error}
        </p>
      )}

      {docs === null ? (
        <div className="grid place-items-center py-20">
          <Spinner size={24} label="불러오는 중" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          title="아직 올라온 기획서가 없어요"
          description={
            manager
              ? '마크다운(.md)이나 HTML 파일을 올리면 팀원이 문장에 바로 의견을 남길 수 있어요.'
              : '기획서가 올라오면 여기에 보여요.'
          }
          actions={manager ? [{ label: '기획서 올리기', onClick: () => setUploading(true) }] : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-bg) px-4 py-3 transition-colors hover:border-(--color-border-strong)"
            >
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => navigate(`/s/${systemId}/d/${item.id}`)}
              >
                <div className="truncate text-sm font-semibold">{item.title}</div>
                <div className="mt-0.5 text-xs text-(--color-fg-muted)">
                  {item.ownerName} · {formatDate(item.updatedAt)}
                  {item.version > 1 && ` · ${item.version}판`}
                </div>
              </button>

              {item.openCount ? (
                <Badge size="sm" variant="soft" intent="warning">
                  열린 피드백 {item.openCount}
                </Badge>
              ) : item.commentCount ? (
                <Badge size="sm" variant="soft" intent="success">
                  모두 처리됨
                </Badge>
              ) : (
                <Badge size="sm" variant="soft" intent="secondary">
                  피드백 없음
                </Badge>
              )}

              {manager && (
                <Button size="xxs" variant="ghost" intent="error" onClick={() => remove(item)}>
                  삭제
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploading && (
        <DocUploadDialog
          systemId={systemId}
          onClose={() => setUploading(false)}
          onCreated={(docId) => {
            setUploading(false)
            navigate(`/s/${systemId}/d/${docId}`)
          }}
        />
      )}
    </AppShell>
  )
}
