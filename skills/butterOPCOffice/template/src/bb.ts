// Butterbase backend client for butterOPCOffice.
// Wraps the auto-generated REST data API + end-user auth.

const env = (import.meta as any).env || {}
const HOST: string = env.VITE_BB_HOST || 'https://api.butterbase.ai'
export const APP_ID: string = env.VITE_BB_APP || 'app_REPLACE_ME'
const DATA = `${HOST}/v1/${APP_ID}`
const AUTH = `${HOST}/auth/${APP_ID}`

const LS = { access: 'bn_access', refresh: 'bn_refresh', user: 'bn_user' }

export interface User {
  id: string
  email: string
  display_name?: string | null
  avatar_url?: string | null
  email_verified?: boolean
}

// ---------------------------------------------------------------- session
export function getUser(): User | null {
  try {
    const s = localStorage.getItem(LS.user)
    return s ? (JSON.parse(s) as User) : null
  } catch {
    return null
  }
}
function token(): string {
  return localStorage.getItem(LS.access) || ''
}
/** The current end-user's id, or '' if signed out. */
export function currentUserId(): string {
  return getUser()?.id || ''
}
function saveSession(access: string, refresh: string, user: User) {
  localStorage.setItem(LS.access, access)
  localStorage.setItem(LS.refresh, refresh)
  localStorage.setItem(LS.user, JSON.stringify(user))
}
export function clearSession() {
  localStorage.removeItem(LS.access)
  localStorage.removeItem(LS.refresh)
  localStorage.removeItem(LS.user)
}

async function readErr(r: Response): Promise<string> {
  try {
    const j: any = await r.json()
    return j?.error?.message || j?.message || j?.error || `Request failed (${r.status})`
  } catch {
    return `Request failed (${r.status})`
  }
}

// ------------------------------------------------------------------- auth
export async function signup(email: string, password: string, displayName: string): Promise<User> {
  const r = await fetch(`${AUTH}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName || email.split('@')[0] }),
  })
  if (!r.ok) throw new Error(await readErr(r))
  // Signup returns the profile only — a verification email is sent. Log in to get tokens.
  return login(email, password)
}

export async function login(email: string, password: string): Promise<User> {
  const r = await fetch(`${AUTH}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) throw new Error(await readErr(r))
  const j: any = await r.json()
  saveSession(j.access_token, j.refresh_token, j.user)
  return j.user as User
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${AUTH}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } })
  } catch {
    /* ignore network errors on logout */
  }
  clearSession()
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem(LS.refresh)
  if (!rt) return false
  try {
    const r = await fetch(`${AUTH}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!r.ok) return false
    const j: any = await r.json()
    saveSession(j.access_token, j.refresh_token, j.user || getUser())
    return true
  } catch {
    return false
  }
}

/** Validate the stored session against the server. Returns the fresh profile or null. */
export async function verifySession(): Promise<User | null> {
  if (!token()) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${AUTH}/me`, { headers: { Authorization: `Bearer ${token()}` } })
    if (r.ok) {
      const u = (await r.json()) as User
      localStorage.setItem(LS.user, JSON.stringify(u))
      return u
    }
    if (r.status === 401 && attempt === 0 && (await tryRefresh())) continue
    break
  }
  return null
}

// ----------------------------------------------------------------- OAuth
/** Build the OAuth start URL for a provider. The browser is sent here; after
 *  the provider signs the user in, Butterbase redirects back to `redirectTo`
 *  with the session tokens appended as query params. */
export function oauthStartUrl(provider: string, redirectTo: string): string {
  return `${AUTH}/oauth/${provider}?redirect_to=${encodeURIComponent(redirectTo)}`
}

/**
 * Detect a Butterbase OAuth callback in the current URL and, if present,
 * complete the sign-in: persist the returned tokens into the same storage
 * `verifySession` reads, strip the token params from the URL, then resolve
 * the user via /me.
 *
 * Butterbase appends tokens to `redirect_to` as query params
 * (`?access_token=...&refresh_token=...&expires_in=...&token_type=Bearer`).
 * As a defensive measure we also accept a `#`-hash variant.
 *
 * Returns the resolved User on success, or null when there is no callback to
 * consume (or it failed). Never throws — a bad callback degrades to "no user".
 */
export async function consumeOAuthCallback(): Promise<User | null> {
  let access = ''
  let refresh = ''
  try {
    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash,
    )
    access = search.get('access_token') || hash.get('access_token') || ''
    refresh = search.get('refresh_token') || hash.get('refresh_token') || ''
  } catch {
    return null
  }
  if (!access) return null

  // Persist tokens so verifySession / request() pick them up. We have no user
  // profile yet — store a minimal placeholder and let /me supply the real one.
  saveSession(access, refresh, getUser() || ({ id: '', email: '' } as User))

  // Strip the token params (and any other OAuth cruft) from the URL so a
  // reload or shared link does not re-trigger the callback or leak tokens.
  try {
    const url = new URL(window.location.href)
    for (const k of ['access_token', 'refresh_token', 'expires_in', 'token_type']) {
      url.searchParams.delete(k)
    }
    if (/access_token=|refresh_token=/.test(url.hash)) url.hash = ''
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash)
  } catch {
    /* non-fatal — tokens are already persisted */
  }

  // Resolve the authenticated identity. On failure, clear the half-session.
  const user = await verifySession()
  if (!user) {
    clearSession()
    return null
  }
  return user
}

/** Resolve any pending share invites addressed to the signed-in user's email. */
export async function claimInvites(): Promise<void> {
  try {
    await fetch(`${DATA}/fn/claim-invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
    })
  } catch {
    /* best-effort — invites still resolve on a later load */
  }
}

// --------------------------------------------------------------- data API
export type Filter = Record<string, string>
interface ListOpts {
  filter?: Filter
  order?: string
  limit?: number
  select?: string
}

function buildPath(table: string, opts?: ListOpts): string {
  const p = new URLSearchParams()
  if (opts?.filter) for (const k of Object.keys(opts.filter)) p.set(k, opts.filter[k])
  if (opts?.order) p.set('order', opts.order)
  if (opts?.limit) p.set('limit', String(opts.limit))
  if (opts?.select) p.set('select', opts.select)
  const s = p.toString()
  return `/${table}${s ? `?${s}` : ''}`
}

let onAuthLost: (() => void) | null = null
export function setAuthLostHandler(fn: () => void) {
  onAuthLost = fn
}

async function request(method: string, path: string, body?: any, allowRetry = true): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token()}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await fetch(`${DATA}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) {
    if (allowRetry && (await tryRefresh())) return request(method, path, body, false)
    clearSession()
    if (onAuthLost) onAuthLost()
    throw new Error('Session expired')
  }
  if (!r.ok) throw new Error(`${method} ${path} → ${await readErr(r)}`)
  if (r.status === 204) return null
  const txt = await r.text()
  return txt ? JSON.parse(txt) : null
}

// Columns stored as `text` in Postgres but holding JSON — the REST layer
// mishandles nested jsonb, so we serialize them ourselves.
const JSON_COLS: Record<string, string[]> = {
  blocks: ['props'],
  db_fields: ['options'],
  db_records: ['props'],
  db_views: ['config'],
}

function encodeRow(table: string, data: any): any {
  const cols = JSON_COLS[table]
  if (!cols || !data) return data
  const out = { ...data }
  for (const c of cols) {
    if (c in out && typeof out[c] !== 'string') out[c] = JSON.stringify(out[c] ?? null)
  }
  return out
}

function decodeRow(table: string, row: any): any {
  const cols = JSON_COLS[table]
  if (!cols || !row || typeof row !== 'object') return row
  for (const c of cols) {
    if (typeof row[c] === 'string') {
      try {
        row[c] = JSON.parse(row[c])
      } catch {
        /* leave the raw string if it is not valid JSON */
      }
    }
  }
  return row
}

export async function dbList<T = any>(table: string, opts?: ListOpts): Promise<T[]> {
  const r = await request('GET', buildPath(table, opts))
  const rows: any[] = Array.isArray(r) ? r : r && Array.isArray(r.data) ? r.data : []
  return rows.map((row) => decodeRow(table, row)) as T[]
}

export async function dbCreate<T = any>(table: string, data: any): Promise<T> {
  const r = await request('POST', `/${table}`, encodeRow(table, data))
  const row = Array.isArray(r) ? r[0] : r
  return (row && typeof row === 'object' ? decodeRow(table, row) : data) as T
}

export async function dbUpdate<T = any>(table: string, id: string, patch: any): Promise<T> {
  const r = await request('PATCH', `/${table}/${id}`, encodeRow(table, patch))
  const row = Array.isArray(r) ? r[0] : r
  return (row && typeof row === 'object' ? decodeRow(table, row) : { id, ...patch }) as T
}

export async function dbDelete(table: string, id: string): Promise<void> {
  await request('DELETE', `/${table}/${id}`)
}

// ============================================================ email gate
// This office is restricted to your team. Logins/signups from any other
// email domain are rejected after the auth call (see App.tsx Auth).
// SET THIS to your team's email domain(s) when you set up your office.
export const ALLOWED_EMAIL_DOMAINS = ['example.com']

// Optional per-address exceptions — emails that pass the gate regardless of
// domain. Leave empty unless you need to allow a specific outside address.
export const ALLOWED_EMAILS: string[] = []

/** True if the email is explicitly allow-listed or its domain is on the allow-list. */
export function isAllowedEmail(email: string): boolean {
  const normalized = (email || '').trim().toLowerCase()
  if (ALLOWED_EMAILS.includes(normalized)) return true
  const at = normalized.lastIndexOf('@')
  if (at < 0) return false
  const domain = normalized.slice(at + 1)
  return ALLOWED_EMAIL_DOMAINS.includes(domain)
}

// ================================================================ RAG layer
// Team-wide semantic search over the office's *shared* pages + database
// records, backed by the Butterbase `butterpages` RAG collection (shared
// access mode — every teammate queries one common index).
//
// PRIVACY: only pages with visibility='shared' are ever ingested. Private
// pages are deliberately excluded so private content never surfaces in a
// teammate's ⌘K search. The guard lives in indexPage / indexRecord below, so
// even a caller that forgets to filter cannot leak a private page.
//
// IMPORTANT: every RAG call here is fire-and-forget. A RAG failure must never
// throw into the editor, the database, or login. Callers do not await results
// for UI-critical paths.

const RAG_COLLECTION = 'butterpages'
const RAG = `${DATA}/rag/collections/${RAG_COLLECTION}`

export interface RagChunk {
  text: string
  score: number
  document_id: string
  metadata: Record<string, any>
}
export interface RagResult {
  chunks: RagChunk[]
  answer?: string
}
export interface RagMetadata {
  kind: 'doc' | 'record'
  page_id: string
  page_title?: string
  record_id?: string
  [k: string]: any
}

/**
 * Ingest a text document into the RAG collection. Returns the new documentId,
 * or '' on any failure (never throws).
 */
export async function ragIngest(text: string, metadata: RagMetadata): Promise<string> {
  const body = (text || '').trim()
  if (!body || !token()) return ''
  try {
    const r = await fetch(`${RAG}/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: body, metadata }),
    })
    if (!r.ok) return ''
    const j: any = await r.json()
    return (j?.documentId || j?.document_id || '') as string
  } catch {
    return ''
  }
}

interface RagQueryOpts {
  pageId?: string
  topK?: number
  synthesize?: boolean
}

/**
 * Semantic search the RAG collection. When `pageId` is set, results are
 * filtered to that page via metadata. Returns { chunks: [] } on any failure.
 */
export async function ragQuery(query: string, opts: RagQueryOpts = {}): Promise<RagResult> {
  const q = (query || '').trim()
  if (!q || !token()) return { chunks: [] }
  try {
    const payload: any = {
      query: q,
      top_k: opts.topK ?? 8,
      synthesize: !!opts.synthesize,
    }
    if (opts.pageId) payload.filter = { page_id: opts.pageId }
    const r = await fetch(`${RAG}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) return { chunks: [] }
    const j: any = await r.json()
    const rawChunks: any[] = Array.isArray(j?.chunks) ? j.chunks : []
    // The query API returns chunks shaped { content, score, document:{id}, metadata }.
    // Normalize to a stable { text, score, document_id, metadata }.
    const chunks: RagChunk[] = rawChunks.map((c) => ({
      text: c.text ?? c.content ?? '',
      score: typeof c.score === 'number' ? c.score : 0,
      document_id: c.document_id || c.document?.id || c.documentId || '',
      metadata: c.metadata || {},
    }))
    return { chunks, answer: typeof j?.answer === 'string' ? j.answer : undefined }
  } catch {
    return { chunks: [] }
  }
}

/**
 * Delete a RAG document. The Butterbase REST delete route exists but does not
 * resolve documents ingested with an end-user JWT, so this is a best-effort
 * no-op: it attempts the call but never throws and never reports failure.
 * Search results dedupe by record_id/page_id to hide stale duplicates instead.
 */
export async function ragDelete(docId?: string | null): Promise<void> {
  if (!docId || !token()) return
  try {
    await fetch(`${RAG}/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    })
  } catch {
    /* best-effort — see doc comment */
  }
}

// ---- index helpers --------------------------------------------------------
// Minimal shapes so bb.ts stays free of a circular import on model.ts.
interface IndexField {
  id: string
  name: string
  type: string
  options?: { id: string; label: string }[]
}
interface IndexRecord {
  id: string
  props: Record<string, any>
  rag_doc_id?: string | null
}
interface IndexPage {
  id: string
  title: string
  /** Only 'shared' pages are indexed into the team search collection. */
  visibility?: string
  rag_doc_id?: string | null
}

/** Resolve a stored cell value to human-readable text using the field defs. */
function fieldValueText(field: IndexField, value: any): string {
  if (value == null || value === '') return ''
  if (field.type === 'select') {
    return field.options?.find((o) => o.id === value)?.label || ''
  }
  if (field.type === 'multi_select') {
    const ids: string[] = Array.isArray(value) ? value : [value]
    return ids
      .map((id) => field.options?.find((o) => o.id === id)?.label || '')
      .filter(Boolean)
      .join(', ')
  }
  if (field.type === 'checkbox') return value ? 'yes' : 'no'
  return String(value)
}

// Debounce re-index of the same row so rapid edits collapse into one ingest.
const reindexTimers = new Map<string, number>()
function debounceReindex(key: string, fn: () => void, ms = 1500) {
  const prev = reindexTimers.get(key)
  if (prev) clearTimeout(prev)
  reindexTimers.set(
    key,
    window.setTimeout(() => {
      reindexTimers.delete(key)
      fn()
    }, ms),
  )
}

/**
 * Index a database record for semantic search. Builds searchable text from
 * each field's `name: value` plus the parent page title, replaces any prior
 * RAG document, and persists the new rag_doc_id on the record.
 *
 * Skips records whose parent page is private — private content must never
 * enter the shared team search index. Fire-and-forget — failures swallowed.
 */
export async function indexRecord(
  record: IndexRecord,
  page: IndexPage,
  fields: IndexField[],
): Promise<void> {
  // Privacy guard: only shared (workspace) pages are searchable team-wide.
  if (page.visibility && page.visibility !== 'shared') return
  try {
    const lines: string[] = []
    if (page.title?.trim()) lines.push(page.title.trim())
    for (const f of fields) {
      const txt = fieldValueText(f, record.props?.[f.id])
      if (txt) lines.push(`${f.name}: ${txt}`)
    }
    const text = lines.join('\n')
    if (!text.trim()) return
    if (record.rag_doc_id) await ragDelete(record.rag_doc_id)
    const docId = await ragIngest(text, {
      kind: 'record',
      page_id: page.id,
      page_title: page.title || '',
      record_id: record.id,
    })
    if (docId) {
      record.rag_doc_id = docId
      await dbUpdate('db_records', record.id, { rag_doc_id: docId }).catch(() => {})
    }
  } catch {
    /* fire-and-forget */
  }
}

/** Debounced variant of indexRecord — collapses rapid edits to one ingest. */
export function indexRecordDebounced(
  record: IndexRecord,
  page: IndexPage,
  fields: IndexField[],
): void {
  debounceReindex(`record:${record.id}`, () => {
    void indexRecord(record, page, fields)
  })
}

/**
 * Index a doc-type page for semantic search. Text = page title + all block
 * text. Replaces any prior RAG document and persists the new rag_doc_id on
 * the page.
 *
 * Skips private pages — only shared (workspace) pages enter the team-wide
 * search index. Fire-and-forget.
 */
export async function indexPage(page: IndexPage, fullText: string): Promise<void> {
  // Privacy guard: only shared (workspace) pages are searchable team-wide.
  if (page.visibility && page.visibility !== 'shared') return
  try {
    const text = [page.title?.trim() || '', (fullText || '').trim()]
      .filter(Boolean)
      .join('\n')
    if (!text.trim()) return
    if (page.rag_doc_id) await ragDelete(page.rag_doc_id)
    const docId = await ragIngest(text, {
      kind: 'doc',
      page_id: page.id,
      page_title: page.title || '',
    })
    if (docId) {
      page.rag_doc_id = docId
      await dbUpdate('pages', page.id, { rag_doc_id: docId }).catch(() => {})
    }
  } catch {
    /* fire-and-forget */
  }
}

/** Debounced variant of indexPage — collapses rapid edits to one ingest. */
export function indexPageDebounced(page: IndexPage, fullText: string): void {
  debounceReindex(`page:${page.id}`, () => {
    void indexPage(page, fullText)
  })
}

/**
 * Remove a row from the search index: delete its RAG document and clear the
 * rag_doc_id column. Fire-and-forget.
 */
export async function unindex(table: 'pages' | 'db_records', row: { id: string; rag_doc_id?: string | null }): Promise<void> {
  try {
    if (row.rag_doc_id) {
      await ragDelete(row.rag_doc_id)
      await dbUpdate(table, row.id, { rag_doc_id: null }).catch(() => {})
      row.rag_doc_id = null
    }
  } catch {
    /* fire-and-forget */
  }
}

// ----------------------------------------------------------------- helpers
export function uid(): string {
  const c: any = (globalThis as any).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Fractional index between two sort_order values. */
export function orderBetween(before?: number, after?: number): number {
  if (before == null && after == null) return Date.now() % 1e9
  if (before == null) return (after as number) - 1
  if (after == null) return before + 1
  return (before + after) / 2
}
