import React, { useEffect, useState } from 'react'
import { Page, Role, Share, Visibility } from './model'
import { currentUserId, dbCreate, dbDelete, dbList, dbUpdate, getUser, uid } from './bb'
import { toast, useDismiss } from './ui'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Notion-style share menu for a page.
 *
 *  ┌ General access ─────────────────────────────────────────┐
 *  │  🌐 Everyone at the office  · Can edit                   │  ← visibility
 *  │  🔒 Private                 · Only people invited        │
 *  └──────────────────────────────────────────────────────────┘
 *  People with access
 *    • <owner> (you) ……………………………………………… Owner
 *    • teammate@example.com ……… [Can edit ▾] [✕]
 *    [ invite by email … ] [Can edit ▾] [Invite]
 *  ─────────────────────────────────────────────────────────────
 *  🔗 Copy page link
 *
 * `visibility='shared'` means the page lives in the team workspace and every
 * teammate can edit it. `visibility='private'` restricts it to the owner plus
 * whoever appears in the `shares` list. Only the page owner can change General
 * access or the people list — non-owner editors see everything read-only.
 */
export default function ShareDialog({
  page,
  isOwner,
  onClose,
  onSetVisibility,
}: {
  page: Page
  isOwner: boolean
  onClose: () => void
  onSetVisibility: (v: Visibility) => void
}) {
  const ref = useDismiss<HTMLDivElement>(onClose)
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [busy, setBusy] = useState(false)
  const me = getUser()

  const load = () => {
    dbList<Share>('shares', { filter: { page_id: `eq.${page.id}` }, order: 'created_at.asc' })
      .then((s) => {
        setShares(s)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }
  useEffect(load, [page.id])

  const invite = async () => {
    const addr = email.trim().toLowerCase()
    if (!EMAIL_RE.test(addr)) {
      toast('Enter a valid email address')
      return
    }
    if (addr === me?.email?.toLowerCase()) {
      toast("That's your own account")
      return
    }
    const existing = shares.find((s) => s.invitee_email.toLowerCase() === addr)
    setBusy(true)
    try {
      if (existing) {
        await dbUpdate('shares', existing.id, { role })
      } else {
        await dbCreate('shares', {
          id: uid(),
          owner_id: currentUserId(),
          page_id: page.id,
          invitee_email: addr,
          invitee_id: null,
          role,
        })
      }
      setEmail('')
      load()
      toast(existing ? 'Access updated' : `Invited ${addr}`)
    } catch {
      toast('Could not invite — try again')
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (s: Share, r: Role) => {
    setShares((p) => p.map((x) => (x.id === s.id ? { ...x, role: r } : x)))
    await dbUpdate('shares', s.id, { role: r }).catch(() => {})
  }

  const revoke = async (s: Share) => {
    setShares((p) => p.filter((x) => x.id !== s.id))
    await dbDelete('shares', s.id).catch(() => {})
    toast('Access removed')
  }

  const copyLink = () => {
    const url = `${location.origin}/#/p/${page.id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => toast('Link copied to clipboard'),
        () => toast(url),
      )
    } else {
      toast(url)
    }
  }

  const isShared = page.visibility === 'shared'

  return (
    <div className="modal-overlay">
      <div className="share-modal" ref={ref}>
        <div className="share-head">
          <div>
            <div className="share-title">Share</div>
            <div className="share-sub">
              {page.icon || '📄'} {page.title || 'Untitled'}
            </div>
          </div>
          <button className="tpl-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {/* ---- General access — the workspace / private toggle ---- */}
        <div className="share-section-label">General access</div>
        <div className="share-access">
          <button
            type="button"
            className={'share-access-opt' + (isShared ? ' active' : '')}
            disabled={!isOwner}
            onClick={() => isOwner && !isShared && onSetVisibility('shared')}
          >
            <span className="share-access-ico">🌐</span>
            <span className="share-access-text">
              <span className="share-access-title">Everyone at the office</span>
              <span className="share-access-desc">Anyone signed in to the workspace can edit</span>
            </span>
            {isShared && <span className="share-access-check">✓</span>}
          </button>
          <button
            type="button"
            className={'share-access-opt' + (!isShared ? ' active' : '')}
            disabled={!isOwner}
            onClick={() => isOwner && isShared && onSetVisibility('private')}
          >
            <span className="share-access-ico">🔒</span>
            <span className="share-access-text">
              <span className="share-access-title">Private</span>
              <span className="share-access-desc">Only you and people invited below</span>
            </span>
            {!isShared && <span className="share-access-check">✓</span>}
          </button>
        </div>
        {!isOwner && (
          <div className="share-foot-note" style={{ padding: '0 2px 4px' }}>
            Only the page owner can change general access.
          </div>
        )}

        {/* ---- People with access ---- */}
        <div className="share-section-label">People with access</div>

        {isOwner && (
          <div className="share-invite">
            <input
              className="share-email"
              placeholder="Invite a teammate by email…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && invite()}
            />
            <select
              className="share-role-sel"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="share-invite-btn" disabled={busy} onClick={invite}>
              {busy ? '…' : 'Invite'}
            </button>
          </div>
        )}

        <div className="share-list">
          <div className="share-row">
            <div className="share-avatar">
              {(me?.display_name || me?.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="share-person">
              <div className="share-name">
                {me?.display_name || me?.email}
                {isOwner ? ' (you)' : ''}
              </div>
              <div className="share-email-sm">{me?.email}</div>
            </div>
            <div className="share-role-label">{isOwner ? 'Owner' : 'Can edit'}</div>
          </div>

          {isShared && (
            <div className="share-row">
              <div className="share-avatar workspace">🌐</div>
              <div className="share-person">
                <div className="share-name">Everyone at the office</div>
                <div className="share-email-sm">All signed-in teammates</div>
              </div>
              <div className="share-role-label">Can edit</div>
            </div>
          )}

          {loading && <div className="share-empty">Loading…</div>}
          {!loading && shares.length === 0 && !isShared && (
            <div className="share-empty">No one else has access — invite a teammate above.</div>
          )}
          {shares.map((s) => (
            <div key={s.id} className="share-row">
              <div className="share-avatar pending">{s.invitee_email.charAt(0).toUpperCase()}</div>
              <div className="share-person">
                <div className="share-name">{s.invitee_email}</div>
                <div className="share-email-sm">
                  {s.invitee_id ? 'Has access' : 'Invite pending — access granted on sign-in'}
                </div>
              </div>
              {isOwner ? (
                <>
                  <select
                    className="share-role-sel sm"
                    value={s.role}
                    onChange={(e) => changeRole(s, e.target.value as Role)}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button className="share-remove" title="Remove access" onClick={() => revoke(s)}>
                    ✕
                  </button>
                </>
              ) : (
                <div className="share-role-label">{s.role === 'editor' ? 'Can edit' : 'Can view'}</div>
              )}
            </div>
          ))}
        </div>

        <div className="share-foot">
          <button className="share-copy" onClick={copyLink}>
            🔗 Copy page link
          </button>
          <div className="share-foot-note">
            {isShared
              ? 'This page is in the team workspace — every teammate can open it.'
              : 'Invited people open the link after signing in.'}
          </div>
        </div>
      </div>
    </div>
  )
}
