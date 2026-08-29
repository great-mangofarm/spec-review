import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  PageHeader,
  Spinner,
  TextField,
  Textarea,
  useToast,
} from '@great-mangofarm/mango-ui'
import AppShell from '@/components/AppShell'
import { canManage, useAuth } from '@/store/auth'
import { createSystem, deleteSystem, updateSystem, watchSystems } from '@/lib/db'
import type { SpecSystem } from '@/lib/types'

export default function SystemsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [systems, setSystems] = useState<SpecSystem[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<SpecSystem | 'new' | null>(null)

  useEffect(
    () =>
      watchSystems(
        (list) => {
          setSystems(list)
          setError('')
        },
        (err) => {
          // 실패해도 목록을 비워둬야 스피너가 안 멈추고 도는 대신 오류가 보인다
          setSystems([])
          setError(err.message)
        },
      ),
    [],
  )

  const manager = canManage(user)

  async function remove(system: SpecSystem) {
    const warning =
      system.docCount && system.docCount > 0
        ? `"${system.name}" 안의 기획서 ${system.docCount}개와 거기 달린 피드백까지 전부 지워져요. 계속할까요?`
        : `"${system.name}" 을 지울까요?`
    if (!window.confirm(warning)) return

    try {
      await deleteSystem(system.id)
      toast({ intent: 'success', title: '삭제했어요', description: `${system.name} 을 지웠어요.` })
    } catch (err) {
      toast({ intent: 'error', title: '삭제하지 못했어요', description: (err as Error).message })
    }
  }

  return (
    <AppShell>
      <PageHeader title="시스템">
        {manager && <Button onClick={() => setEditing('new')}>시스템 추가</Button>}
      </PageHeader>

      <p className="mt-1 mb-6 text-sm text-(--color-fg-muted)">
        기획서를 볼 서비스를 골라 주세요.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-(--color-bg-error-subtle,#fdeceb) px-3 py-2 text-sm text-(--color-fg-error,#b3261e)">
          {error}
        </p>
      )}

      {systems === null ? (
        <div className="grid place-items-center py-20">
          <Spinner size={24} label="불러오는 중" />
        </div>
      ) : systems.length === 0 ? (
        <EmptyState
          title="아직 시스템이 없어요"
          description={
            manager
              ? '첫 시스템을 만들어 주세요. 서비스나 제품 단위로 나누면 좋아요.'
              : '관리자가 시스템을 만들면 여기에 보여요.'
          }
          actions={manager ? [{ label: '시스템 추가', onClick: () => setEditing('new') }] : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {systems.map((system) => (
            <Card key={system.id} className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => navigate(`/s/${system.id}`)}
                className="flex-1 cursor-pointer text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight">{system.name}</h2>
                  <Badge size="sm" variant="soft" intent={system.docCount ? 'primary' : 'secondary'}>
                    기획서 {system.docCount ?? 0}
                  </Badge>
                </div>
                {system.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-(--color-fg-muted)">
                    {system.description}
                  </p>
                )}
              </button>

              {manager && (
                <div className="flex gap-1 border-t border-(--color-border) pt-2">
                  <Button size="xxs" variant="ghost" onClick={() => setEditing(system)}>
                    이름 바꾸기
                  </Button>
                  <Button size="xxs" variant="ghost" intent="error" onClick={() => remove(system)}>
                    삭제
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <SystemDialog
          system={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            toast({ intent: 'success', title: message, description: '' })
          }}
        />
      )}
    </AppShell>
  )
}

function SystemDialog({
  system,
  onClose,
  onSaved,
}: {
  system: SpecSystem | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const { user } = useAuth()
  const [name, setName] = useState(system?.name ?? '')
  const [description, setDescription] = useState(system?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!user || !name.trim()) return
    setBusy(true)
    setError('')
    try {
      if (system) {
        await updateSystem(system.id, { name: name.trim(), description: description.trim() })
        onSaved('수정했어요')
      } else {
        await createSystem({ name: name.trim(), description: description.trim() }, user)
        onSaved('시스템을 만들었어요')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="sm">
      <DialogHeader title={system ? '시스템 수정' : '시스템 추가'} />
      <DialogBody className="flex flex-col gap-4">
        <TextField
          label="이름"
          placeholder="예: 충전 관제"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Textarea
          label="설명"
          placeholder="어떤 서비스인지 한 줄로"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          validation={error ? 'error' : undefined}
          helperText={error || undefined}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          취소
        </Button>
        <Button onClick={save} loading={busy} disabled={!name.trim()}>
          저장
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
