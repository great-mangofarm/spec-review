import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, TextField } from '@great-mangofarm/mango-ui'
import { login, sendPasswordReset, useAuth } from '@/store/auth'

type View = 'login' | 'reset'

export default function LoginPage() {
  const { user, blocked } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [view, setView] = useState<View>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [resetEmail, setResetEmail] = useState('')
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    if (!user) return
    const from = (location.state as { from?: Location })?.from
    navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true })
  }, [user, location.state, navigate])

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), password)
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않아요')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await sendPasswordReset(resetEmail.trim())
      setResetDone(true)
    } catch {
      setError('메일을 보내지 못했어요. 등록된 계정인지 확인해 주세요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-(--color-bg-subtle) px-5">
      <Card size="md" className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">기획서 리뷰</h1>
          <p className="mt-1 text-xs text-(--color-fg-muted)">
            {view === 'login' ? '이슈트래커와 같은 계정으로 들어와요' : '비밀번호 찾기'}
          </p>
        </div>

        {blocked && (
          <p className="mb-4 rounded-md bg-(--color-bg-error-subtle,#fdeceb) px-3 py-2 text-xs text-(--color-fg-error,#b3261e)">
            이 계정은 접근 권한이 없어요. 관리자에게 문의해 주세요.
          </p>
        )}

        {view === 'login' ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <TextField
              label="이메일"
              type="email"
              autoComplete="username"
              placeholder="name@everon.co.kr"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
              autoFocus
              required
            />
            <TextField
              label="비밀번호"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              validation={error ? 'error' : undefined}
              helperText={error || undefined}
              required
            />
            <Button type="submit" fullWidth loading={busy} disabled={!email || !password}>
              로그인
            </Button>
            <button
              type="button"
              className="text-xs text-(--color-fg-muted) underline-offset-2 hover:underline"
              onClick={() => {
                setView('reset')
                setError('')
                setResetEmail(email)
              }}
            >
              비밀번호를 잊었어요
            </button>
          </form>
        ) : resetDone ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm">
              <strong>{resetEmail}</strong> 으로 재설정 메일을 보냈어요.
              <br />
              받은 편지함을 확인해 주세요.
            </p>
            <Button variant="outline" fullWidth onClick={() => { setView('login'); setResetDone(false) }}>
              로그인으로 돌아가기
            </Button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <TextField
              label="이메일"
              type="email"
              placeholder="name@everon.co.kr"
              value={resetEmail}
              onChange={(e) => {
                setResetEmail(e.target.value)
                setError('')
              }}
              validation={error ? 'error' : undefined}
              helperText={error || undefined}
              autoFocus
              required
            />
            <Button type="submit" fullWidth loading={busy} disabled={!resetEmail}>
              재설정 메일 보내기
            </Button>
            <Button variant="ghost" fullWidth onClick={() => { setView('login'); setError('') }}>
              돌아가기
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
