// Domain model for butterOPCOffice: pages, blocks, databases.

export type PageKind = 'doc' | 'database'

/**
 * Page visibility in the team workspace ("office"):
 *  - 'shared'  → workspace page: every teammate can see and edit it.
 *  - 'private' → only the owner + people explicitly added via `shares`.
 * New pages default to 'shared'; new sub-pages inherit their parent's value.
 */
export type Visibility = 'shared' | 'private'

export interface Page {
  id: string
  owner_id?: string
  parent_id: string | null
  title: string
  icon: string | null
  kind: PageKind
  cover: string | null
  sort_order: number
  archived: boolean
  /** Team-workspace visibility. RLS enforces 'shared' = team-wide access. */
  visibility: Visibility
  /** RAG document id for semantic search — set lazily after indexing. */
  rag_doc_id?: string | null
  created_at?: string
  updated_at?: string
}

export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bulleted'
  | 'numbered'
  | 'todo'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'

export interface Block {
  id: string
  page_id: string
  parent_id: string | null
  type: BlockType
  text: string
  checked: boolean
  props: { collapsed?: boolean; emoji?: string }
  sort_order: number
}

export type FieldType = 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'checkbox' | 'url'

export interface SelectOption {
  id: string
  label: string
  color: string
}

export interface Field {
  id: string
  page_id: string
  name: string
  type: FieldType
  options: SelectOption[]
  width: number
  sort_order: number
}

export interface Rec {
  id: string
  page_id: string
  props: Record<string, any>
  sub_page_id: string | null
  sort_order: number
  /** RAG document id for semantic search — set lazily after indexing. */
  rag_doc_id?: string | null
}

export type Role = 'viewer' | 'editor'

export interface Share {
  id: string
  owner_id: string
  page_id: string
  invitee_email: string
  invitee_id: string | null
  role: Role
  created_at?: string
}

export type ViewType = 'table' | 'board' | 'gallery'

export interface View {
  id: string
  page_id: string
  name: string
  type: ViewType
  config: { groupBy?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }
  sort_order: number
}

// --------------------------------------------------------------- block menu
export interface BlockDef {
  type: BlockType
  label: string
  desc: string
  icon: string
  keywords: string
}

export const BLOCK_DEFS: BlockDef[] = [
  { type: 'paragraph', label: 'Text', desc: 'Just start writing with plain text.', icon: 'Aa', keywords: 'text plain paragraph' },
  { type: 'h1', label: 'Heading 1', desc: 'Big section heading.', icon: 'H₁', keywords: 'heading title big h1' },
  { type: 'h2', label: 'Heading 2', desc: 'Medium section heading.', icon: 'H₂', keywords: 'heading subtitle h2' },
  { type: 'h3', label: 'Heading 3', desc: 'Small section heading.', icon: 'H₃', keywords: 'heading small h3' },
  { type: 'todo', label: 'To-do list', desc: 'Track tasks with a checkbox.', icon: '☑', keywords: 'todo task checkbox check' },
  { type: 'bulleted', label: 'Bulleted list', desc: 'A simple bulleted list.', icon: '•', keywords: 'bullet list unordered point' },
  { type: 'numbered', label: 'Numbered list', desc: 'A list with numbering.', icon: '1.', keywords: 'number ordered list' },
  { type: 'toggle', label: 'Toggle list', desc: 'Collapsible content.', icon: '▸', keywords: 'toggle collapse fold dropdown' },
  { type: 'quote', label: 'Quote', desc: 'Capture a quote.', icon: '❝', keywords: 'quote blockquote citation' },
  { type: 'callout', label: 'Callout', desc: 'Make writing stand out.', icon: '💡', keywords: 'callout note info highlight' },
  { type: 'code', label: 'Code', desc: 'Capture a code snippet.', icon: '</>', keywords: 'code snippet monospace' },
  { type: 'divider', label: 'Divider', desc: 'Visually divide blocks.', icon: '—', keywords: 'divider line separator hr' },
]

// ---------------------------------------------------------------- palettes
export interface ColorDef {
  name: string
  chipBg: string
  chipText: string
  dot: string
}

export const SELECT_COLORS: ColorDef[] = [
  { name: 'gray', chipBg: '#e3e2e0', chipText: '#37352f', dot: '#9b9a97' },
  { name: 'brown', chipBg: '#eee0da', chipText: '#64473a', dot: '#a3795b' },
  { name: 'orange', chipBg: '#fadec9', chipText: '#854c1d', dot: '#d9730d' },
  { name: 'yellow', chipBg: '#fdecc8', chipText: '#7a5b16', dot: '#dfab01' },
  { name: 'green', chipBg: '#dbeddb', chipText: '#28583b', dot: '#4d9d6b' },
  { name: 'blue', chipBg: '#d3e5ef', chipText: '#1f3f5b', dot: '#529cca' },
  { name: 'purple', chipBg: '#e8deee', chipText: '#492f64', dot: '#9a6dd7' },
  { name: 'pink', chipBg: '#f5e0e9', chipText: '#69314c', dot: '#e255a1' },
  { name: 'red', chipBg: '#ffe2dd', chipText: '#6e3630', dot: '#ff7369' },
]

export function colorDef(name: string): ColorDef {
  return SELECT_COLORS.find((c) => c.name === name) || SELECT_COLORS[0]
}

export const FIELD_TYPE_META: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: '𝐓' },
  { type: 'number', label: 'Number', icon: '#' },
  { type: 'select', label: 'Select', icon: '◉' },
  { type: 'multi_select', label: 'Multi-select', icon: '☰' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
  { type: 'url', label: 'URL', icon: '🔗' },
]

export const PAGE_EMOJIS: string[] = [
  '📄','📝','📌','📋','🗂️','📁','📒','📓','📔','📕','📗','📘','📙','📚',
  '✅','⭐','🔥','💡','🎯','🚀','🧩','🛠️','⚙️','🔧','🧠','💼','📊','📈',
  '🗓️','⏰','🔔','🎨','🎵','🎮','🍀','🌱','🌟','🌈','☀️','🌙','🦋','🐝',
  '🐙','🦊','🐢','🐬','🌸','🍂','🍕','☕','🧪','🔬','🧭','🗺️','🏆','🎁',
  '❤️','💙','💚','💛','💜','🧡','🤍','🖤','💭','💬','📎','✏️','🖊️','🔮',
]
