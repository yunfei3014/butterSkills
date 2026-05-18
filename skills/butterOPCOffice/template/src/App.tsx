import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as bb from './bb'
import { Block, Field, Page, Rec, Share } from './model'
import Editor from './Editor'
import Database from './Database'
import TemplateGallery from './TemplateGallery'
import ShareDialog from './ShareDialog'
import WorkspaceSettings from './WorkspaceSettings'
import Search from './Search'
import { instantiateTemplate, TemplateDef } from './templates'
import { EmojiPicker, Popover, Toaster, toast } from './ui'

type PageRole = 'owner' | 'editor' | 'viewer'

// This office is restricted to your team. Shown when a login (email/password
// OR Google) resolves to an email outside the allow-list.
const RESTRICTED_MSG =
  'This office is restricted — sign in with an approved team email address.'

// =============================================================== root
export default function App() {
  const [user, setUser] = useState<bb.User | null>(bb.getUser())
  const [checking, setChecking] = useState(true)
  // A restriction message raised during OAuth callback handling, handed to the
  // Auth screen so the rejected Google user sees why they were signed out.
  const [authNotice, setAuthNotice] = useState('')

  useEffect(() => {
    bb.setAuthLostHandler(() => {
      setUser(null)
      toast('Session expired — please sign in again')
    })

    let alive = true
    ;(async () => {
      try {
        // First, see if we returned from a Google OAuth round-trip — tokens
        // arrive as query params on our own origin. consumeOAuthCallback
        // persists them, cleans the URL, and resolves the profile.
        const oauthUser = await bb.consumeOAuthCallback()
        if (oauthUser) {
          // Apply the same domain gate as email/password sign-in.
          if (!bb.isAllowedEmail(oauthUser.email || '')) {
            await bb.logout()
            if (alive) setAuthNotice(RESTRICTED_MSG)
            return
          }
          if (alive) setUser(oauthUser)
          return
        }
        // No OAuth callback — validate any existing stored session.
        const u = await bb.verifySession()
        if (alive) setUser(u)
      } catch {
        /* fall through to the Auth screen */
      } finally {
        if (alive) setChecking(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  if (checking) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }
  if (!user) return <Auth onAuth={setUser} notice={authNotice} />
  return <Workspace user={user} onLogout={() => setUser(null)} />
}

// =============================================================== auth
function Auth({ onAuth, notice }: { onAuth: (u: bb.User) => void; notice?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // Seed the error with any notice raised during OAuth callback handling
  // (e.g. a Google sign-in rejected by the email-domain gate).
  const [err, setErr] = useState(notice || '')

  // Hand the browser to Butterbase's Google OAuth start endpoint. After Google
  // signs the user in, Butterbase redirects back to this same URL with the
  // session tokens as query params — App's startup effect consumes them.
  const continueWithGoogle = () => {
    setBusy(true)
    window.location.href = bb.oauthStartUrl('google', window.location.origin + '/')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    const addr = email.trim()
    // Reject disallowed domains up front, before hitting the auth API.
    if (!bb.isAllowedEmail(addr)) {
      setErr(RESTRICTED_MSG)
      return
    }
    setBusy(true)
    try {
      const u =
        mode === 'login' ? await bb.login(addr, password) : await bb.signup(addr, password, name.trim())
      // Re-check the authenticated identity's email — the server is the source
      // of truth, and signup may normalize the address.
      if (!bb.isAllowedEmail(u.email || '')) {
        await bb.logout()
        setErr(RESTRICTED_MSG)
        setBusy(false)
        return
      }
      onAuth(u)
    } catch (ex: any) {
      setErr(ex?.message || 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">🦋</div>
        <div className="auth-title">butterOPCOffice</div>
        <div className="auth-sub">
          {mode === 'login' ? 'Welcome back. Sign in to your workspace.' : 'Create your workspace in seconds.'}
        </div>
        {err && <div className="auth-error">{err}</div>}
        {mode === 'signup' && (
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? '8+ chars, mixed case, number, symbol' : '••••••••'}
          />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <div className="auth-divider">
          <span>or</span>
        </div>
        <button
          type="button"
          className="btn-google"
          disabled={busy}
          onClick={continueWithGoogle}
        >
          <svg className="btn-google-icon" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
          Continue with Google
        </button>
        <div className="auth-toggle">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setErr('')
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}

// =============================================================== workspace
function Workspace({ user, onLogout }: { user: bb.User; onLogout: () => void }) {
  const [pages, setPages] = useState<Page[]>([])
  const [loaded, setLoaded] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [gallery, setGallery] = useState(false)
  const [shareFor, setShareFor] = useState<Page | null>(null)
  const [myShares, setMyShares] = useState<Share[]>([])
  // A monotonically-rising counter; bumped by ⌘K to tell the always-visible
  // floating search bar to grab (or release) focus.
  const [searchFocus, setSearchFocus] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const pagesRef = useRef<Page[]>([])
  pagesRef.current = pages
  const seeding = useRef(false)
  const titleTimers = useRef<Map<string, number>>(new Map())

  // ---- global ⌘K / Ctrl+K → focus the always-visible floating search bar.
  // Capture phase so it works even while focus is in an input or the editor;
  // we only intercept the exact combo so nothing else is hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchFocus((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // ---- hash routing
  useEffect(() => {
    const read = () => {
      const m = location.hash.match(/^#\/p\/(.+)$/)
      setCurrentId(m ? m[1] : null)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const navigate = useCallback((id: string | null) => {
    location.hash = id ? `/p/${id}` : ''
  }, [])

  // ---- load: resolve pending invites, then fetch pages + shares
  useEffect(() => {
    let alive = true
    const run = async () => {
      await bb.claimInvites()
      let rows: Page[]
      let shares: Share[]
      try {
        ;[rows, shares] = await Promise.all([
          bb.dbList<Page>('pages', { order: 'sort_order.asc' }),
          bb.dbList<Share>('shares'),
        ])
      } catch {
        if (alive) setLoaded(true)
        return
      }
      if (!alive) return
      setMyShares(shares)
      const active = rows.filter((r) => !r.archived)
      if (active.length === 0 && !seeding.current) {
        seeding.current = true
        const seeded = await seedWorkspace()
        if (!alive) return
        setPages([...rows, ...seeded.pages])
        setLoaded(true)
        navigate(seeded.home.id)
        return
      }
      setPages(rows)
      setLoaded(true)
      if (!location.hash) {
        // Open the first workspace (shared) root page — the office home.
        // Fall back to the user's own private pages, then shared-with-me.
        const roots = active
          .filter((p) => p.parent_id == null)
          .sort((a, b) => a.sort_order - b.sort_order)
        const firstShared = roots.find((p) => p.visibility === 'shared')
        const firstPrivate = roots.find(
          (p) => p.visibility === 'private' && (p.owner_id || '') === user.id,
        )
        const target = firstShared || firstPrivate || roots[0]
        if (target) navigate(target.id)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [navigate, user.id])

  // The current user's role on a page:
  //  - owner  → they created it (full control + can change sharing).
  //  - editor → a workspace-shared page (every teammate can edit), OR a
  //             private page they were invited to with the 'editor' role.
  //  - viewer → a private page they were invited to with the 'viewer' role.
  const roleFor = useCallback(
    (p: Page | null): PageRole => {
      if (!p) return 'owner'
      if ((p.owner_id || '') === user.id) return 'owner'
      if (p.visibility === 'shared') return 'editor'
      const s = myShares.find((x) => x.page_id === p.id && x.invitee_id === user.id)
      return s?.role === 'editor' ? 'editor' : 'viewer'
    },
    [user.id, myShares],
  )

  // ---- page mutations
  // A new top-level page defaults to the team workspace ('shared') — or the
  // explicit `visibility` passed (the Private section creates 'private' roots).
  // A new sub-page always inherits its parent page's visibility — open a
  // private page, create a sub-page, and the sub-page stays private too.
  const createPage = useCallback(
    async (
      parentId: string | null,
      kind: 'doc' | 'database' = 'doc',
      rootVisibility: Page['visibility'] = 'shared',
    ) => {
      const siblings = pagesRef.current.filter((p) => p.parent_id === parentId && !p.archived)
      const parent = parentId ? pagesRef.current.find((p) => p.id === parentId) : null
      const visibility: Page['visibility'] = parent ? parent.visibility : rootVisibility
      const np: Page = {
        id: bb.uid(),
        owner_id: bb.currentUserId(),
        parent_id: parentId,
        title: '',
        icon: kind === 'database' ? '🗃️' : '📄',
        kind,
        cover: null,
        sort_order: bb.orderBetween(siblings[siblings.length - 1]?.sort_order),
        archived: false,
        visibility,
      }
      setPages((p) => [...p, np])
      await bb.dbCreate('pages', np).catch(() => {})
      // Index the (empty) doc page so its title becomes searchable — but only
      // for workspace-shared pages; private content never enters team search.
      // Block text is indexed by the Editor as the user types. Fire-and-forget.
      if (kind === 'doc' && visibility === 'shared') void bb.indexPage(np, '')
      navigate(np.id)
      return np
    },
    [navigate],
  )

  const createSubPage = useCallback(async (title: string, parentId: string) => {
    const siblings = pagesRef.current.filter((p) => p.parent_id === parentId && !p.archived)
    const parent = pagesRef.current.find((p) => p.id === parentId)
    const visibility: Page['visibility'] = parent ? parent.visibility : 'shared'
    const np: Page = {
      id: bb.uid(),
      owner_id: bb.currentUserId(),
      parent_id: parentId,
      title: title || 'Untitled',
      icon: '📄',
      kind: 'doc',
      cover: null,
      sort_order: bb.orderBetween(siblings[siblings.length - 1]?.sort_order),
      archived: false,
      visibility,
    }
    setPages((p) => [...p, np])
    await bb.dbCreate('pages', np).catch(() => {})
    return np
  }, [])

  const useTemplate = useCallback(
    async (def: TemplateDef) => {
      const roots = pagesRef.current.filter((p) => p.parent_id == null && !p.archived)
      const so = bb.orderBetween(roots[roots.length - 1]?.sort_order)
      try {
        const page = await instantiateTemplate(def, so)
        setPages((p) => [...p, page])
        setGallery(false)
        navigate(page.id)
        toast(`Added "${def.name}"`)
      } catch {
        toast('Could not add template — try again')
      }
    },
    [navigate],
  )

  const updatePage = useCallback((id: string, patch: Partial<Page>, debounceTitle = false) => {
    setPages((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    if (debounceTitle && 'title' in patch) {
      const timers = titleTimers.current
      const prev = timers.get(id)
      if (prev) clearTimeout(prev)
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id)
          bb.dbUpdate('pages', id, patch).catch(() => {})
        }, 600),
      )
    } else {
      bb.dbUpdate('pages', id, patch).catch(() => {})
    }
  }, [])

  const subtreeIds = useCallback((rootId: string): string[] => {
    const out = [rootId]
    let i = 0
    while (i < out.length) {
      const cur = out[i++]
      pagesRef.current.filter((p) => p.parent_id === cur).forEach((c) => out.push(c.id))
    }
    return out
  }, [])

  // Remove a page (and a database page's records) from the search index.
  // Fire-and-forget — never blocks the page mutation.
  const unindexSubtree = useCallback((ids: string[]) => {
    void (async () => {
      for (const id of ids) {
        const page = pagesRef.current.find((p) => p.id === id)
        if (!page) continue
        try {
          await bb.unindex('pages', page)
          if (page.kind === 'database') {
            const recs = await bb.dbList<Rec>('db_records', {
              filter: { page_id: `eq.${id}` },
            })
            for (const r of recs) await bb.unindex('db_records', r)
          }
        } catch {
          /* fire-and-forget */
        }
      }
    })()
  }, [])

  // Index a single shared page (and a database's records) into team search.
  // Fire-and-forget — used when a page is flipped private → shared.
  const indexPageNow = useCallback((id: string) => {
    void (async () => {
      const page = pagesRef.current.find((p) => p.id === id)
      if (!page || page.visibility !== 'shared') return
      try {
        if (page.kind === 'database') {
          const [fields, records] = await Promise.all([
            bb.dbList<Field>('db_fields', { filter: { page_id: `eq.${id}` } }),
            bb.dbList<Rec>('db_records', { filter: { page_id: `eq.${id}` } }),
          ])
          for (const rec of records) await bb.indexRecord(rec, page, fields as any)
        } else {
          const blocks = await bb.dbList<Block>('blocks', {
            filter: { page_id: `eq.${id}` },
            order: 'sort_order.asc',
          })
          const text = blocks.map((b) => b.text || '').filter((t) => t.trim()).join('\n')
          await bb.indexPage(page, text)
        }
      } catch {
        /* fire-and-forget */
      }
    })()
  }, [])

  // Flip a page between the team workspace ('shared') and 'private'. Persists
  // the change and keeps the team search index honest: a page made private is
  // pulled out of the shared RAG index; a page made shared is indexed into it.
  const setPageVisibility = useCallback(
    (id: string, visibility: Page['visibility']) => {
      setPages((p) => p.map((x) => (x.id === id ? { ...x, visibility } : x)))
      bb.dbUpdate('pages', id, { visibility }).catch(() => {})
      if (visibility === 'private') unindexSubtree([id])
      else indexPageNow(id)
    },
    [unindexSubtree, indexPageNow],
  )

  // ---- backfill: re-index every workspace-shared page + record for the
  // team's ⌘K search. Private pages are deliberately excluded so private
  // content never surfaces in a teammate's search.
  const reindexBusy = useRef(false)
  const reindexWorkspace = useCallback(async () => {
    if (reindexBusy.current) return
    reindexBusy.current = true
    let count = 0
    try {
      const all = pagesRef.current.filter((p) => !p.archived && p.visibility === 'shared')
      toast(`Reindexing ${all.length} shared page${all.length === 1 ? '' : 's'}…`)
      for (const page of all) {
        if (page.kind === 'database') {
          const [fields, records] = await Promise.all([
            bb.dbList<Field>('db_fields', { filter: { page_id: `eq.${page.id}` } }),
            bb.dbList<Rec>('db_records', { filter: { page_id: `eq.${page.id}` } }),
          ])
          for (const rec of records) {
            await bb.indexRecord(rec, page, fields as any)
            count++
          }
        } else {
          const blocks = await bb.dbList<Block>('blocks', {
            filter: { page_id: `eq.${page.id}` },
            order: 'sort_order.asc',
          })
          const text = blocks
            .map((b) => b.text || '')
            .filter((t) => t.trim())
            .join('\n')
          await bb.indexPage(page, text)
          count++
        }
      }
      toast(`Reindexed ${count} item${count === 1 ? '' : 's'} for search`)
    } catch {
      toast('Reindex hit an error — some items may be missing')
    } finally {
      reindexBusy.current = false
    }
  }, [])

  const archivePage = useCallback(
    (id: string) => {
      const ids = subtreeIds(id)
      setPages((p) => p.map((x) => (ids.includes(x.id) ? { ...x, archived: true } : x)))
      ids.forEach((x) => bb.dbUpdate('pages', x, { archived: true }).catch(() => {}))
      unindexSubtree(ids)
      if (currentId && ids.includes(currentId)) {
        const next = pagesRef.current.find((p) => !p.archived && !ids.includes(p.id) && p.parent_id == null)
        navigate(next ? next.id : null)
      }
      toast('Moved to trash')
    },
    [subtreeIds, currentId, navigate, unindexSubtree],
  )

  const restorePage = useCallback((id: string) => {
    setPages((p) =>
      p.map((x) => {
        if (x.id !== id) return x
        const parent = pagesRef.current.find((q) => q.id === x.parent_id)
        const orphan = !parent || parent.archived
        return { ...x, archived: false, parent_id: orphan ? null : x.parent_id }
      }),
    )
    const x = pagesRef.current.find((q) => q.id === id)
    const parent = pagesRef.current.find((q) => q.id === x?.parent_id)
    const orphan = !parent || parent.archived
    bb.dbUpdate('pages', id, { archived: false, ...(orphan ? { parent_id: null } : {}) }).catch(() => {})
  }, [])

  const deleteForever = useCallback(
    (id: string) => {
      const ids = subtreeIds(id)
      unindexSubtree(ids)
      setPages((p) => p.filter((x) => !ids.includes(x.id)))
      ids.forEach((x) => bb.dbDelete('pages', x).catch(() => {}))
      toast('Deleted permanently')
    },
    [subtreeIds, unindexSubtree],
  )

  const current = pages.find((p) => p.id === currentId && !p.archived) || null
  // Resolve the share-dialog target against live state so its General-access
  // toggle always reflects the page's current visibility.
  const shareForLive = shareFor ? pages.find((p) => p.id === shareFor.id) || shareFor : null

  if (!loaded) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        user={user}
        myUserId={user.id}
        pages={pages}
        currentId={currentId}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onNavigate={navigate}
        onCreatePage={createPage}
        onArchive={archivePage}
        onRestore={restorePage}
        onDeleteForever={deleteForever}
        onOpenTemplates={() => setGallery(true)}
        onReindex={reindexWorkspace}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={async () => {
          await bb.logout()
          onLogout()
        }}
      />
      <div className="main">
        <TopBar
          collapsed={collapsed}
          onExpand={() => setCollapsed(false)}
          page={current}
          pages={pages}
          onNavigate={navigate}
          role={roleFor(current)}
          onShare={() => current && setShareFor(current)}
        >
          {/* Universal floating search bar — the front door to the office.
              Lives in the sticky topbar so it stays pinned top-center,
              always visible above the page content on every page. */}
          <Search pages={pages} onNavigate={navigate} focusSignal={searchFocus} />
        </TopBar>
        {current ? (
          <div className="page-scroll">
            <PageView
              key={current.id}
              page={current}
              readOnly={roleFor(current) === 'viewer'}
              onUpdatePage={updatePage}
              onNavigate={navigate}
              createSubPage={createSubPage}
            />
          </div>
        ) : (
          <div className="center-screen" style={{ flex: 1 }}>
            <div style={{ fontSize: 40 }}>🦋</div>
            <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>
              No page open. Start blank or from a template.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                style={{ width: 'auto', padding: '8px 18px' }}
                onClick={() => createPage(null)}
              >
                + New page
              </button>
              <button
                className="btn-primary"
                style={{ width: 'auto', padding: '8px 18px', background: '#f0eee9', color: 'var(--text)' }}
                onClick={() => setGallery(true)}
              >
                📋 Browse templates
              </button>
            </div>
          </div>
        )}
      </div>
      <Toaster />
      {gallery && <TemplateGallery onClose={() => setGallery(false)} onUse={useTemplate} />}
      {shareForLive && (
        <ShareDialog
          page={shareForLive}
          isOwner={(shareForLive.owner_id || '') === user.id}
          onClose={() => setShareFor(null)}
          onSetVisibility={(v) => setPageVisibility(shareForLive.id, v)}
        />
      )}
      {settingsOpen && <WorkspaceSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

// =============================================================== sidebar
// Notion-style page tree, split into three sections:
//   • Workspace — every 'shared' page (the office; visible to all teammates)
//   • Private   — the current user's own 'private' pages
//   • Shared    — 'private' pages owned by someone else, shared with me
function Sidebar({
  user, myUserId, pages, currentId, collapsed, onToggle, onNavigate, onCreatePage, onArchive, onRestore, onDeleteForever, onOpenTemplates, onReindex, onOpenSettings, onLogout,
}: {
  user: bb.User
  myUserId: string
  pages: Page[]
  currentId: string | null
  collapsed: boolean
  onToggle: () => void
  onNavigate: (id: string) => void
  onCreatePage: (parentId: string | null, kind?: 'doc' | 'database', visibility?: Page['visibility']) => void
  onArchive: (id: string) => void
  onRestore: (id: string) => void
  onDeleteForever: (id: string) => void
  onOpenTemplates: () => void
  onReindex: () => void
  onOpenSettings: () => void
  onLogout: () => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [userMenu, setUserMenu] = useState<DOMRect | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [newMenu, setNewMenu] = useState<{ rect: DOMRect; visibility: Page['visibility'] } | null>(null)
  // The Private section starts collapsed until the user has private pages.
  const [privateOpen, setPrivateOpen] = useState(true)

  const active = pages.filter((p) => !p.archived)
  // Workspace = every shared page. Private = my own private pages.
  // Shared-with-me = private pages owned by others (granted via `shares`).
  const workspacePages = active.filter((p) => p.visibility === 'shared')
  const privatePages = active.filter(
    (p) => p.visibility === 'private' && (p.owner_id || '') === myUserId,
  )
  const sharedWithMe = active.filter(
    (p) => p.visibility === 'private' && (p.owner_id || '') !== myUserId,
  )
  const archived = pages.filter((p) => p.archived && (p.owner_id || '') === myUserId)

  const sortByOrder = (a: Page, b: Page) => a.sort_order - b.sort_order
  const workspaceRoots = workspacePages.filter((p) => p.parent_id == null).sort(sortByOrder)
  const privateRoots = privatePages.filter((p) => p.parent_id == null).sort(sortByOrder)

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  // Tree-walk helper bound to one section's page set, so a section never
  // surfaces a page that belongs to a different section.
  const childrenIn = (set: Page[]) => (id: string) =>
    set.filter((p) => p.parent_id === id).sort(sortByOrder)
  const childrenOfWorkspace = childrenIn(workspacePages)
  const childrenOfPrivate = childrenIn(privatePages)

  const searchHits = search.trim()
    ? active.filter((p) => (p.title || 'Untitled').toLowerCase().includes(search.toLowerCase()))
    : null

  const initial = (user.display_name || user.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <div className="sb-top">
        <div className="sb-user" onClick={(e) => setUserMenu((e.currentTarget as HTMLElement).getBoundingClientRect())}>
          <div className="sb-avatar">{initial}</div>
          <div className="sb-user-name">{user.display_name || user.email}</div>
          <button className="sb-collapse" title="Collapse sidebar" onClick={(e) => { e.stopPropagation(); onToggle() }}>
            «
          </button>
        </div>
      </div>

      <div className="sb-search">
        <span>🔍</span>
        <input placeholder="Search pages…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="sb-scroll">
        {searchHits ? (
          <>
            <div className="sb-section-label">Results</div>
            {searchHits.length === 0 && <div className="tree-empty">No pages match</div>}
            {searchHits.map((p) => (
              <div
                key={p.id}
                className={'tree-row' + (p.id === currentId ? ' active' : '')}
                onClick={() => onNavigate(p.id)}
              >
                <span className="tree-twist" />
                <span className="tree-icon">{p.icon || '📄'}</span>
                <span className="tree-label">{p.title || 'Untitled'}</span>
                <VisibilityDot page={p} />
              </div>
            ))}
          </>
        ) : (
          <>
            {/* --- Workspace: the shared office, visible to every teammate --- */}
            <div className="sb-section-row">
              <div
                className="sb-section-label"
                title="Pages everyone at the office can see and edit"
                style={{ padding: '10px 0 4px' }}
              >
                🏢 Workspace
              </div>
              <button
                className="sb-section-gear"
                title="Workspace settings & members"
                onClick={onOpenSettings}
              >
                ⚙
              </button>
            </div>
            {workspaceRoots.length === 0 && <div className="tree-empty">No shared pages yet</div>}
            {workspaceRoots.map((p) => (
              <PageTreeItem
                key={p.id}
                page={p}
                depth={0}
                currentId={currentId}
                expanded={expanded}
                childrenOf={childrenOfWorkspace}
                onToggleExpand={toggle}
                onNavigate={onNavigate}
                onCreateChild={(id) => {
                  setExpanded((s) => new Set(s).add(id))
                  onCreatePage(id)
                }}
                onArchive={onArchive}
              />
            ))}
            <button
              className="sb-newpage"
              onClick={(e) =>
                setNewMenu({ rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), visibility: 'shared' })
              }
            >
              <span style={{ fontSize: 16 }}>＋</span> New page
            </button>
            <button className="sb-newpage" onClick={onOpenTemplates}>
              <span style={{ fontSize: 15 }}>📋</span> Templates
            </button>

            {/* --- Private: only the current user can see these --- */}
            <div
              className="sb-section-label"
              style={{ cursor: 'pointer' }}
              title="Pages only you can see, unless you invite someone"
              onClick={() => setPrivateOpen((o) => !o)}
            >
              🔒 Private {privateRoots.length > 0 ? `(${privateRoots.length})` : ''}{' '}
              {privateOpen ? '▾' : '▸'}
            </div>
            {privateOpen && (
              <>
                {privateRoots.length === 0 && (
                  <div className="tree-empty">No private pages</div>
                )}
                {privateRoots.map((p) => (
                  <PageTreeItem
                    key={p.id}
                    page={p}
                    depth={0}
                    currentId={currentId}
                    expanded={expanded}
                    childrenOf={childrenOfPrivate}
                    onToggleExpand={toggle}
                    onNavigate={onNavigate}
                    onCreateChild={(id) => {
                      setExpanded((s) => new Set(s).add(id))
                      onCreatePage(id)
                    }}
                    onArchive={onArchive}
                  />
                ))}
                <button
                  className="sb-newpage"
                  onClick={(e) =>
                    setNewMenu({ rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), visibility: 'private' })
                  }
                >
                  <span style={{ fontSize: 16 }}>＋</span> New private page
                </button>
              </>
            )}

            {/* --- Shared with me: private pages others invited me to --- */}
            {sharedWithMe.length > 0 && (
              <>
                <div
                  className="sb-section-label"
                  title="Private pages a teammate has shared with you"
                >
                  👤 Shared with me
                </div>
                {sharedWithMe.sort(sortByOrder).map((p) => (
                  <div
                    key={p.id}
                    className={'tree-row' + (p.id === currentId ? ' active' : '')}
                    style={{ paddingLeft: 4 }}
                    onClick={() => onNavigate(p.id)}
                  >
                    <span className="tree-twist" />
                    <span className="tree-icon">{p.icon || '📄'}</span>
                    <span className="tree-label">{p.title || 'Untitled'}</span>
                  </div>
                ))}
              </>
            )}

            <div className="sb-section-label" style={{ cursor: 'pointer' }} onClick={() => setTrashOpen((o) => !o)}>
              🗑 Trash {archived.length > 0 ? `(${archived.length})` : ''} {trashOpen ? '▾' : '▸'}
            </div>
            {trashOpen &&
              (archived.length === 0 ? (
                <div className="tree-empty">Trash is empty</div>
              ) : (
                archived.map((p) => (
                  <div key={p.id} className="tree-row">
                    <span className="tree-twist" />
                    <span className="tree-icon">{p.icon || '📄'}</span>
                    <span className="tree-label" style={{ opacity: 0.7 }}>{p.title || 'Untitled'}</span>
                    <span className="tree-actions">
                      <button className="tree-act" title="Restore" onClick={() => onRestore(p.id)}>
                        ↩
                      </button>
                      <button className="tree-act" title="Delete forever" onClick={() => onDeleteForever(p.id)}>
                        ✕
                      </button>
                    </span>
                  </div>
                ))
              ))}

            <button
              className="sb-reindex"
              title="Re-index every shared page and record for ⌘K search"
              onClick={onReindex}
            >
              <span style={{ fontSize: 14 }}>⟳</span> Reindex workspace
            </button>
          </>
        )}
      </div>

      {userMenu && (
        <Popover anchor={userMenu} onClose={() => setUserMenu(null)} width={230}>
          <div className="menu">
            <div className="menu-label">{user.email}</div>
            {user.email_verified === false && (
              <div className="tree-empty" style={{ color: '#b8860b' }}>Email not verified</div>
            )}
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                setUserMenu(null)
                onOpenSettings()
              }}
            >
              <span className="mi-ico">⚙</span> Workspace settings
            </button>
            <button className="menu-item" onClick={onLogout}>
              <span className="mi-ico">⏻</span> Log out
            </button>
          </div>
        </Popover>
      )}
      {newMenu && (
        <Popover anchor={newMenu.rect} onClose={() => setNewMenu(null)} width={210}>
          <div className="menu">
            <div className="menu-label">
              {newMenu.visibility === 'private' ? 'New private page' : 'New workspace page'}
            </div>
            <button className="menu-item" onClick={() => { onCreatePage(null, 'doc', newMenu.visibility); setNewMenu(null) }}>
              <span className="mi-ico">📄</span> Empty document
            </button>
            <button className="menu-item" onClick={() => { onCreatePage(null, 'database', newMenu.visibility); setNewMenu(null) }}>
              <span className="mi-ico">🗃️</span> Database
            </button>
            {newMenu.visibility === 'shared' && (
              <>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setNewMenu(null); onOpenTemplates() }}>
                  <span className="mi-ico">📋</span> From a template
                </button>
              </>
            )}
          </div>
        </Popover>
      )}
    </div>
  )
}

// A small globe/lock indicator shown on a sidebar row to mark its visibility.
function VisibilityDot({ page }: { page: Page }) {
  return page.visibility === 'private' ? (
    <span className="vis-dot" title="Private">🔒</span>
  ) : (
    <span className="vis-dot" title="Workspace — shared with the office">🌐</span>
  )
}

function PageTreeItem({
  page, depth, currentId, expanded, childrenOf, onToggleExpand, onNavigate, onCreateChild, onArchive,
}: {
  page: Page
  depth: number
  currentId: string | null
  expanded: Set<string>
  childrenOf: (id: string) => Page[]
  onToggleExpand: (id: string) => void
  onNavigate: (id: string) => void
  onCreateChild: (id: string) => void
  onArchive: (id: string) => void
}) {
  const [menu, setMenu] = useState<DOMRect | null>(null)
  const kids = childrenOf(page.id)
  const isOpen = expanded.has(page.id)

  return (
    <>
      <div
        className={'tree-row' + (page.id === currentId ? ' active' : '')}
        style={{ paddingLeft: 4 + depth * 16 }}
        onClick={() => onNavigate(page.id)}
      >
        <span
          className={'tree-twist' + (isOpen ? ' open' : '')}
          onClick={(e) => {
            e.stopPropagation()
            if (kids.length) onToggleExpand(page.id)
          }}
        >
          {kids.length ? '▶' : ''}
        </span>
        <span className="tree-icon">{page.icon || '📄'}</span>
        <span className="tree-label">{page.title || 'Untitled'}</span>
        {depth === 0 && <VisibilityDot page={page} />}
        <span className="tree-actions">
          <button
            className="tree-act"
            title="Add sub-page"
            onClick={(e) => {
              e.stopPropagation()
              onCreateChild(page.id)
            }}
          >
            ＋
          </button>
          <button
            className="tree-act"
            title="More"
            onClick={(e) => {
              e.stopPropagation()
              setMenu((e.currentTarget as HTMLElement).getBoundingClientRect())
            }}
          >
            ⋯
          </button>
        </span>
      </div>
      {isOpen &&
        kids.map((k) => (
          <PageTreeItem
            key={k.id}
            page={k}
            depth={depth + 1}
            currentId={currentId}
            expanded={expanded}
            childrenOf={childrenOf}
            onToggleExpand={onToggleExpand}
            onNavigate={onNavigate}
            onCreateChild={onCreateChild}
            onArchive={onArchive}
          />
        ))}
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} width={180}>
          <div className="menu">
            <button className="menu-item" onClick={() => { onCreateChild(page.id); setMenu(null) }}>
              <span className="mi-ico">＋</span> Add sub-page
            </button>
            <button className="menu-item danger" onClick={() => { onArchive(page.id); setMenu(null) }}>
              <span className="mi-ico">🗑</span> Move to trash
            </button>
          </div>
        </Popover>
      )}
    </>
  )
}

// =============================================================== top bar
// Hosts the breadcrumb trail, the Share controls, and — passed in as
// `children` — the universal floating search bar. The bar is rendered
// here (rather than free-floating) so it inherits the topbar's sticky
// positioning and stays pinned top-center as the page scrolls.
function TopBar({
  collapsed, onExpand, page, pages, onNavigate, role, onShare, children,
}: {
  collapsed: boolean
  onExpand: () => void
  page: Page | null
  pages: Page[]
  onNavigate: (id: string) => void
  role: PageRole
  onShare: () => void
  children?: React.ReactNode
}) {
  const chain: Page[] = []
  let cur = page
  const guard = new Set<string>()
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id)
    chain.unshift(cur)
    cur = pages.find((p) => p.id === cur!.parent_id) || null
  }

  return (
    <div className="topbar">
      {children}
      {collapsed && (
        <button className="topbar-btn" title="Expand sidebar" onClick={onExpand}>
          »
        </button>
      )}
      {chain.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && <span className="crumb-sep">/</span>}
          <div className="crumb" onClick={() => onNavigate(p.id)}>
            <span>{p.icon || '📄'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || 'Untitled'}</span>
          </div>
        </React.Fragment>
      ))}
      <div className="spacer" />
      {/* Workspace pages carry an "everyone at the office" pill; the Share
          button opens the General-access + people menu (Notion-style). */}
      {page && page.visibility === 'shared' && (
        <div className="shared-badge" title="Everyone at the office can edit this page">
          🌐 Workspace
        </div>
      )}
      {page && role === 'viewer' && (
        <div className="shared-badge view">👁 Shared · View only</div>
      )}
      {page && (role === 'owner' || role === 'editor') && (
        <button className="topbar-share" onClick={onShare}>
          👤 Share
        </button>
      )}
    </div>
  )
}

// =============================================================== page view
function PageView({
  page, readOnly, onUpdatePage, onNavigate, createSubPage,
}: {
  page: Page
  readOnly: boolean
  onUpdatePage: (id: string, patch: Partial<Page>, debounceTitle?: boolean) => void
  onNavigate: (id: string) => void
  createSubPage: (title: string, parentId: string) => Promise<{ id: string }>
}) {
  const [emoji, setEmoji] = useState<DOMRect | null>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = titleRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [page.title, page.id])

  return (
    <div className={'page' + (page.kind === 'database' ? ' wide' : '')}>
      {page.cover && (
        <div
          className="page-cover"
          style={
            page.cover.startsWith('linear-gradient')
              ? { backgroundImage: page.cover }
              : { backgroundImage: `url(${page.cover})` }
          }
        />
      )}

      <div
        className={'page-icon-lg' + (page.cover ? ' has-cover' : '')}
        onClick={(e) =>
          !readOnly && setEmoji((e.currentTarget as HTMLElement).getBoundingClientRect())
        }
        style={readOnly ? { cursor: 'default' } : undefined}
      >
        {page.icon || (page.kind === 'database' ? '🗃️' : '📄')}
      </div>

      {!readOnly && (
        <div className="page-controls">
          {!page.icon && (
            <button className="page-ctl" onClick={(e) => setEmoji((e.currentTarget as HTMLElement).getBoundingClientRect())}>
              😀 Add icon
            </button>
          )}
          {!page.cover && (
            <button
              className="page-ctl"
              onClick={() => onUpdatePage(page.id, { cover: randomCover() })}
            >
              🖼 Add cover
            </button>
          )}
          {page.cover && (
            <button className="page-ctl" onClick={() => onUpdatePage(page.id, { cover: null })}>
              ✕ Remove cover
            </button>
          )}
        </div>
      )}

      <textarea
        ref={titleRef}
        className="page-title"
        rows={1}
        placeholder="Untitled"
        value={page.title}
        readOnly={readOnly}
        onChange={(e) => onUpdatePage(page.id, { title: e.target.value }, true)}
      />

      {page.kind === 'database' ? (
        <Database
          pageId={page.id}
          pageTitle={page.title}
          pageVisibility={page.visibility}
          readOnly={readOnly}
          onOpenPage={onNavigate}
          createSubPage={createSubPage}
        />
      ) : (
        <Editor
          pageId={page.id}
          pageTitle={page.title}
          pageVisibility={page.visibility}
          pageRagDocId={page.rag_doc_id}
          readOnly={readOnly}
        />
      )}

      {emoji && (
        <EmojiPicker
          anchor={emoji}
          allowRemove
          onPick={(e) => onUpdatePage(page.id, { icon: e || null })}
          onClose={() => setEmoji(null)}
        />
      )}
    </div>
  )
}

function randomCover(): string {
  const covers = [
    'linear-gradient(120deg,#a8edea 0%,#fed6e3 100%)',
    'linear-gradient(120deg,#fbc2eb 0%,#a6c1ee 100%)',
    'linear-gradient(120deg,#fdcbf1 0%,#e6dee9 100%)',
    'linear-gradient(120deg,#ffecd2 0%,#fcb69f 100%)',
    'linear-gradient(120deg,#84fab0 0%,#8fd3f4 100%)',
    'linear-gradient(120deg,#d4fc79 0%,#96e6a1 100%)',
  ]
  const g = covers[Math.floor(Math.random() * covers.length)]
  // store the gradient as a data attribute trick: use it directly via backgroundImage
  return g
}

// =============================================================== seed
// Runs only when the whole office is empty (no shared pages exist yet). The
// seeded pages are 'shared' so every teammate sees them straight away.
async function seedWorkspace(): Promise<{ pages: Page[]; home: Page }> {
  const me = bb.currentUserId()
  const home: Page = {
    id: bb.uid(),
    owner_id: me,
    parent_id: null,
    title: 'Getting Started',
    icon: '🦋',
    kind: 'doc',
    cover: 'linear-gradient(120deg,#a8edea 0%,#fed6e3 100%)',
    sort_order: 1,
    archived: false,
    visibility: 'shared',
  }
  const tasks: Page = {
    id: bb.uid(),
    owner_id: me,
    parent_id: null,
    title: 'Tasks',
    icon: '🗃️',
    kind: 'database',
    cover: null,
    sort_order: 2,
    archived: false,
    visibility: 'shared',
  }
  await bb.dbCreate('pages', home)
  await bb.dbCreate('pages', tasks)

  const toggleId = bb.uid()
  const blocks = [
    { type: 'h1', text: 'Welcome to your team workspace 🦋', parent: null },
    { type: 'paragraph', text: 'A shared office for docs and databases — built on Butterbase. Everything in the Workspace section is visible to every teammate.', parent: null },
    { type: 'paragraph', text: '', parent: null },
    { type: 'h2', text: 'Things to try', parent: null },
    { type: 'todo', text: "Type  /  to open the block menu", parent: null },
    { type: 'todo', text: 'Markdown works: # heading, - bullet, [] to-do, > quote, --- divider', parent: null },
    { type: 'todo', text: 'Hover a block and drag the ⠿ handle to reorder', parent: null },
    { type: 'todo', text: 'Use the Share button to make a page private — or invite specific teammates', parent: null },
    { type: 'callout', text: 'Open the "Tasks" page in the sidebar for a database — switch between Table and Board views.', parent: null },
  ] as { type: string; text: string; parent: string | null }[]

  let so = 1
  for (const b of blocks) {
    await bb.dbCreate('blocks', {
      id: bb.uid(),
      page_id: home.id,
      parent_id: b.parent,
      type: b.type,
      text: b.text,
      checked: false,
      props: {},
      sort_order: so++,
    })
  }
  // a toggle with a nested child
  await bb.dbCreate('blocks', {
    id: toggleId,
    page_id: home.id,
    parent_id: null,
    type: 'toggle',
    text: 'Click the ▶ triangle to expand this toggle',
    checked: false,
    props: {},
    sort_order: so++,
  })
  await bb.dbCreate('blocks', {
    id: bb.uid(),
    page_id: home.id,
    parent_id: toggleId,
    type: 'paragraph',
    text: 'Hidden content lives inside a toggle. Everything here is saved to your Butterbase backend.',
    checked: false,
    props: {},
    sort_order: 1,
  })
  await bb.dbCreate('blocks', {
    id: bb.uid(),
    page_id: home.id,
    parent_id: null,
    type: 'quote',
    text: 'Make it yours.',
    checked: false,
    props: {},
    sort_order: so++,
  })

  return { pages: [home, tasks], home }
}
