import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@great-mangofarm/mango-ui'
import { AuthProvider } from '@/store/auth'
import RequireAuth from '@/components/RequireAuth'
import LoginPage from '@/pages/LoginPage'
import SystemsPage from '@/pages/SystemsPage'
import DocsPage from '@/pages/DocsPage'
import DocPage from '@/pages/DocPage'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<SystemsPage />} />
              <Route path="/s/:systemId" element={<DocsPage />} />
              <Route path="/s/:systemId/d/:docId" element={<DocPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
