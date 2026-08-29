import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Button, TopBar } from '@great-mangofarm/mango-ui'
import { logout, useAuth } from '@/store/auth'
import { initialsOf } from '@/lib/name'

interface Props {
  children: ReactNode
  /** 상단 바 가운데에 놓을 것 — 보통 breadcrumb */
  center?: ReactNode
  /** 상단 바 오른쪽, 사용자 정보 앞에 놓을 것 */
  actions?: ReactNode
  /** 문서 화면처럼 폭을 꽉 쓰는 화면에서는 끈다 */
  contained?: boolean
}

export default function AppShell({ children, center, actions, contained = true }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar showSidebarTrigger={false} className="sticky top-0 z-30 gap-3">
        <Link to="/" className="shrink-0 text-sm font-semibold tracking-tight no-underline">
          기획서 리뷰
        </Link>

        <div className="min-w-0 flex-1">{center}</div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {user && (
            <>
              <Avatar size="sm" name={user.displayName} initials={initialsOf(user.displayName)} />
              <span className="hidden text-xs text-(--color-fg-muted) sm:inline">{user.displayName}</span>
            </>
          )}
          <Button size="xs" variant="ghost" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </TopBar>

      <main className={contained ? 'mx-auto w-full max-w-5xl flex-1 px-5 py-7' : 'flex-1'}>
        {children}
      </main>
    </div>
  )
}
