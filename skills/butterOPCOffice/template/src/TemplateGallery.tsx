import React, { useState } from 'react'
import { TEMPLATES, TemplateDef } from './templates'
import { useDismiss } from './ui'

export default function TemplateGallery({
  onClose,
  onUse,
}: {
  onClose: () => void
  onUse: (def: TemplateDef) => Promise<void>
}) {
  const ref = useDismiss<HTMLDivElement>(onClose)
  const [busy, setBusy] = useState<string | null>(null)

  const use = async (def: TemplateDef) => {
    if (busy) return
    setBusy(def.key)
    try {
      await onUse(def)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="tpl-modal" ref={ref}>
        <div className="tpl-modal-head">
          <div>
            <div className="tpl-modal-title">📋 Templates</div>
            <div className="tpl-modal-sub">
              Pre-built workspaces for the one-person company. Pick one — it drops straight into your sidebar.
            </div>
          </div>
          <button className="tpl-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="tpl-grid">
          {TEMPLATES.map((def) => (
            <div key={def.key} className="tpl-card">
              <div className="tpl-card-icon">{def.icon}</div>
              <div className="tpl-card-name">{def.name}</div>
              <div className="tpl-card-tag">{def.tagline}</div>
              <ul className="tpl-card-inside">
                {def.inside.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <button className="tpl-use" disabled={!!busy} onClick={() => use(def)}>
                {busy === def.key ? 'Adding…' : 'Use template'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
