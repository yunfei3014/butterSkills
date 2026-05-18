import React from 'react'
import { ALLOWED_EMAIL_DOMAINS } from './bb'
import { toast, useDismiss } from './ui'

// The canonical URL teammates use to reach the office — derived from wherever
// this office is deployed. Anyone with an allow-listed email who opens it and
// signs in is in instantly.
const OFFICE_URL = window.location.origin
const OFFICE_NAME = 'Office'

/**
 * Workspace Settings — the team "office" settings panel, Notion-style
 * ("Settings & members"). A pure-frontend informational modal: it explains the
 * membership model, hands out the one invite link, and shows the access rules.
 *
 *  ┌ 🏢 Office ──────────────────────────────────────────────────┐
 *  │  Invite teammates                                          │
 *  │    explanation of the email-domain membership model        │
 *  │    [ <office URL> ]  [ Copy invite link ]                  │
 *  │  Access                                                    │
 *  │    your team's allow-listed email domains                  │
 *  │  How sharing works                                         │
 *  │    shared = whole office edits · Private = restricted      │
 *  └────────────────────────────────────────────────────────────┘
 *
 * No backend, no tables, no functions — membership is enforced by the email
 * domain gate (see bb.isAllowedEmail) and team-wide RLS on shared pages.
 */
export default function WorkspaceSettings({ onClose }: { onClose: () => void }) {
  const ref = useDismiss<HTMLDivElement>(onClose)

  const copyInviteLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(OFFICE_URL).then(
        () => toast('Invite link copied to clipboard'),
        () => toast(OFFICE_URL),
      )
    } else {
      toast(OFFICE_URL)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="ws-modal" ref={ref}>
        <div className="ws-head">
          <div className="ws-head-main">
            <div className="ws-head-icon">🏢</div>
            <div>
              <div className="ws-title">{OFFICE_NAME}</div>
              <div className="ws-sub">Workspace settings &amp; members</div>
            </div>
          </div>
          <button className="tpl-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="ws-body">
          {/* ---- Invite teammates — the key section ---- */}
          <div className="ws-section-label">Invite teammates</div>
          <p className="ws-text">
            Anyone with an allow-listed team email (see Access below) is a member of this
            office. To invite a teammate: send them the link below — they sign in with their
            Google account and they're in instantly, with edit access to every shared page. No
            per-page invites needed.
          </p>
          <div className="ws-invite">
            <input
              className="ws-invite-url"
              type="text"
              readOnly
              value={OFFICE_URL}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Office invite link"
            />
            <button className="ws-invite-btn" onClick={copyInviteLink}>
              🔗 Copy invite link
            </button>
          </div>

          {/* ---- Access — the two allowed domains ---- */}
          <div className="ws-section-label">Access</div>
          <p className="ws-text">These email domains can sign in to the office:</p>
          <div className="ws-domains">
            {ALLOWED_EMAIL_DOMAINS.map((d) => (
              <span key={d} className="ws-domain-chip">
                @{d}
              </span>
            ))}
          </div>
          <p className="ws-note">Sign-ins outside these domains are blocked.</p>

          {/* ---- How sharing works ---- */}
          <div className="ws-section-label">How sharing works</div>
          <p className="ws-text">
            Shared pages live in the <strong>Workspace</strong> section — the whole office can
            view and edit them. Mark a page <strong>Private</strong> from its Share dialog to
            restrict it to yourself plus the specific people you invite.
          </p>
        </div>

        <div className="ws-foot">
          <button className="ws-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
