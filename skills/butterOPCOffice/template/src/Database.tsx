import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  Field,
  FieldType,
  FIELD_TYPE_META,
  Rec,
  SELECT_COLORS,
  SelectOption,
  View,
  ViewType,
  colorDef,
} from './model'
import {
  dbCreate,
  dbDelete,
  dbList,
  dbUpdate,
  indexRecord,
  indexRecordDebounced,
  orderBetween,
  uid,
  unindex,
} from './bb'
import { Popover, toast } from './ui'

interface DatabaseProps {
  pageId: string
  pageTitle: string
  /** Page visibility — only 'shared' pages get indexed for team search. */
  pageVisibility?: string
  readOnly?: boolean
  onOpenPage: (id: string) => void
  createSubPage: (title: string, parentId: string) => Promise<{ id: string }>
}

export default function Database({
  pageId,
  pageTitle,
  pageVisibility = 'shared',
  readOnly = false,
  onOpenPage,
  createSubPage,
}: DatabaseProps) {
  const [fields, setFields] = useState<Field[]>([])
  const [records, setRecords] = useState<Rec[]>([])
  const [views, setViews] = useState<View[]>([])
  const [activeView, setActiveView] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const seeded = useRef(false)

  // Refs so the fire-and-forget search-index calls always see current state
  // without forcing the record callbacks to re-create on every edit.
  const fieldsRef = useRef<Field[]>([])
  fieldsRef.current = fields
  const recordsRef = useRef<Rec[]>([])
  recordsRef.current = records
  // The page identity passed to indexRecord — keeps the latest title and
  // visibility (indexRecord skips the ingest when the page is private).
  const indexPageRef = useRef({
    id: pageId,
    title: pageTitle,
    visibility: pageVisibility,
    rag_doc_id: null as string | null,
  })
  indexPageRef.current.id = pageId
  indexPageRef.current.title = pageTitle
  indexPageRef.current.visibility = pageVisibility

  useEffect(() => {
    let alive = true
    setLoading(true)
    seeded.current = false
    Promise.all([
      dbList<Field>('db_fields', { filter: { page_id: `eq.${pageId}` }, order: 'sort_order.asc' }),
      dbList<Rec>('db_records', { filter: { page_id: `eq.${pageId}` }, order: 'sort_order.asc' }),
      dbList<View>('db_views', { filter: { page_id: `eq.${pageId}` }, order: 'sort_order.asc' }),
    ])
      .then(async ([f, r, v]) => {
        if (!alive) return
        f.forEach((x) => { if (!x.options) x.options = [] })
        r.forEach((x) => { if (!x.props) x.props = {} })
        v.forEach((x) => { if (!x.config) x.config = {} })

        if (f.length === 0 && !seeded.current && !readOnly) {
          seeded.current = true
          const seed = await seedDatabase(pageId)
          f = seed.fields
          r = seed.records
          v = seed.views
        } else if (v.length === 0 && !readOnly) {
          const tv: View = {
            id: uid(), page_id: pageId, name: 'Table', type: 'table', config: {}, sort_order: 0,
          }
          await dbCreate('db_views', tv)
          v = [tv]
        }
        if (!alive) return
        setFields(f)
        setRecords(r)
        setViews(v)
        setActiveView(v[0]?.id || '')
        setLoading(false)
      })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [pageId])

  // ---- field ops
  const addField = useCallback(() => {
    const last = fields[fields.length - 1]
    const nf: Field = {
      id: uid(), page_id: pageId, name: `Field ${fields.length + 1}`, type: 'text',
      options: [], width: 180, sort_order: orderBetween(last?.sort_order),
    }
    setFields((p) => [...p, nf])
    dbCreate('db_fields', nf).catch(() => {})
  }, [fields, pageId])

  const updateField = useCallback((id: string, patch: Partial<Field>) => {
    setFields((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    dbUpdate('db_fields', id, patch).catch(() => {})
  }, [])

  const deleteField = useCallback(
    (id: string) => {
      if (fields.length <= 1) {
        toast('A database needs at least one field')
        return
      }
      setFields((p) => p.filter((f) => f.id !== id))
      dbDelete('db_fields', id).catch(() => {})
    },
    [fields.length],
  )

  // ---- record ops
  const addRecord = useCallback(
    (preset?: Record<string, any>) => {
      const last = recordsRef.current[recordsRef.current.length - 1]
      const nr: Rec = {
        id: uid(), page_id: pageId, props: preset || {}, sub_page_id: null,
        sort_order: orderBetween(last?.sort_order),
      }
      setRecords((p) => [...p, nr])
      dbCreate('db_records', nr).catch(() => {})
      // Index the new record for ⌘K search (fire-and-forget).
      void indexRecord(nr, indexPageRef.current, fieldsRef.current)
      return nr
    },
    [pageId],
  )

  const updateRecord = useCallback((id: string, props: Record<string, any>) => {
    setRecords((p) => p.map((r) => (r.id === id ? { ...r, props } : r)))
    dbUpdate('db_records', id, { props }).catch(() => {})
    // Re-index this record (debounced — rapid edits collapse to one ingest).
    // Stale RAG docs are harmless: deletes are best-effort and ⌘K search
    // dedupes results by record_id, keeping the highest score.
    const rec = recordsRef.current.find((r) => r.id === id)
    if (rec) indexRecordDebounced({ ...rec, props }, indexPageRef.current, fieldsRef.current)
  }, [])

  const setRecordProp = useCallback(
    (id: string, fieldId: string, value: any) => {
      const rec = recordsRef.current.find((r) => r.id === id)
      if (!rec) return
      updateRecord(id, { ...rec.props, [fieldId]: value })
    },
    [updateRecord],
  )

  const deleteRecord = useCallback((id: string) => {
    const rec = recordsRef.current.find((r) => r.id === id)
    setRecords((p) => p.filter((r) => r.id !== id))
    dbDelete('db_records', id).catch(() => {})
    // Remove the record from the search index (fire-and-forget).
    if (rec) void unindex('db_records', rec)
  }, [])

  const openRecord = useCallback(
    async (rec: Rec) => {
      if (rec.sub_page_id) {
        onOpenPage(rec.sub_page_id)
        return
      }
      const titleField = fields[0]
      const title = (titleField && rec.props[titleField.id]) || 'Untitled'
      const page = await createSubPage(String(title), pageId)
      setRecords((p) => p.map((r) => (r.id === rec.id ? { ...r, sub_page_id: page.id } : r)))
      dbUpdate('db_records', rec.id, { sub_page_id: page.id }).catch(() => {})
      onOpenPage(page.id)
    },
    [fields, createSubPage, onOpenPage, pageId],
  )

  // ---- view ops
  const addView = useCallback(
    (type: ViewType) => {
      const firstSelect = fields.find((f) => f.type === 'select')
      const nv: View = {
        id: uid(), page_id: pageId, name: type[0].toUpperCase() + type.slice(1), type,
        config: type === 'board' ? { groupBy: firstSelect?.id } : {},
        sort_order: orderBetween(views[views.length - 1]?.sort_order),
      }
      setViews((p) => [...p, nv])
      setActiveView(nv.id)
      dbCreate('db_views', nv).catch(() => {})
    },
    [fields, views, pageId],
  )

  const updateView = useCallback((id: string, patch: Partial<View>) => {
    setViews((p) => p.map((v) => (v.id === id ? { ...v, ...patch } : v)))
    dbUpdate('db_views', id, patch).catch(() => {})
  }, [])

  const deleteView = useCallback(
    (id: string) => {
      if (views.length <= 1) {
        toast('Keep at least one view')
        return
      }
      const rest = views.filter((v) => v.id !== id)
      setViews(rest)
      if (activeView === id) setActiveView(rest[0].id)
      dbDelete('db_views', id).catch(() => {})
    },
    [views, activeView],
  )

  if (loading) {
    return <div className="db-empty">Loading database…</div>
  }

  const view = views.find((v) => v.id === activeView) || views[0]
  const shared = {
    fields, records, view, readOnly,
    addRecord, updateRecord, setRecordProp, deleteRecord, openRecord,
    addField, updateField, deleteField, updateView,
  }

  return (
    <div className="database">
      <ViewTabs
        views={views}
        activeView={activeView}
        fields={fields}
        readOnly={readOnly}
        onSwitch={setActiveView}
        onAdd={addView}
        onUpdate={updateView}
        onDelete={deleteView}
      />
      {view?.type === 'table' && <TableView {...shared} />}
      {view?.type === 'board' && <BoardView {...shared} />}
      {view?.type === 'gallery' && <GalleryView {...shared} />}
    </div>
  )
}

// --------------------------------------------------------------- seeding
async function seedDatabase(pageId: string) {
  const nameF: Field = { id: uid(), page_id: pageId, name: 'Name', type: 'text', options: [], width: 240, sort_order: 1 }
  const statusOpts: SelectOption[] = [
    { id: uid(), label: 'Not started', color: 'gray' },
    { id: uid(), label: 'In progress', color: 'blue' },
    { id: uid(), label: 'Done', color: 'green' },
  ]
  const statusF: Field = { id: uid(), page_id: pageId, name: 'Status', type: 'select', options: statusOpts, width: 160, sort_order: 2 }
  const dateF: Field = { id: uid(), page_id: pageId, name: 'Due', type: 'date', options: [], width: 140, sort_order: 3 }
  const fields = [nameF, statusF, dateF]
  for (const f of fields) await dbCreate('db_fields', f)

  const tableV: View = { id: uid(), page_id: pageId, name: 'Table', type: 'table', config: {}, sort_order: 1 }
  const boardV: View = { id: uid(), page_id: pageId, name: 'Board', type: 'board', config: { groupBy: statusF.id }, sort_order: 2 }
  const views = [tableV, boardV]
  for (const v of views) await dbCreate('db_views', v)

  const sample = [
    { name: 'Welcome to your database', status: statusOpts[2].id },
    { name: 'Drag this card on the Board view', status: statusOpts[1].id },
    { name: 'Click + New to add a row', status: statusOpts[0].id },
  ]
  const records: Rec[] = []
  let so = 1
  for (const s of sample) {
    const r: Rec = {
      id: uid(), page_id: pageId, sub_page_id: null, sort_order: so++,
      props: { [nameF.id]: s.name, [statusF.id]: s.status },
    }
    await dbCreate('db_records', r)
    records.push(r)
  }
  return { fields, records, views }
}

// --------------------------------------------------------------- view tabs
function ViewTabs({
  views, activeView, fields, readOnly, onSwitch, onAdd, onUpdate, onDelete,
}: {
  views: View[]
  activeView: string
  fields: Field[]
  readOnly: boolean
  onSwitch: (id: string) => void
  onAdd: (t: ViewType) => void
  onUpdate: (id: string, patch: Partial<View>) => void
  onDelete: (id: string) => void
}) {
  const [addRect, setAddRect] = useState<DOMRect | null>(null)
  const [cfg, setCfg] = useState<DOMRect | null>(null)
  const active = views.find((v) => v.id === activeView)

  const icon = (t: ViewType) => (t === 'table' ? '☰' : t === 'board' ? '▤' : '▦')

  return (
    <div className="db-views">
      {views.map((v) => (
        <button
          key={v.id}
          className={'db-tab' + (v.id === activeView ? ' active' : '')}
          onClick={(e) => {
            if (v.id === activeView) {
              if (!readOnly) setCfg((e.currentTarget as HTMLElement).getBoundingClientRect())
            } else onSwitch(v.id)
          }}
        >
          <span>{icon(v.type)}</span>
          {v.name}
        </button>
      ))}
      {!readOnly && (
        <button className="db-tab-add" title="Add view" onClick={(e) => setAddRect((e.currentTarget as HTMLElement).getBoundingClientRect())}>
          +
        </button>
      )}

      {addRect && (
        <Popover anchor={addRect} onClose={() => setAddRect(null)} width={180}>
          <div className="menu">
            <div className="menu-label">New view</div>
            {(['table', 'board', 'gallery'] as ViewType[]).map((t) => (
              <button key={t} className="menu-item" onClick={() => { onAdd(t); setAddRect(null) }}>
                <span className="mi-ico">{icon(t)}</span>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {cfg && active && (
        <Popover anchor={cfg} onClose={() => setCfg(null)} width={230}>
          <div className="menu">
            <div className="field" style={{ margin: 4 }}>
              <input
                className="field-name-input"
                defaultValue={active.name}
                autoFocus
                onChange={(e) => onUpdate(active.id, { name: e.target.value })}
              />
            </div>
            {active.type === 'board' && (
              <>
                <div className="menu-label">Group by</div>
                {fields
                  .filter((f) => f.type === 'select')
                  .map((f) => (
                    <button
                      key={f.id}
                      className="menu-item"
                      style={{ fontWeight: active.config.groupBy === f.id ? 600 : 400 }}
                      onClick={() => onUpdate(active.id, { config: { ...active.config, groupBy: f.id } })}
                    >
                      <span className="mi-ico">◉</span>
                      {f.name}
                    </button>
                  ))}
                {fields.filter((f) => f.type === 'select').length === 0 && (
                  <div className="tree-empty">Add a Select field to group</div>
                )}
                <div className="menu-sep" />
              </>
            )}
            <button className="menu-item danger" onClick={() => { onDelete(active.id); setCfg(null) }}>
              <span className="mi-ico">🗑</span> Delete view
            </button>
          </div>
        </Popover>
      )}
    </div>
  )
}

// --------------------------------------------------------------- shared types
interface ViewProps {
  fields: Field[]
  records: Rec[]
  view: View
  readOnly: boolean
  addRecord: (preset?: Record<string, any>) => Rec
  updateRecord: (id: string, props: Record<string, any>) => void
  setRecordProp: (id: string, fieldId: string, value: any) => void
  deleteRecord: (id: string) => void
  openRecord: (rec: Rec) => void
  addField: () => void
  updateField: (id: string, patch: Partial<Field>) => void
  deleteField: (id: string) => void
  updateView: (id: string, patch: Partial<View>) => void
}

// --------------------------------------------------------------- table view
function TableView(p: ViewProps) {
  const { fields, records } = p
  const [fieldMenu, setFieldMenu] = useState<{ field: Field; rect: DOMRect } | null>(null)
  const resizing = useRef<{ id: string; startX: number; startW: number } | null>(null)

  useEffect(() => {
    function move(e: MouseEvent) {
      if (!resizing.current) return
      const w = Math.max(80, resizing.current.startW + (e.clientX - resizing.current.startX))
      const el = document.querySelector<HTMLElement>(`[data-col="${resizing.current.id}"]`)
      if (el) {
        el.style.width = w + 'px'
        document.querySelectorAll<HTMLElement>(`[data-bodycol="${resizing.current.id}"]`).forEach((c) => {
          c.style.width = w + 'px'
        })
      }
    }
    function up(e: MouseEvent) {
      if (!resizing.current) return
      const w = Math.max(80, resizing.current.startW + (e.clientX - resizing.current.startX))
      p.updateField(resizing.current.id, { width: w })
      resizing.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [p])

  return (
    <div>
      {!p.readOnly && (
        <div className="db-toolbar">
          <button className="db-add-row" onClick={() => p.addRecord()}>
            + New
          </button>
        </div>
      )}
      <div className="tbl-wrap">
        <div className="tbl">
          <div className="tbl-row head">
            {fields.map((f) => (
              <div
                key={f.id}
                className="tbl-cell head"
                data-col={f.id}
                style={{ width: f.width }}
                onClick={(e) =>
                  !p.readOnly &&
                  setFieldMenu({ field: f, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })
                }
              >
                <span className="th-ico">{FIELD_TYPE_META.find((m) => m.type === f.type)?.icon}</span>
                <span className="th-name">{f.name}</span>
                {!p.readOnly && (
                  <div
                    className="col-resize"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      resizing.current = { id: f.id, startX: e.clientX, startW: f.width }
                    }}
                  />
                )}
              </div>
            ))}
            {!p.readOnly && (
              <div className="tbl-addcol" onClick={p.addField} title="Add field">
                +
              </div>
            )}
          </div>

          {records.map((r) => (
            <div key={r.id} className="tbl-row body">
              {fields.map((f, fi) => (
                <div key={f.id} className="tbl-cell" data-bodycol={f.id} style={{ width: f.width }}>
                  {fi === 0 ? (
                    <div className="tbl-cell-inner">
                      <TitleCellInput
                        value={r.props[f.id]}
                        readOnly={p.readOnly}
                        onChange={(v) => p.setRecordProp(r.id, f.id, v)}
                      />
                      {!p.readOnly && (
                        <button className="row-open" onClick={() => p.openRecord(r)}>
                          ⤢ OPEN
                        </button>
                      )}
                    </div>
                  ) : (
                    <Cell
                      field={f}
                      value={r.props[f.id]}
                      readOnly={p.readOnly}
                      onChange={(v) => p.setRecordProp(r.id, f.id, v)}
                      onFieldUpdate={p.updateField}
                    />
                  )}
                </div>
              ))}
              {!p.readOnly && (
                <div className="tbl-cell" style={{ width: 44, borderRight: 'none' }}>
                  <div className="tbl-cell-inner" style={{ justifyContent: 'center' }}>
                    <button
                      className="row-open"
                      style={{ border: 'none' }}
                      title="Delete row"
                      onClick={() => p.deleteRecord(r.id)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!p.readOnly && (
            <div className="tbl-row foot">
              <button className="tbl-add-record" onClick={() => p.addRecord()}>
                <span>+</span> New
              </button>
            </div>
          )}
        </div>
      </div>

      {fieldMenu && (
        <FieldMenu
          field={fieldMenu.field}
          rect={fieldMenu.rect}
          onClose={() => setFieldMenu(null)}
          onUpdate={p.updateField}
          onDelete={(id) => {
            p.deleteField(id)
            setFieldMenu(null)
          }}
        />
      )}
    </div>
  )
}

function TitleCellInput({
  value, readOnly, onChange,
}: {
  value: any
  readOnly?: boolean
  onChange: (v: string) => void
}) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  if (readOnly) {
    return <span className="title-cell-text">{v || 'Untitled'}</span>
  }
  return (
    <input
      className="cell-input title-cell-text"
      value={v}
      placeholder="Untitled"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value ?? '') && onChange(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

// --------------------------------------------------------------- board view
function BoardView(p: ViewProps) {
  const { fields, records, view } = p
  const groupField = fields.find((f) => f.id === view.config.groupBy && f.type === 'select')
  const titleField = fields[0]
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  if (!groupField) {
    return (
      <div className="db-empty">
        This board needs a <b>Select</b> field to group by.
        <br />
        Click the view tab again to pick one, or add a Select field in Table view.
      </div>
    )
  }

  const columns: { id: string; label: string; color: string }[] = [
    { id: '__none__', label: 'No ' + groupField.name, color: 'gray' },
    ...groupField.options.map((o) => ({ id: o.id, label: o.label, color: o.color })),
  ]

  const onDragEnd = (e: DragEndEvent) => {
    if (p.readOnly) return
    const recId = e.active.id as string
    const colId = e.over?.id as string | undefined
    if (!colId) return
    p.setRecordProp(recId, groupField.id, colId === '__none__' ? null : colId)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="board">
        {columns.map((col) => {
          const cards = records.filter((r) => {
            const v = r.props[groupField.id]
            return col.id === '__none__' ? !v : v === col.id
          })
          return (
            <BoardColumn key={col.id} col={col} count={cards.length}>
              {cards.map((r) => (
                <BoardCard
                  key={r.id}
                  rec={r}
                  fields={fields}
                  titleField={titleField}
                  groupFieldId={groupField.id}
                  readOnly={p.readOnly}
                  onOpen={() => p.openRecord(r)}
                />
              ))}
              {!p.readOnly && (
                <button
                  className="board-add"
                  onClick={() =>
                    p.addRecord(col.id === '__none__' ? {} : { [groupField.id]: col.id })
                  }
                >
                  + New
                </button>
              )}
            </BoardColumn>
          )
        })}
      </div>
    </DndContext>
  )
}

function BoardColumn({
  col, count, children,
}: {
  col: { id: string; label: string; color: string }
  count: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })
  const c = colorDef(col.color)
  return (
    <div className="board-col">
      <div className="board-col-head">
        <span className="chip" style={{ background: c.chipBg, color: c.chipText }}>
          {col.label}
        </span>
        <span className="board-col-count">{count}</span>
      </div>
      <div ref={setNodeRef} className={'board-cards' + (isOver ? ' over' : '')}>
        {children}
      </div>
    </div>
  )
}

function BoardCard({
  rec, fields, titleField, groupFieldId, readOnly, onOpen,
}: {
  rec: Rec
  fields: Field[]
  titleField: Field
  groupFieldId: string
  readOnly?: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: rec.id })
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
  }
  const extra = fields.filter((f) => f.id !== titleField?.id && f.id !== groupFieldId && f.type !== 'text')
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={'board-card' + (isDragging ? ' dragging' : '')}
      {...(readOnly ? {} : attributes)}
      {...(readOnly ? {} : listeners)}
      onClick={onOpen}
    >
      <div className="board-card-title">{rec.props[titleField?.id] || 'Untitled'}</div>
      <div className="board-card-fields">
        {extra.map((f) => (
          <CellValue key={f.id} field={f} value={rec.props[f.id]} />
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- gallery view
function GalleryView(p: ViewProps) {
  const { fields, records } = p
  const titleField = fields[0]
  const rest = fields.slice(1)
  return (
    <div>
      {!p.readOnly && (
        <div className="db-toolbar">
          <button className="db-add-row" onClick={() => p.addRecord()}>
            + New
          </button>
        </div>
      )}
      {records.length === 0 && <div className="db-empty">No records yet.</div>}
      <div className="gallery">
        {records.map((r) => {
          const title = r.props[titleField?.id] || 'Untitled'
          return (
            <div key={r.id} className="gallery-card" onClick={() => p.openRecord(r)}>
              <div className="gallery-card-cover">{String(title).slice(0, 1).toUpperCase() || '📄'}</div>
              <div className="gallery-card-body">
                <div className="gallery-card-title">{title}</div>
                <div className="gallery-card-fields">
                  {rest.map((f) => (
                    <div key={f.id} className="gallery-field-row">
                      <span className="gallery-field-label">{f.name}</span>
                      <CellValue field={f} value={r.props[f.id]} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --------------------------------------------------------------- cell editor
function Cell({
  field, value, readOnly, onChange, onFieldUpdate,
}: {
  field: Field
  value: any
  readOnly?: boolean
  onChange: (v: any) => void
  onFieldUpdate: (id: string, patch: Partial<Field>) => void
}) {
  const [selRect, setSelRect] = useState<DOMRect | null>(null)

  if (readOnly) {
    return (
      <div className="tbl-cell-inner">
        <CellValue field={field} value={value} />
      </div>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <div className="tbl-cell-inner checkbox-cell">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      </div>
    )
  }
  if (field.type === 'select' || field.type === 'multi_select') {
    const multi = field.type === 'multi_select'
    const ids: string[] = multi ? (Array.isArray(value) ? value : []) : value ? [value] : []
    return (
      <>
        <div
          className="tbl-cell-inner"
          onClick={(e) => setSelRect((e.currentTarget as HTMLElement).getBoundingClientRect())}
        >
          <div className="chips-wrap">
            {ids.map((id) => {
              const opt = field.options.find((o) => o.id === id)
              if (!opt) return null
              const c = colorDef(opt.color)
              return (
                <span key={id} className="chip" style={{ background: c.chipBg, color: c.chipText }}>
                  {opt.label}
                </span>
              )
            })}
          </div>
        </div>
        {selRect && (
          <SelectEditor
            field={field}
            selected={ids}
            multi={multi}
            rect={selRect}
            onClose={() => setSelRect(null)}
            onChange={onChange}
            onFieldUpdate={onFieldUpdate}
          />
        )}
      </>
    )
  }
  if (field.type === 'date') {
    return (
      <div className="tbl-cell-inner">
        <input
          className="cell-input"
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }
  if (field.type === 'number') {
    return (
      <div className="tbl-cell-inner">
        <NumberInput value={value} onChange={onChange} />
      </div>
    )
  }
  // text + url
  return (
    <div className="tbl-cell-inner">
      <TextInput value={value} onChange={onChange} isUrl={field.type === 'url'} />
    </div>
  )
}

function TextInput({ value, onChange, isUrl }: { value: any; onChange: (v: string) => void; isUrl?: boolean }) {
  const [v, setV] = useState(value ?? '')
  const [editing, setEditing] = useState(false)
  useEffect(() => setV(value ?? ''), [value])
  if (isUrl && !editing && v) {
    return (
      <a
        href={/^https?:\/\//.test(v) ? v : 'https://' + v}
        target="_blank"
        rel="noreferrer"
        className="cell-input"
        style={{ textDecoration: 'underline' }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => setEditing(true)}
      >
        {v}
      </a>
    )
  }
  return (
    <input
      className="cell-input"
      value={v}
      autoFocus={editing}
      onFocus={() => setEditing(true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (v !== (value ?? '')) onChange(v)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function NumberInput({ value, onChange }: { value: any; onChange: (v: number | null) => void }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  return (
    <input
      className="cell-input"
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = v === '' ? null : Number(v)
        if (n !== (value ?? null)) onChange(n)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

// read-only value (board cards / gallery)
function CellValue({ field, value }: { field: Field; value: any }) {
  if (value == null || value === '') return <span style={{ color: 'rgba(55,53,47,.3)', fontSize: 12.5 }}>—</span>
  if (field.type === 'checkbox') return <span>{value ? '☑' : '☐'}</span>
  if (field.type === 'select' || field.type === 'multi_select') {
    const ids: string[] = Array.isArray(value) ? value : [value]
    return (
      <span className="chips-wrap">
        {ids.map((id) => {
          const opt = field.options.find((o) => o.id === id)
          if (!opt) return null
          const c = colorDef(opt.color)
          return (
            <span key={id} className="chip" style={{ background: c.chipBg, color: c.chipText }}>
              {opt.label}
            </span>
          )
        })}
      </span>
    )
  }
  if (field.type === 'date') return <span style={{ fontSize: 12.5 }}>{formatDate(value)}</span>
  if (field.type === 'url')
    return (
      <a href={/^https?:\/\//.test(value) ? value : 'https://' + value} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
        {value}
      </a>
    )
  return <span style={{ fontSize: 12.5 }}>{String(value)}</span>
}

function formatDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// --------------------------------------------------------------- select editor
function SelectEditor({
  field, selected, multi, rect, onClose, onChange, onFieldUpdate,
}: {
  field: Field
  selected: string[]
  multi: boolean
  rect: DOMRect
  onClose: () => void
  onChange: (v: any) => void
  onFieldUpdate: (id: string, patch: Partial<Field>) => void
}) {
  const [q, setQ] = useState('')
  const matches = field.options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
  const exact = field.options.some((o) => o.label.toLowerCase() === q.toLowerCase().trim())

  const pick = (id: string) => {
    if (multi) {
      const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
      onChange(next)
    } else {
      onChange(selected[0] === id ? null : id)
      onClose()
    }
  }

  const create = () => {
    const label = q.trim()
    if (!label) return
    const color = SELECT_COLORS[field.options.length % SELECT_COLORS.length].name
    const opt: SelectOption = { id: uid(), label, color }
    onFieldUpdate(field.id, { options: [...field.options, opt] })
    setQ('')
    if (multi) onChange([...selected, opt.id])
    else {
      onChange(opt.id)
      onClose()
    }
  }

  return (
    <Popover anchor={rect} onClose={onClose} width={240}>
      <div className="select-pop">
        <input
          className="select-search"
          placeholder="Search or create…"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (matches.length === 1) pick(matches[0].id)
              else if (!exact) create()
            }
          }}
        />
        {matches.map((o) => {
          const c = colorDef(o.color)
          return (
            <div key={o.id} className="select-opt" onClick={() => pick(o.id)}>
              <span className="color-dot" style={{ background: c.dot }} />
              <span className="chip" style={{ background: c.chipBg, color: c.chipText }}>
                {o.label}
              </span>
              <span style={{ flex: 1 }} />
              {selected.includes(o.id) && <span style={{ color: 'var(--accent)' }}>✓</span>}
            </div>
          )
        })}
        {q.trim() && !exact && (
          <div className="select-opt opt-create" onClick={create}>
            <span style={{ color: 'var(--text-faint)' }}>＋</span> Create “{q.trim()}”
          </div>
        )}
        {field.options.length === 0 && !q && (
          <div className="tree-empty">Type to create the first option</div>
        )}
      </div>
    </Popover>
  )
}

// --------------------------------------------------------------- field menu
function FieldMenu({
  field, rect, onClose, onUpdate, onDelete,
}: {
  field: Field
  rect: DOMRect
  onClose: () => void
  onUpdate: (id: string, patch: Partial<Field>) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState(field.name)
  const [showTypes, setShowTypes] = useState(false)
  const hasOptions = field.type === 'select' || field.type === 'multi_select'

  const cycleColor = (opt: SelectOption) => {
    const idx = SELECT_COLORS.findIndex((c) => c.name === opt.color)
    const next = SELECT_COLORS[(idx + 1) % SELECT_COLORS.length].name
    onUpdate(field.id, {
      options: field.options.map((o) => (o.id === opt.id ? { ...o, color: next } : o)),
    })
  }

  return (
    <Popover anchor={rect} onClose={onClose} width={250}>
      <div className="field-pop">
        <input
          className="field-name-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== field.name && onUpdate(field.id, { name })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button className="menu-item" onClick={() => setShowTypes((s) => !s)}>
          <span className="mi-ico">{FIELD_TYPE_META.find((m) => m.type === field.type)?.icon}</span>
          Type: {FIELD_TYPE_META.find((m) => m.type === field.type)?.label}
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--text-faint)' }}>{showTypes ? '▾' : '▸'}</span>
        </button>
        {showTypes && (
          <div className="field-type-grid">
            {FIELD_TYPE_META.map((m) => (
              <button
                key={m.type}
                className="menu-item"
                style={{ fontWeight: m.type === field.type ? 600 : 400, paddingLeft: 24 }}
                onClick={() => {
                  onUpdate(field.id, { type: m.type as FieldType })
                  setShowTypes(false)
                }}
              >
                <span className="mi-ico">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        )}

        {hasOptions && (
          <>
            <div className="menu-sep" />
            <div className="menu-label">Options</div>
            {field.options.map((o) => (
              <div key={o.id} className="select-opt">
                <span
                  className="color-dot"
                  style={{ background: colorDef(o.color).dot, cursor: 'pointer' }}
                  title="Change color"
                  onClick={() => cycleColor(o)}
                />
                <input
                  className="cell-input"
                  defaultValue={o.label}
                  onBlur={(e) =>
                    onUpdate(field.id, {
                      options: field.options.map((x) =>
                        x.id === o.id ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
                <span
                  className="chip-x"
                  onClick={() =>
                    onUpdate(field.id, { options: field.options.filter((x) => x.id !== o.id) })
                  }
                >
                  ✕
                </span>
              </div>
            ))}
            <button
              className="menu-item"
              onClick={() => {
                const color = SELECT_COLORS[field.options.length % SELECT_COLORS.length].name
                onUpdate(field.id, {
                  options: [...field.options, { id: uid(), label: 'New option', color }],
                })
              }}
            >
              <span className="mi-ico">＋</span> Add option
            </button>
          </>
        )}

        <div className="menu-sep" />
        <button className="menu-item danger" onClick={() => onDelete(field.id)}>
          <span className="mi-ico">🗑</span> Delete field
        </button>
      </div>
    </Popover>
  )
}
