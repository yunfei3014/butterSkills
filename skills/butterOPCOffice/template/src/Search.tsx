import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as bb from './bb'
import { Page } from './model'

// Universal floating search bar — the front door to the team office.
// A persistent pill anchored at the top-center of the workspace, always
// visible above the page content. Focus it (click or ⌘K / Ctrl+K) and
// type to run a debounced semantic search over the office's shared pages
// and database records, backed by the Butterbase `butterpages` RAG
// collection via bb.ragQuery. Results render in a dropdown directly below.

interface SearchProps {
  pages: Page[]
  onNavigate: (id: string) => void
  // App raises this when ⌘K is pressed so the bar can grab focus.
  focusSignal: number
}

interface ResultItem {
  pageId: string
  pageTitle: string
  icon: string
  snippet: string
  score: number
  kind: string
  recordId?: string
}

export default function Search({ pages, onNavigate, focusSignal }: SearchProps) {
  const [query, setQuery] = useState('')
  const [ask, setAsk] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ResultItem[]>([])
  const [answer, setAnswer] = useState<string>('')
  const [searched, setSearched] = useState(false)
  const [open, setOpen] = useState(false) // is the dropdown showing
  const [focused, setFocused] = useState(false) // is the input focused
  const [sel, setSel] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number | undefined>(undefined)
  const reqIdRef = useRef(0)

  // Resolve a page id to its title + icon for display. Falls back to the
  // title carried in the RAG metadata if the page isn't in local state
  // (e.g. a teammate's shared page not yet loaded into this session).
  const pageMeta = useCallback(
    (pageId: string, fallbackTitle?: string): { title: string; icon: string } => {
      const p = pages.find((x) => x.id === pageId)
      if (p) return { title: p.title || 'Untitled', icon: p.icon || (p.kind === 'database' ? '🗃️' : '📄') }
      return { title: fallbackTitle || 'Untitled', icon: '📄' }
    },
    [pages],
  )

  // ⌘K from App → focus + select the bar (toggles closed if already focused).
  useEffect(() => {
    if (focusSignal === 0) return
    const el = inputRef.current
    if (!el) return
    if (document.activeElement === el) {
      el.blur()
      setOpen(false)
    } else {
      el.focus()
      el.select()
    }
  }, [focusSignal])

  // Click-away collapses the dropdown (the bar itself stays visible).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Debounced (~250ms) semantic search across the whole office.
  const runSearch = useCallback(
    (q: string, doAsk: boolean) => {
      window.clearTimeout(debounceRef.current)
      const trimmed = q.trim()
      if (!trimmed) {
        setResults([])
        setAnswer('')
        setSearched(false)
        setLoading(false)
        return
      }
      setLoading(true)
      debounceRef.current = window.setTimeout(async () => {
        const reqId = ++reqIdRef.current
        // top_k 8 — fetch a healthy pool, trust the score ordering, show ~6.
        const res = await bb.ragQuery(trimmed, { topK: 8, synthesize: doAsk })
        if (reqId !== reqIdRef.current) return // a newer request superseded this one
        // Dedupe by record_id / page_id, keeping the highest score — stale
        // RAG duplicates (deletes are best-effort) collapse to one row.
        const byKey = new Map<string, ResultItem>()
        for (const c of res.chunks) {
          const m = c.metadata || {}
          const pageId: string = m.page_id || ''
          if (!pageId) continue
          const key = m.record_id ? `r:${m.record_id}` : `p:${pageId}`
          const meta = pageMeta(pageId, m.page_title)
          const item: ResultItem = {
            pageId,
            pageTitle: meta.title,
            icon: meta.icon,
            snippet: c.text || '',
            score: c.score,
            kind: m.kind || 'doc',
            recordId: m.record_id,
          }
          const existing = byKey.get(key)
          if (!existing || item.score > existing.score) byKey.set(key, item)
        }
        const list = Array.from(byKey.values()).sort((a, b) => b.score - a.score)
        setResults(list)
        setAnswer(res.answer || '')
        setSearched(true)
        setSel(0)
        setLoading(false)
      }, 250)
    },
    [pageMeta],
  )

  useEffect(() => {
    runSearch(query, ask)
    return () => window.clearTimeout(debounceRef.current)
  }, [query, ask, runSearch])

  // Show only the cleanest top slice — the pool is 8, the panel shows 6.
  const shown = useMemo(() => results.slice(0, 6), [results])

  const goto = useCallback(
    (item: ResultItem) => {
      onNavigate(item.pageId)
      setOpen(false)
      inputRef.current?.blur()
    },
    [onNavigate],
  )

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(shown.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = shown[sel]
      if (item) goto(item)
    }
  }

  const q = query.trim()
  // The dropdown is visible whenever the bar is open AND there is something
  // worth showing: an active query, or the focused-empty hint.
  const showDropdown = open && (q.length > 0 || focused)

  return (
    <div className="usearch" ref={wrapRef}>
      <div className={'usearch-bar' + (focused ? ' focused' : '')}>
        <span className="usearch-ico">🔍</span>
        <input
          ref={inputRef}
          className="usearch-input"
          placeholder="What are you looking for?"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setFocused(true)
            setOpen(true)
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onInputKeyDown}
        />
        <button
          type="button"
          className={'usearch-ask' + (ask ? ' on' : '')}
          title={ask ? 'AI answer on — click to turn off' : 'Ask — get an AI answer above the results'}
          onMouseDown={(e) => {
            // Keep focus on the input so the dropdown doesn't blur away.
            e.preventDefault()
            setAsk((a) => !a)
            setOpen(true)
          }}
        >
          ✨ Ask
        </button>
        {q.length > 0 && (
          <button
            type="button"
            className="usearch-clear"
            title="Clear"
            onMouseDown={(e) => {
              e.preventDefault()
              setQuery('')
              setOpen(true)
              inputRef.current?.focus()
            }}
          >
            ✕
          </button>
        )}
        <kbd className="usearch-kbd">⌘K</kbd>
      </div>

      {showDropdown && (
        <div className="usearch-panel">
          {/* focused + empty → a brief hint about what's searchable */}
          {q.length === 0 && (
            <div className="usearch-hint">
              Search people, companies, notes across the office.
            </div>
          )}

          {/* AI answer (Ask mode) sits above the result list */}
          {q.length > 0 && ask && answer && (
            <div className="usearch-answer">
              <div className="usearch-answer-label">✨ Answer</div>
              <div className="usearch-answer-body">{answer}</div>
            </div>
          )}

          {/* typing / loading */}
          {q.length > 0 && loading && (
            <div className="usearch-status">
              <span className="usearch-spinner" />
              Searching the office…
            </div>
          )}

          {/* no results */}
          {q.length > 0 && !loading && searched && shown.length === 0 && (
            <div className="usearch-empty">No matches — try different words.</div>
          )}

          {/* ranked results */}
          {q.length > 0 &&
            shown.map((r, i) => (
              <div
                key={(r.recordId || r.pageId) + ':' + i}
                className={'usearch-result' + (i === sel ? ' sel' : '')}
                onMouseEnter={() => setSel(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  goto(r)
                }}
              >
                <span className="usearch-result-ico">{r.icon}</span>
                <div className="usearch-result-body">
                  <div className="usearch-result-title">
                    {r.pageTitle}
                    {r.kind === 'record' && <span className="usearch-result-tag">record</span>}
                  </div>
                  <div className="usearch-result-snippet">{r.snippet}</div>
                </div>
                <span
                  className="usearch-relevance"
                  title={`Relevance ${Math.round(r.score * 100)}%`}
                  aria-hidden="true"
                >
                  <span
                    className="usearch-relevance-fill"
                    style={{ width: Math.round(Math.max(0.08, Math.min(1, r.score)) * 100) + '%' }}
                  />
                </span>
              </div>
            ))}

          {/* footer keyboard hint, shown once there's a result list */}
          {q.length > 0 && shown.length > 0 && (
            <div className="usearch-foot">
              <span className="kbd">↑</span> <span className="kbd">↓</span> navigate ·{' '}
              <span className="kbd">↵</span> open · <span className="kbd">Esc</span> close
            </div>
          )}
        </div>
      )}
    </div>
  )
}
