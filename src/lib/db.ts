/**
 * Firestore 접근. 브라우저가 직접 붙고 권한은 firestore.rules 가 막는다 (이슈트래커와 같은 방식).
 *
 * 목록은 전부 onSnapshot 으로 구독한다. 남이 단 댓글이 새로고침 없이 바로 보인다.
 *
 * 정렬은 서버가 아니라 받아온 뒤에 한다. orderBy 를 where 와 같이 쓰면 복합 색인을
 * 만들어야 하는데, 한 문서에 붙는 댓글이 많아야 수백 개라 그럴 이유가 없다.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  CommentScope,
  SpecComment,
  SpecDoc,
  SpecDocMeta,
  SpecSystem,
  UserProfile,
} from './types'

const SYSTEMS = 'specSystems'
const DOCS = 'specDocs'
const COMMENTS = 'specComments'

const nowIso = () => new Date().toISOString()

// ── 시스템 ────────────────────────────────────────────────────

export function watchSystems(
  onChange: (systems: SpecSystem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, SYSTEMS), orderBy('order', 'asc')),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as SpecSystem), id: d.id }))),
    onError,
  )
}

export async function getSystem(systemId: string): Promise<SpecSystem | null> {
  const snap = await getDoc(doc(db, SYSTEMS, systemId))
  return snap.exists() ? { ...(snap.data() as SpecSystem), id: snap.id } : null
}

export async function createSystem(
  input: { name: string; description?: string },
  user: UserProfile,
): Promise<string> {
  // 새로 만든 건 맨 뒤에 붙인다
  const existing = await getDocs(collection(db, SYSTEMS))
  const maxOrder = existing.docs.reduce((max, d) => Math.max(max, (d.data().order as number) ?? 0), 0)

  const ref = await addDoc(collection(db, SYSTEMS), {
    name: input.name,
    description: input.description ?? '',
    order: maxOrder + 1,
    createdAt: nowIso(),
    createdBy: user.uid,
    createdByName: user.displayName,
    docCount: 0,
  })
  return ref.id
}

export async function updateSystem(
  systemId: string,
  patch: Partial<Pick<SpecSystem, 'name' | 'description' | 'order'>>,
): Promise<void> {
  await updateDoc(doc(db, SYSTEMS, systemId), patch)
}

/** 시스템을 지우면 그 안의 기획서와 댓글까지 함께 지운다 */
export async function deleteSystem(systemId: string): Promise<void> {
  const docsSnap = await getDocs(query(collection(db, DOCS), where('systemId', '==', systemId)))
  const commentsSnap = await getDocs(
    query(collection(db, COMMENTS), where('systemId', '==', systemId)),
  )

  const batch = writeBatch(db)
  for (const d of docsSnap.docs) batch.delete(d.ref)
  for (const c of commentsSnap.docs) batch.delete(c.ref)
  batch.delete(doc(db, SYSTEMS, systemId))
  await batch.commit()
}

// ── 기획서 ────────────────────────────────────────────────────

export function watchDocs(
  systemId: string,
  onChange: (docs: SpecDocMeta[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, DOCS), where('systemId', '==', systemId)),
    (snap) => {
      const docs = snap.docs.map((d) => {
        const { source: _source, ...meta } = d.data() as SpecDoc
        return { ...meta, id: d.id } as SpecDocMeta
      })
      docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      onChange(docs)
    },
    onError,
  )
}

/** 본문까지 통째로 구독한다 — 남이 개정하면 보고 있던 화면도 같이 바뀐다 */
export function watchDoc(
  docId: string,
  onChange: (doc: SpecDoc | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, DOCS, docId),
    (snap) => onChange(snap.exists() ? ({ ...(snap.data() as SpecDoc), id: snap.id }) : null),
    onError,
  )
}

export async function createDoc(
  input: { systemId: string; title: string; format: SpecDoc['format']; source: string },
  user: UserProfile,
): Promise<string> {
  const timestamp = nowIso()
  const ref = await addDoc(collection(db, DOCS), {
    systemId: input.systemId,
    title: input.title,
    format: input.format,
    source: input.source,
    version: 1,
    ownerUid: user.uid,
    ownerName: user.displayName,
    createdAt: timestamp,
    updatedAt: timestamp,
    commentCount: 0,
    openCount: 0,
  })
  await bumpSystemDocCount(input.systemId)
  return ref.id
}

export async function updateDocMeta(
  docId: string,
  patch: {
    title?: string
    source?: string
    format?: SpecDoc['format']
    version?: number
    pdfOrientation?: SpecDoc['pdfOrientation']
  },
  user: UserProfile,
): Promise<void> {
  await updateDoc(doc(db, DOCS, docId), {
    ...patch,
    updatedAt: nowIso(),
    lastEditedBy: user.displayName,
  })
}

export async function deleteSpecDoc(docId: string, systemId: string): Promise<void> {
  const commentsSnap = await getDocs(query(collection(db, COMMENTS), where('docId', '==', docId)))

  const batch = writeBatch(db)
  for (const c of commentsSnap.docs) batch.delete(c.ref)
  batch.delete(doc(db, DOCS, docId))
  await batch.commit()

  await bumpSystemDocCount(systemId)
}

async function bumpSystemDocCount(systemId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, DOCS), where('systemId', '==', systemId)))
  await updateDoc(doc(db, SYSTEMS, systemId), { docCount: snap.size })
}

// ── 댓글 ──────────────────────────────────────────────────────

export function watchComments(
  docId: string,
  onChange: (comments: SpecComment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COMMENTS), where('docId', '==', docId)),
    (snap) => {
      const comments = snap.docs.map((d) => ({ ...(d.data() as SpecComment), id: d.id }))
      comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      onChange(comments)
    },
    onError,
  )
}

export interface NewComment {
  docId: string
  systemId: string
  scope: CommentScope
  blockId: string | null
  quote: string | null
  quoteStart: number | null
  docVersion: number
  body: string
  parentId: string | null
  /** 답글이면 루트의 id */
  threadId: string | null
}

export async function createComment(input: NewComment, user: UserProfile): Promise<string> {
  const timestamp = nowIso()
  const ref = doc(collection(db, COMMENTS))

  await setDoc(ref, {
    id: ref.id,
    docId: input.docId,
    systemId: input.systemId,
    // 루트 댓글은 자기 id 가 곧 스레드 id 다
    threadId: input.threadId ?? ref.id,
    parentId: input.parentId,
    scope: input.scope,
    blockId: input.blockId,
    quote: input.quote,
    quoteStart: input.quoteStart,
    docVersion: input.docVersion,
    body: input.body,
    authorUid: user.uid,
    authorName: user.displayName,
    createdAt: timestamp,
    updatedAt: timestamp,
    resolved: false,
  })

  await refreshCommentCounts(input.docId)
  return ref.id
}

export async function updateComment(
  commentId: string,
  docId: string,
  patch: Partial<Pick<SpecComment, 'body' | 'resolved' | 'resolvedBy' | 'resolvedByName' | 'resolvedAt' | 'editedAt'>>,
): Promise<void> {
  await updateDoc(doc(db, COMMENTS, commentId), { ...patch, updatedAt: nowIso() })
  if ('resolved' in patch) await refreshCommentCounts(docId)
}

/** 스레드 루트를 지우면 답글도 같이 지운다 */
export async function deleteComment(
  commentId: string,
  docId: string,
  isRoot: boolean,
): Promise<void> {
  if (isRoot) {
    const replies = await getDocs(
      query(collection(db, COMMENTS), where('threadId', '==', commentId)),
    )
    const batch = writeBatch(db)
    for (const reply of replies.docs) batch.delete(reply.ref)
    await batch.commit()
  } else {
    await deleteDoc(doc(db, COMMENTS, commentId))
  }
  await refreshCommentCounts(docId)
}

/** 목록 화면에서 쓰려고 문서에 열린 피드백 수를 적어 둔다 */
async function refreshCommentCounts(docId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, COMMENTS), where('docId', '==', docId)))
  const roots = snap.docs.map((d) => d.data() as SpecComment).filter((c) => !c.parentId)

  await updateDoc(doc(db, DOCS, docId), {
    commentCount: roots.length,
    openCount: roots.filter((c) => !c.resolved).length,
  })
}
