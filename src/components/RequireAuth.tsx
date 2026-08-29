import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '@great-mangofarm/mango-ui'
import { useAuth } from '@/store/auth'

export default function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner size={28} label="불러오는 중" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return <Outlet />
}
