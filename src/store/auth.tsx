/**
 * 로그인. 이슈트래커(test-system)와 같은 Firebase 프로젝트를 보기 때문에
 * 계정을 새로 만들 필요가 없다 — 거기 쓰던 아이디로 그대로 들어온다.
 * 그래서 이 앱에는 회원가입이 없다.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import type { UserProfile, UserRole } from '@/lib/types'

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  /** users 문서가 없어서 막힌 경우 */
  blocked: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, blocked: false })

export const useAuth = () => useContext(AuthContext)

/** 시스템·기획서를 만들고 고칠 수 있는 사람 */
export const canManage = (user: UserProfile | null) =>
  user?.role === 'admin' || user?.role === 'pm'

/** 남의 댓글까지 지울 수 있는 사람 */
export const canModerate = canManage

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setBlocked(false)
        setLoading(false)
        return
      }

      const snap = await getDoc(doc(db, 'users', firebaseUser.uid))

      if (snap.exists()) {
        const data = snap.data()
        setUser({
          uid: firebaseUser.uid,
          email: data.email ?? firebaseUser.email ?? '',
          displayName: data.displayName || (firebaseUser.email ?? '').split('@')[0],
          role: (data.role as UserRole) ?? 'staff',
          team: data.team,
          createdAt: data.createdAt ?? '',
        })
        setBlocked(false)
      } else {
        // 인증은 됐는데 users 문서가 없다 = 이 조직 계정이 아니거나 삭제된 계정
        await signOut(auth)
        setUser(null)
        setBlocked(true)
      }
      setLoading(false)
    })
  }, [])

  return <AuthContext.Provider value={{ user, loading, blocked }}>{children}</AuthContext.Provider>
}

export async function login(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password)
}

export async function logout(): Promise<void> {
  await signOut(auth)
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}
