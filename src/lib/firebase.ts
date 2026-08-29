import { initializeApp } from 'firebase/app'
import { initializeFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

// 이슈트래커(test-system)와 같은 Firebase 프로젝트를 본다 — 계정을 공유하려고.
// 값은 .env.local 에 넣는다 (커밋 금지).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

// ignoreUndefinedProperties: 폼 상태에 undefined 가 섞여도 쓰기 전체가 실패하지 않게
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })
export const auth = getAuth(app)
