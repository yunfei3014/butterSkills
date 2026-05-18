import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Block, BlockType, BLOCK_DEFS } from './model'
import { dbCreate, dbDelete, dbList, dbUpdate, indexPageDebounced, orderBetween, uid } from './bb'
import { EmojiPicker, Popover } from './ui'

// --------------------------------------------------------------- caret utils
function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.endContainer, range.endOffset)
  return pre.toString().length
}

function placeCaret(el: HTMLElement, offset: number) {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  let remaining = offset
  let placed = false
  const walk = (node: Node) => {
    if (placed) return
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0
      if (remaining <= len) {
        range.setStart(node, remaining)
        placed = true
      } else {
        remaining -= len
      }
    } else {
      node.childNodes.forEach(walk)
    }
  }
  walk(el)
  if (!placed) {
    range.selectNodeContents(el)
    range.collapse(false)
  } else {
    range.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

function isCollapsed(b: Block) {
  return !!b.props?.collapsed
}

// ------------------------------------------------------------------ Editor
interface EditorProps {
  pageId: string
  pageTitle?: string
  /** Page visibility — only 'shared' pages get indexed for team search. */
  pageVisibility?: string
  pageRagDocId?: string | null
  readOnly?: boolean
}

export default function Editor({
  pageId,
  pageTitle = '',
  pageVisibility = 'shared',
  pageRagDocId = null,
  readOnly = false,
}: EditorProps) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const blocksRef = useRef<Block[]>([])
  blocksRef.current = blocks

  // Stable page identity for the search index — keeps the latest title and
  // visibility (indexPage skips the ingest when the page is private).
  const indexPageRef = useRef({
    id: pageId,
    title: pageTitle,
    visibility: pageVisibility,
    rag_doc_id: pageRagDocId,
  })
  indexPageRef.current.id = pageId
  indexPageRef.current.title = pageTitle
  indexPageRef.current.visibility = pageVisibility

  // Live edited text, keyed by block id — keeps typing out of React state.
  const textCache = useRef<Map<string, string>>(new Map())
  const saveTimers = useRef<Map<string, number>>(new Map())
  const focusReq = useRef<{ id: string; offset: number } | null>(null)

  const [slash, setSlash] = useState<{ blockId: string; start: number; query: string; rect: DOMRect } | null>(null)
  const [slashSel, setSlashSel] = useState(0)
  const [emoji, setEmoji] = useState<{ blockId: string; rect: DOMRect } | null>(null)

  // ---- load
  useEffect(() => {
    let alive = true
    setLoading(true)
    dbList<Block>('blocks', { filter: { page_id: `eq.${pageId}` }, order: 'sort_order.asc' })
      .then(async (rows) => {
        if (!alive) return
        if (rows.length === 0 && !readOnly) {
          const first: Block = {
            id: uid(),
            page_id: pageId,
            parent_id: null,
            type: 'paragraph',
            text: '',
            checked: false,
            props: {},
            sort_order: orderBetween(),
          }
          await dbCreate('blocks', first)
          if (!alive) return
          rows = [first]
        }
        rows.forEach((r) => {
          if (!r.props) r.props = {}
          textCache.current.set(r.id, r.text || '')
        })
        setBlocks(rows)
        setLoading(false)
      })
      .catch(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [pageId])

  // ---- flush pending saves on unmount / page change
  useEffect(() => {
    return () => {
      saveTimers.current.forEach((t) => clearTimeout(t))
      saveTimers.current.clear()
      textCache.current.forEach((text, id) => {
        const b = blocksRef.current.find((x) => x.id === id)
        if (b && b.text !== text) dbUpdate('blocks', id, { text }).catch(() => {})
      })
    }
  }, [pageId])

  // Re-index the whole page for ⌘K search. Gathers the live text of every
  // block (textCache wins over committed text) and ships it debounced.
  // Fire-and-forget — completely separate from the contentEditable save path.
  const reindexPage = useCallback(() => {
    const text = blocksRef.current
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((b) => textCache.current.get(b.id) ?? b.text ?? '')
      .filter((t) => t.trim())
      .join('\n')
    indexPageDebounced(indexPageRef.current, text)
  }, [])

  const scheduleSave = useCallback(
    (id: string, text: string) => {
      const timers = saveTimers.current
      const existing = timers.get(id)
      if (existing) clearTimeout(existing)
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id)
          dbUpdate('blocks', id, { text }).catch(() => {})
        }, 650),
      )
      // Re-index the page alongside the save (debounced ~1.5s internally).
      reindexPage()
    },
    [reindexPage],
  )

  const flushSave = useCallback((id: string) => {
    const timers = saveTimers.current
    const t = timers.get(id)
    if (t) {
      clearTimeout(t)
      timers.delete(id)
    }
    const text = textCache.current.get(id)
    if (text != null) dbUpdate('blocks', id, { text }).catch(() => {})
  }, [])

  // ---- tree helpers
  const childrenOf = useCallback(
    (parentId: string | null) =>
      blocks.filter((b) => b.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order),
    [blocks],
  )

  // Depth-first list of currently visible blocks (collapsed toggles hide kids).
  const flatVisible = useMemo(() => {
    const out: Block[] = []
    const walk = (parentId: string | null) => {
      blocks
        .filter((b) => b.parent_id === parentId)
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((b) => {
          out.push(b)
          if (!(b.type === 'toggle' && isCollapsed(b))) walk(b.id)
        })
    }
    walk(null)
    return out
  }, [blocks])

  const numberMap = useMemo(() => {
    const map = new Map<string, number>()
    const groups = new Set<string | null>(blocks.map((b) => b.parent_id))
    groups.forEach((g) => {
      let n = 0
      blocks
        .filter((b) => b.parent_id === g)
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((b) => {
          if (b.type === 'numbered') {
            n += 1
            map.set(b.id, n)
          } else {
            n = 0
          }
        })
    })
    return map
  }, [blocks])

  // ---- focus after structural changes
  useLayoutEffect(() => {
    if (!focusReq.current) return
    const { id, offset } = focusReq.current
    focusReq.current = null
    const el = document.querySelector<HTMLElement>(`[data-block="${id}"]`)
    if (el) placeCaret(el, offset === Infinity ? el.innerText.length : offset)
  })

  // ---- mutations
  const patchBlock = useCallback((id: string, patch: Partial<Block>, persist = true) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    if ('text' in patch) textCache.current.set(id, patch.text as string)
    if (persist) dbUpdate('blocks', id, patch).catch(() => {})
  }, [])

  const descendants = useCallback((id: string, all: Block[]): Set<string> => {
    const set = new Set<string>()
    const walk = (pid: string) => {
      all
        .filter((b) => b.parent_id === pid)
        .forEach((c) => {
          set.add(c.id)
          walk(c.id)
        })
    }
    walk(id)
    return set
  }, [])

  // Create a new block after `afterId`, in the same parent group.
  const createAfter = useCallback(
    (afterId: string, type: BlockType, text: string): string => {
      const all = blocksRef.current
      const after = all.find((b) => b.id === afterId)!
      const sibs = all
        .filter((b) => b.parent_id === after.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order)
      const idx = sibs.findIndex((b) => b.id === afterId)
      const next = sibs[idx + 1]
      const nb: Block = {
        id: uid(),
        page_id: pageId,
        parent_id: after.parent_id,
        type,
        text,
        checked: false,
        props: {},
        sort_order: orderBetween(after.sort_order, next?.sort_order),
      }
      textCache.current.set(nb.id, text)
      setBlocks((prev) => [...prev, nb])
      dbCreate('blocks', nb).catch(() => {})
      reindexPage()
      return nb.id
    },
    [pageId, reindexPage],
  )

  const enter = useCallback(
    (id: string, leftText: string, rightText: string) => {
      const b = blocksRef.current.find((x) => x.id === id)!
      // Empty list item → exit the list instead of nesting another.
      const listy = ['bulleted', 'numbered', 'todo', 'toggle']
      if (listy.includes(b.type) && leftText.trim() === '' && rightText.trim() === '') {
        patchBlock(id, { type: 'paragraph' })
        focusReq.current = { id, offset: 0 }
        return
      }
      patchBlock(id, { text: leftText })
      flushSave(id)
      const continued: BlockType =
        b.type === 'bulleted' || b.type === 'numbered' || b.type === 'todo' ? b.type : 'paragraph'
      const newId = createAfter(id, continued, rightText)
      focusReq.current = { id: newId, offset: 0 }
    },
    [createAfter, patchBlock, flushSave],
  )

  // Backspace at the start of a block.
  const mergeBack = useCallback(
    (id: string) => {
      const b = blocksRef.current.find((x) => x.id === id)!
      // Non-paragraph → demote to paragraph first.
      if (b.type !== 'paragraph') {
        patchBlock(id, { type: 'paragraph' })
        focusReq.current = { id, offset: 0 }
        return
      }
      const visible = flatVisible
      const idx = visible.findIndex((x) => x.id === id)
      if (idx <= 0) return
      const prev = visible[idx - 1]
      if (prev.type === 'divider') {
        removeBlock(prev.id)
        focusReq.current = { id, offset: 0 }
        return
      }
      const prevText = textCache.current.get(prev.id) ?? prev.text
      const curText = textCache.current.get(id) ?? b.text
      const joinOffset = prevText.length
      patchBlock(prev.id, { text: prevText + curText })
      flushSave(prev.id)
      // Re-parent this block's children under prev.
      blocksRef.current
        .filter((c) => c.parent_id === id)
        .forEach((c) => patchBlock(c.id, { parent_id: prev.id }))
      removeBlock(id)
      focusReq.current = { id: prev.id, offset: joinOffset }
    },
    [flatVisible, patchBlock, flushSave],
  )

  const removeBlock = useCallback(
    (id: string) => {
      textCache.current.delete(id)
      setBlocks((prev) => prev.filter((b) => b.id !== id))
      dbDelete('blocks', id).catch(() => {})
      reindexPage()
    },
    [reindexPage],
  )

  const deleteBlock = useCallback(
    (id: string) => {
      const visible = flatVisible
      const idx = visible.findIndex((x) => x.id === id)
      const fallback = visible[idx - 1] || visible[idx + 1]
      // Detach children to top level so they are not lost.
      blocksRef.current
        .filter((c) => c.parent_id === id)
        .forEach((c) => patchBlock(c.id, { parent_id: blocksRef.current.find((x) => x.id === id)?.parent_id ?? null }))
      removeBlock(id)
      if (fallback) focusReq.current = { id: fallback.id, offset: Infinity }
    },
    [flatVisible, patchBlock, removeBlock],
  )

  const indent = useCallback(
    (id: string) => {
      const b = blocksRef.current.find((x) => x.id === id)!
      const sibs = blocksRef.current
        .filter((x) => x.parent_id === b.parent_id)
        .sort((a, c) => a.sort_order - c.sort_order)
      const idx = sibs.findIndex((x) => x.id === id)
      if (idx <= 0) return
      const newParent = sibs[idx - 1]
      const newSibs = blocksRef.current
        .filter((x) => x.parent_id === newParent.id)
        .sort((a, c) => a.sort_order - c.sort_order)
      const last = newSibs[newSibs.length - 1]
      patchBlock(id, { parent_id: newParent.id, sort_order: orderBetween(last?.sort_order) })
    },
    [patchBlock],
  )

  const outdent = useCallback(
    (id: string) => {
      const b = blocksRef.current.find((x) => x.id === id)!
      if (b.parent_id == null) return
      const parent = blocksRef.current.find((x) => x.id === b.parent_id)!
      const grandSibs = blocksRef.current
        .filter((x) => x.parent_id === parent.parent_id)
        .sort((a, c) => a.sort_order - c.sort_order)
      const pIdx = grandSibs.findIndex((x) => x.id === parent.id)
      patchBlock(id, {
        parent_id: parent.parent_id,
        sort_order: orderBetween(parent.sort_order, grandSibs[pIdx + 1]?.sort_order),
      })
    },
    [patchBlock],
  )

  // ---- slash menu
  const slashResults = useMemo(() => {
    if (!slash) return []
    const q = slash.query.toLowerCase().trim()
    if (!q) return BLOCK_DEFS
    return BLOCK_DEFS.filter((d) => (d.label + ' ' + d.keywords).toLowerCase().includes(q))
  }, [slash])

  useEffect(() => {
    setSlashSel(0)
  }, [slash?.query])

  const applySlash = useCallback(
    (type: BlockType) => {
      if (!slash) return
      const id = slash.blockId
      const text = textCache.current.get(id) ?? ''
      const cleaned = text.slice(0, slash.start) + text.slice(slash.start + 1 + slash.query.length)
      if (type === 'divider') {
        patchBlock(id, { text: cleaned, type: 'paragraph' })
        const dividerId = createAfter(id, 'divider', '')
        focusReq.current = { id, offset: slash.start }
        void dividerId
      } else {
        patchBlock(id, { text: cleaned, type })
        flushSave(id)
        focusReq.current = { id, offset: slash.start }
      }
      setSlash(null)
    },
    [slash, patchBlock, createAfter, flushSave],
  )

  // ---- drag reorder
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const activeId = e.active.id as string
      const overId = e.over?.id as string | undefined
      if (!overId || activeId === overId) return
      const all = blocksRef.current
      const moved = all.find((b) => b.id === activeId)
      const target = all.find((b) => b.id === overId)
      if (!moved || !target) return
      const desc = descendants(activeId, all)
      if (desc.has(overId)) return // can't drop into own subtree

      const visible = flatVisible
      const fromIdx = visible.findIndex((b) => b.id === activeId)
      const toIdx = visible.findIndex((b) => b.id === overId)
      const goingDown = fromIdx < toIdx
      const newParent = target.parent_id
      const sibs = all
        .filter((b) => b.parent_id === newParent && b.id !== activeId)
        .sort((a, b) => a.sort_order - b.sort_order)
      const ti = sibs.findIndex((s) => s.id === overId)
      let before: number | undefined
      let after: number | undefined
      if (goingDown) {
        before = sibs[ti]?.sort_order
        after = sibs[ti + 1]?.sort_order
      } else {
        before = sibs[ti - 1]?.sort_order
        after = sibs[ti]?.sort_order
      }
      patchBlock(activeId, { parent_id: newParent, sort_order: orderBetween(before, after) })
    },
    [flatVisible, descendants, patchBlock],
  )

  if (loading) {
    return (
      <div style={{ padding: '30px 4px', color: 'rgba(55,53,47,0.4)', fontSize: 14 }}>Loading…</div>
    )
  }

  const renderTree = (parentId: string | null): React.ReactNode => {
    return childrenOf(parentId).map((b) => {
      const kids =
        b.type === 'toggle' && isCollapsed(b) ? null : (
          <div className="block-children">{renderTree(b.id)}</div>
        )
      return (
        <BlockRow
          key={b.id}
          block={b}
          number={numberMap.get(b.id)}
          slashActive={slash?.blockId === b.id}
          readOnly={readOnly}
          api={{
            onInput: (text, caret, rect) => {
              textCache.current.set(b.id, text)
              scheduleSave(b.id, text)
              // markdown shortcuts (paragraph only, trigger at line start)
              const md = matchMarkdown(text)
              if (md && b.type === 'paragraph') {
                textCache.current.set(b.id, md.rest)
                patchBlock(b.id, { type: md.type, text: md.rest })
                if (md.type === 'divider') {
                  patchBlock(b.id, { type: 'paragraph', text: md.rest })
                  createAfter(b.id, 'divider', '')
                }
                focusReq.current = { id: b.id, offset: 0 }
                setSlash(null)
                return
              }
              // slash detection
              const sl = detectSlash(text, caret)
              if (sl) setSlash({ blockId: b.id, start: sl.start, query: sl.query, rect })
              else if (slash?.blockId === b.id) setSlash(null)
            },
            onEnter: (left, right) => {
              setSlash(null)
              enter(b.id, left, right)
            },
            onBackspaceAtStart: () => mergeBack(b.id),
            onDeleteEmpty: () => deleteBlock(b.id),
            onIndent: () => indent(b.id),
            onOutdent: () => outdent(b.id),
            onArrowUp: () => {
              const v = flatVisible
              const i = v.findIndex((x) => x.id === b.id)
              if (i > 0) focusReq.current = { id: v[i - 1].id, offset: Infinity }
            },
            onArrowDown: () => {
              const v = flatVisible
              const i = v.findIndex((x) => x.id === b.id)
              if (i < v.length - 1) focusReq.current = { id: v[i + 1].id, offset: 0 }
            },
            onSlashNav: (action) => {
              if (!slash) return
              if (action === 'close') setSlash(null)
              else if (action === 'up') setSlashSel((s) => Math.max(0, s - 1))
              else if (action === 'down')
                setSlashSel((s) => Math.min(slashResults.length - 1, s + 1))
              else if (action === 'pick') {
                const pick = slashResults[slashSel]
                if (pick) applySlash(pick.type)
                else setSlash(null)
              }
            },
            setChecked: (v) => patchBlock(b.id, { checked: v }),
            toggleCollapse: () => patchBlock(b.id, { props: { ...b.props, collapsed: !isCollapsed(b) } }),
            changeType: (t) => {
              patchBlock(b.id, { type: t })
              focusReq.current = { id: b.id, offset: Infinity }
            },
            deleteSelf: () => deleteBlock(b.id),
            openEmoji: (rect) => setEmoji({ blockId: b.id, rect }),
            blur: () => flushSave(b.id),
          }}
        >
          {kids}
        </BlockRow>
      )
    })
  }

  return (
    <div className="editor">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={flatVisible.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {renderTree(null)}
        </SortableContext>
      </DndContext>

      {slash && (
        <SlashMenu
          rect={slash.rect}
          results={slashResults}
          selected={slashSel}
          onPick={applySlash}
          onHover={setSlashSel}
          onClose={() => setSlash(null)}
        />
      )}
      {emoji && (
        <EmojiPicker
          anchor={emoji.rect}
          allowRemove
          onPick={(e) => {
            const b = blocksRef.current.find((x) => x.id === emoji.blockId)
            if (b) patchBlock(b.id, { props: { ...b.props, emoji: e || '💡' } })
          }}
          onClose={() => setEmoji(null)}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------- markdown / slash
function matchMarkdown(text: string): { type: BlockType; rest: string } | null {
  const rules: { re: RegExp; type: BlockType }[] = [
    { re: /^# $/, type: 'h1' },
    { re: /^## $/, type: 'h2' },
    { re: /^### $/, type: 'h3' },
    { re: /^[-*+] $/, type: 'bulleted' },
    { re: /^1\. $/, type: 'numbered' },
    { re: /^\[\]\s$/, type: 'todo' },
    { re: /^\[ \]\s$/, type: 'todo' },
    { re: /^> $/, type: 'quote' },
    { re: /^``` $/, type: 'code' },
    { re: /^--- $/, type: 'divider' },
    { re: /^\|\| $/, type: 'callout' },
  ]
  for (const r of rules) {
    if (r.re.test(text)) return { type: r.type, rest: '' }
  }
  return null
}

function detectSlash(text: string, caret: number): { start: number; query: string } | null {
  // Find a "/" before the caret that begins a slash command on this line.
  const upto = text.slice(0, caret)
  const slashIdx = upto.lastIndexOf('/')
  if (slashIdx === -1) return null
  const before = upto[slashIdx - 1]
  if (before !== undefined && before !== ' ' && before !== '\n') return null
  const query = upto.slice(slashIdx + 1)
  if (/\s/.test(query)) return null
  return { start: slashIdx, query }
}

// --------------------------------------------------------------- SlashMenu
function SlashMenu({
  rect,
  results,
  selected,
  onPick,
  onHover,
  onClose,
}: {
  rect: DOMRect
  results: typeof BLOCK_DEFS
  selected: number
  onPick: (t: BlockType) => void
  onHover: (i: number) => void
  onClose: () => void
}) {
  const selRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <Popover anchor={rect} onClose={onClose} width={300}>
      <div className="slash-menu">
        <div className="slash-head">Basic blocks</div>
        {results.length === 0 && <div className="slash-empty">No matching blocks</div>}
        {results.map((d, i) => (
          <div
            key={d.type}
            ref={i === selected ? selRef : undefined}
            className={'slash-item' + (i === selected ? ' sel' : '')}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(d.type)
            }}
          >
            <div className="slash-ico">{d.icon}</div>
            <div className="slash-text">
              <div className="slash-name">{d.label}</div>
              <div className="slash-desc">{d.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </Popover>
  )
}

// ---------------------------------------------------------------- BlockRow
interface BlockApi {
  onInput: (text: string, caret: number, rect: DOMRect) => void
  onEnter: (left: string, right: string) => void
  onBackspaceAtStart: () => void
  onDeleteEmpty: () => void
  onIndent: () => void
  onOutdent: () => void
  onArrowUp: () => void
  onArrowDown: () => void
  onSlashNav: (action: 'up' | 'down' | 'pick' | 'close') => void
  setChecked: (v: boolean) => void
  toggleCollapse: () => void
  changeType: (t: BlockType) => void
  deleteSelf: () => void
  openEmoji: (rect: DOMRect) => void
  blur: () => void
}

function BlockRow({
  block,
  number,
  slashActive,
  readOnly,
  api,
  children,
}: {
  block: Block
  number?: number
  slashActive: boolean
  readOnly: boolean
  api: BlockApi
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })
  const contentRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<DOMRect | null>(null)

  // Sync DOM text when the block's committed text changes externally.
  useEffect(() => {
    const el = contentRef.current
    if (el && el.innerText !== block.text) {
      el.innerText = block.text
      el.dataset.empty = block.text.trim() === '' ? 'true' : 'false'
    }
  }, [block.text, block.type])

  // Initial mount text.
  useEffect(() => {
    const el = contentRef.current
    if (el && el.innerText !== block.text) {
      el.innerText = block.text
      el.dataset.empty = block.text.trim() === '' ? 'true' : 'false'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const caretRect = (): DOMRect => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0).getBoundingClientRect()
      if (r.width || r.height || r.top) return r
    }
    return contentRef.current!.getBoundingClientRect()
  }

  const handleInput = () => {
    const el = contentRef.current!
    const text = el.innerText
    el.dataset.empty = text.trim() === '' ? 'true' : 'false'
    api.onInput(text, caretOffset(el), caretRect())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const el = contentRef.current!
    if (slashActive) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        api.onSlashNav('down')
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        api.onSlashNav('up')
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        api.onSlashNav('pick')
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        api.onSlashNav('close')
        return
      }
    }
    const off = caretOffset(el)
    const text = el.innerText
    const atStart = off === 0
    const atEnd = off >= text.length

    if (e.key === 'Enter' && !e.shiftKey) {
      if (block.type === 'code') {
        e.preventDefault()
        document.execCommand('insertText', false, '\n')
        handleInput()
        return
      }
      e.preventDefault()
      api.blur()
      api.onEnter(text.slice(0, off), text.slice(off))
      return
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertText', false, '\n')
      handleInput()
      return
    }
    if (e.key === 'Backspace' && atStart && !window.getSelection()?.toString()) {
      if (text === '' && block.type === 'paragraph') {
        e.preventDefault()
        api.onDeleteEmpty()
        return
      }
      e.preventDefault()
      api.onBackspaceAtStart()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (block.type === 'code') {
        document.execCommand('insertText', false, '  ')
        handleInput()
      } else if (e.shiftKey) {
        api.blur()
        api.onOutdent()
      } else {
        api.blur()
        api.onIndent()
      }
      return
    }
    if (e.key === 'ArrowUp' && atStart) {
      e.preventDefault()
      api.onArrowUp()
      return
    }
    if (e.key === 'ArrowDown' && atEnd) {
      e.preventDefault()
      api.onArrowDown()
      return
    }
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isDivider = block.type === 'divider'
  const typeClass = `bk-${block.type}`

  const editable = !isDivider && (
    <div
      ref={contentRef}
      className="block-content"
      data-block={block.id}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={!readOnly}
      data-placeholder={readOnly ? '' : placeholderFor(block.type)}
      onInput={readOnly ? undefined : handleInput}
      onKeyDown={readOnly ? undefined : handleKeyDown}
      onBlur={readOnly ? undefined : api.blur}
    />
  )

  let marker: React.ReactNode = null
  if (block.type === 'bulleted') marker = <div className="bk-marker bk-bullet">•</div>
  else if (block.type === 'numbered')
    marker = <div className="bk-marker bk-number">{number ?? 1}.</div>
  else if (block.type === 'todo')
    marker = (
      <div className="bk-marker bk-checkbox">
        <input
          type="checkbox"
          checked={block.checked}
          disabled={readOnly}
          onChange={(e) => api.setChecked(e.target.checked)}
        />
      </div>
    )
  else if (block.type === 'toggle')
    marker = (
      <div
        className={'bk-toggle-twist' + (!block.props?.collapsed ? ' open' : '')}
        onClick={api.toggleCollapse}
      >
        ▶
      </div>
    )
  else if (block.type === 'callout')
    marker = (
      <div
        className="callout-emoji"
        onClick={(e) => api.openEmoji((e.currentTarget as HTMLElement).getBoundingClientRect())}
      >
        {block.props?.emoji || '💡'}
      </div>
    )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        'block-row ' + typeClass + (isDragging ? ' dragging' : '') + (block.checked ? ' checked' : '')
      }
    >
      <div className="block-main">
        {!readOnly && (
          <div className="block-gutter">
            <button
              className="gutter-btn"
              title="Add block below"
              onMouseDown={(e) => {
                e.preventDefault()
                api.blur()
                api.onEnter(textOf(contentRef), '')
              }}
            >
              +
            </button>
            <button
              className="gutter-btn gutter-handle"
              title="Drag to move • click for actions"
              {...attributes}
              {...listeners}
              onClick={(e) => setMenu((e.currentTarget as HTMLElement).getBoundingClientRect())}
            >
              ⠿
            </button>
          </div>
        )}

        {marker}

        {isDivider ? (
          <div style={{ flex: 1 }}>
            <hr />
          </div>
        ) : (
          editable
        )}
      </div>

      {children}

      {menu && (
        <BlockMenu
          rect={menu}
          current={block.type}
          onClose={() => setMenu(null)}
          onType={(t) => {
            api.changeType(t)
            setMenu(null)
          }}
          onDelete={() => {
            api.deleteSelf()
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}

function textOf(ref: React.RefObject<HTMLDivElement>): string {
  return ref.current?.innerText ?? ''
}

function placeholderFor(type: BlockType): string {
  switch (type) {
    case 'h1':
      return 'Heading 1'
    case 'h2':
      return 'Heading 2'
    case 'h3':
      return 'Heading 3'
    case 'todo':
      return 'To-do'
    case 'bulleted':
    case 'numbered':
      return 'List'
    case 'toggle':
      return 'Toggle'
    case 'quote':
      return 'Empty quote'
    case 'callout':
      return 'Callout'
    case 'code':
      return 'Code'
    default:
      return "Write something, or press '/' for commands"
  }
}

function BlockMenu({
  rect,
  current,
  onClose,
  onType,
  onDelete,
}: {
  rect: DOMRect
  current: BlockType
  onClose: () => void
  onType: (t: BlockType) => void
  onDelete: () => void
}) {
  return (
    <Popover anchor={rect} onClose={onClose} width={200}>
      <div className="menu">
        <button className="menu-item danger" onClick={onDelete}>
          <span className="mi-ico">🗑</span> Delete block
        </button>
        <div className="menu-sep" />
        <div className="menu-label">Turn into</div>
        {BLOCK_DEFS.map((d) => (
          <button
            key={d.type}
            className="menu-item"
            onClick={() => onType(d.type)}
            style={{ fontWeight: d.type === current ? 600 : 400 }}
          >
            <span className="mi-ico">{d.icon}</span>
            {d.label}
          </button>
        ))}
      </div>
    </Popover>
  )
}
