/** 계정은 이슈트래커(test-system)와 같은 users 컬렉션을 그대로 읽는다. 스키마를 맞춰둘 것. */
export type UserRole = 'admin' | 'pm' | 'developer' | 'staff'

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: UserRole
  team?: string
  createdAt: string
}

/** 시스템 — 화면 2에 나열되는 서비스·제품 단위 */
export interface SpecSystem {
  id: string
  name: string
  description?: string
  order: number
  createdAt: string
  createdBy: string
  createdByName: string
  docCount?: number
}

export type DocFormat = 'md' | 'html'

/** 기획서. 본문(source)까지 한 문서에 담는다 — Firestore 문서 상한 1MB 안에서 관리 */
export interface SpecDoc {
  id: string
  systemId: string
  title: string
  format: DocFormat
  source: string
  version: number
  ownerUid: string
  ownerName: string
  createdAt: string
  updatedAt: string
  lastEditedBy?: string
  /** PDF 로 뽑을 때 종이 방향. 넓은 다이어그램이 많으면 가로로 둔다 */
  pdfOrientation?: 'portrait' | 'landscape'
  /** 목록에서 쓰려고 미리 세어 둔 값 */
  commentCount?: number
  openCount?: number
}

/** 목록 화면에서는 본문을 안 읽는다 */
export type SpecDocMeta = Omit<SpecDoc, 'source'>

export type CommentScope = 'inline' | 'block' | 'doc'

export interface SpecComment {
  id: string
  docId: string
  systemId: string
  /** 스레드 루트의 id. 루트 자신은 자기 id를 갖는다 */
  threadId: string
  parentId: string | null
  scope: CommentScope
  blockId: string | null
  /** 인라인 댓글이 붙은 문장 */
  quote: string | null
  /** 블록 안에서의 문자 위치. 어긋나면 quote 로 다시 찾는다 */
  quoteStart: number | null
  /** 어느 판에 달렸는지 */
  docVersion: number
  body: string
  authorUid: string
  authorName: string
  createdAt: string
  updatedAt: string
  editedAt?: string
  resolved: boolean
  resolvedBy?: string | null
  resolvedByName?: string | null
  resolvedAt?: string | null
}

/** 서버 저장값은 아니고, 지금 문서와 대조해서 화면에서 붙이는 표시 */
export interface AnchoredComment extends SpecComment {
  orphaned: boolean
}

/** 렌더된 본문에서 뽑아낸 문단 하나 */
export interface Block {
  id: string
  index: number
  tag: string
  text: string
}

export interface Thread {
  root: AnchoredComment
  replies: AnchoredComment[]
}
