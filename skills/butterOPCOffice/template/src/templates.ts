// Business templates for the one-person company.
// Each template instantiates into a real page with blocks or a database.

import { BlockType, FieldType, Page, PageKind, SelectOption, ViewType } from './model'
import { dbCreate, uid } from './bb'

export interface TemplateField {
  name: string
  type: FieldType
  width?: number
  options?: { label: string; color: string }[]
}

export interface TemplateView {
  name: string
  type: ViewType
  groupBy?: string // field name
}

export interface TemplateBlock {
  type: BlockType
  text: string
  checked?: boolean
  emoji?: string
  children?: TemplateBlock[]
}

export interface TemplateDef {
  key: string
  name: string
  icon: string
  tagline: string
  inside: string[]
  kind: PageKind
  blocks?: TemplateBlock[]
  fields?: TemplateField[]
  views?: TemplateView[]
  records?: Record<string, any>[]
}

// ------------------------------------------------------------------ catalog
export const TEMPLATES: TemplateDef[] = [
  {
    key: 'crm',
    name: 'CRM & Sales Pipeline',
    icon: '🤝',
    tagline: 'Every lead, deal, and follow-up in one pipeline.',
    inside: ['Board grouped by deal stage', 'Deal size + next-step tracking', '5 sample deals'],
    kind: 'database',
    fields: [
      { name: 'Company', type: 'text', width: 220 },
      { name: 'Contact', type: 'text', width: 150 },
      {
        name: 'Stage',
        type: 'select',
        width: 140,
        options: [
          { label: 'Lead', color: 'gray' },
          { label: 'Contacted', color: 'blue' },
          { label: 'Demo', color: 'purple' },
          { label: 'Proposal', color: 'orange' },
          { label: 'Won', color: 'green' },
          { label: 'Lost', color: 'red' },
        ],
      },
      { name: 'Deal Size', type: 'number', width: 110 },
      { name: 'Next Step', type: 'text', width: 220 },
      { name: 'Last Touch', type: 'date', width: 130 },
    ],
    views: [
      { name: 'Pipeline', type: 'board', groupBy: 'Stage' },
      { name: 'All Deals', type: 'table' },
    ],
    records: [
      { Company: 'Acme Co', Contact: 'Jane Doe', Stage: 'Demo', 'Deal Size': 12000, 'Next Step': 'Send proposal Friday', 'Last Touch': '2026-05-15' },
      { Company: 'Globex', Contact: 'Sam Lee', Stage: 'Lead', 'Deal Size': 5000, 'Next Step': 'Book intro call', 'Last Touch': '2026-05-17' },
      { Company: 'Initech', Contact: 'Pat Kim', Stage: 'Won', 'Deal Size': 24000, 'Next Step': 'Schedule kickoff', 'Last Touch': '2026-05-12' },
      { Company: 'Hooli', Contact: 'Chris Ray', Stage: 'Proposal', 'Deal Size': 18000, 'Next Step': 'Follow up on pricing', 'Last Touch': '2026-05-16' },
      { Company: 'Umbrella', Contact: 'Dana Fox', Stage: 'Contacted', 'Deal Size': 8000, 'Next Step': 'Waiting on reply', 'Last Touch': '2026-05-14' },
    ],
  },
  {
    key: 'content',
    name: 'Content Calendar',
    icon: '📅',
    tagline: 'Plan, draft, and ship content across every channel.',
    inside: ['Board by publish status', 'Channel + hook fields', '5 sample posts'],
    kind: 'database',
    fields: [
      { name: 'Title', type: 'text', width: 240 },
      {
        name: 'Channel',
        type: 'select',
        width: 130,
        options: [
          { label: 'X / Twitter', color: 'gray' },
          { label: 'LinkedIn', color: 'blue' },
          { label: 'Newsletter', color: 'orange' },
          { label: 'Blog', color: 'green' },
          { label: 'YouTube', color: 'red' },
        ],
      },
      {
        name: 'Status',
        type: 'select',
        width: 130,
        options: [
          { label: 'Idea', color: 'gray' },
          { label: 'Draft', color: 'yellow' },
          { label: 'Scheduled', color: 'blue' },
          { label: 'Published', color: 'green' },
        ],
      },
      { name: 'Publish Date', type: 'date', width: 140 },
      { name: 'Hook', type: 'text', width: 260 },
    ],
    views: [
      { name: 'Pipeline', type: 'board', groupBy: 'Status' },
      { name: 'Schedule', type: 'table' },
    ],
    records: [
      { Title: 'Why I went solo', Channel: 'LinkedIn', Status: 'Published', 'Publish Date': '2026-05-12', Hook: 'The day I fired my own boss.' },
      { Title: '5 tools that run my company', Channel: 'X / Twitter', Status: 'Scheduled', 'Publish Date': '2026-05-20', Hook: 'A whole company in 5 tabs.' },
      { Title: 'Month 1 revenue breakdown', Channel: 'Newsletter', Status: 'Draft', 'Publish Date': '2026-05-24', Hook: 'I made $X. Here is every dollar.' },
      { Title: 'Building in public: week 3', Channel: 'Blog', Status: 'Idea', 'Publish Date': '2026-05-28', Hook: '' },
      { Title: 'My one-person tech stack', Channel: 'YouTube', Status: 'Idea', 'Publish Date': '2026-06-02', Hook: '' },
    ],
  },
  {
    key: 'projects',
    name: 'Projects & Tasks',
    icon: '✅',
    tagline: 'A focused task board so the work actually ships.',
    inside: ['Board by status', 'Priority + area tags', '6 sample tasks'],
    kind: 'database',
    fields: [
      { name: 'Task', type: 'text', width: 280 },
      {
        name: 'Status',
        type: 'select',
        width: 130,
        options: [
          { label: 'Backlog', color: 'gray' },
          { label: 'This Week', color: 'blue' },
          { label: 'In Progress', color: 'orange' },
          { label: 'Done', color: 'green' },
        ],
      },
      {
        name: 'Priority',
        type: 'select',
        width: 110,
        options: [
          { label: 'Low', color: 'gray' },
          { label: 'Medium', color: 'yellow' },
          { label: 'High', color: 'red' },
        ],
      },
      {
        name: 'Area',
        type: 'select',
        width: 120,
        options: [
          { label: 'Product', color: 'purple' },
          { label: 'Growth', color: 'green' },
          { label: 'Ops', color: 'blue' },
          { label: 'Admin', color: 'gray' },
        ],
      },
      { name: 'Due', type: 'date', width: 130 },
    ],
    views: [
      { name: 'Board', type: 'board', groupBy: 'Status' },
      { name: 'All Tasks', type: 'table' },
    ],
    records: [
      { Task: 'Ship landing page v2', Status: 'In Progress', Priority: 'High', Area: 'Product', Due: '2026-05-21' },
      { Task: 'Write 3 launch posts', Status: 'This Week', Priority: 'High', Area: 'Growth', Due: '2026-05-22' },
      { Task: 'Set up bookkeeping', Status: 'This Week', Priority: 'Medium', Area: 'Admin', Due: '2026-05-23' },
      { Task: 'Reply to 10 leads', Status: 'In Progress', Priority: 'High', Area: 'Growth', Due: '2026-05-19' },
      { Task: 'Record demo video', Status: 'Backlog', Priority: 'Medium', Area: 'Product', Due: '2026-05-30' },
      { Task: 'File quarterly taxes', Status: 'Done', Priority: 'Medium', Area: 'Admin', Due: '2026-05-10' },
    ],
  },
  {
    key: 'finance',
    name: 'Finance & Runway',
    icon: '💰',
    tagline: 'Track every dollar in and out — know your runway.',
    inside: ['Income vs expense ledger', 'Category + recurring tags', '6 sample entries'],
    kind: 'database',
    fields: [
      { name: 'Item', type: 'text', width: 240 },
      {
        name: 'Type',
        type: 'select',
        width: 110,
        options: [
          { label: 'Income', color: 'green' },
          { label: 'Expense', color: 'red' },
        ],
      },
      {
        name: 'Category',
        type: 'select',
        width: 140,
        options: [
          { label: 'Revenue', color: 'green' },
          { label: 'Software', color: 'blue' },
          { label: 'Contractor', color: 'purple' },
          { label: 'Marketing', color: 'orange' },
          { label: 'Other', color: 'gray' },
        ],
      },
      { name: 'Amount', type: 'number', width: 110 },
      { name: 'Date', type: 'date', width: 130 },
      { name: 'Recurring', type: 'checkbox', width: 100 },
    ],
    views: [
      { name: 'Ledger', type: 'table' },
      { name: 'By Type', type: 'board', groupBy: 'Type' },
    ],
    records: [
      { Item: 'Client retainer — Acme', Type: 'Income', Category: 'Revenue', Amount: 4000, Date: '2026-05-01', Recurring: true },
      { Item: 'Course sales', Type: 'Income', Category: 'Revenue', Amount: 1850, Date: '2026-05-14', Recurring: false },
      { Item: 'Butterbase + hosting', Type: 'Expense', Category: 'Software', Amount: 90, Date: '2026-05-03', Recurring: true },
      { Item: 'Design contractor', Type: 'Expense', Category: 'Contractor', Amount: 1200, Date: '2026-05-09', Recurring: false },
      { Item: 'Ad spend', Type: 'Expense', Category: 'Marketing', Amount: 300, Date: '2026-05-11', Recurring: true },
      { Item: 'Accounting software', Type: 'Expense', Category: 'Software', Amount: 25, Date: '2026-05-05', Recurring: true },
    ],
  },
  {
    key: 'weekly',
    name: 'Weekly Operating Review',
    icon: '🧭',
    tagline: 'The Monday ritual that keeps a solo company on track.',
    inside: ['Focus, metrics, wins, blockers', 'A repeatable weekly cadence', 'Ready-to-fill structure'],
    kind: 'doc',
    blocks: [
      { type: 'h1', text: 'Weekly Operating Review' },
      {
        type: 'callout',
        emoji: '🧭',
        text: 'A one-person company runs on a weekly cadence. Every Monday: review where you are, where you are going, and what is in the way. 15 minutes, every week.',
      },
      { type: 'h2', text: '🎯 Focus — the 3 things that matter this week' },
      { type: 'todo', text: 'Priority 1 — the needle-mover' },
      { type: 'todo', text: 'Priority 2' },
      { type: 'todo', text: 'Priority 3' },
      { type: 'h2', text: '📊 Metrics' },
      { type: 'bulleted', text: 'Revenue this week: ' },
      { type: 'bulleted', text: 'Pipeline / leads: ' },
      { type: 'bulleted', text: 'Content shipped: ' },
      { type: 'bulleted', text: 'Cash on hand / runway: ' },
      { type: 'h2', text: '🏆 Wins' },
      { type: 'bulleted', text: '' },
      { type: 'h2', text: '🧗 Blockers & lessons' },
      { type: 'bulleted', text: '' },
      {
        type: 'toggle',
        text: 'Last week’s review',
        children: [{ type: 'paragraph', text: 'Paste last week’s review here before you start this one — momentum compounds.' }],
      },
      { type: 'divider', text: '' },
      { type: 'quote', text: 'What would this look like if it were easy?' },
    ],
  },
  {
    key: 'brain',
    name: 'Knowledge Hub',
    icon: '🧠',
    tagline: 'Your second brain — capture ideas, notes, and sources.',
    inside: ['Gallery + table views', 'Type + tag organisation', '4 starter notes'],
    kind: 'database',
    fields: [
      { name: 'Title', type: 'text', width: 260 },
      {
        name: 'Type',
        type: 'select',
        width: 120,
        options: [
          { label: 'Idea', color: 'yellow' },
          { label: 'Reference', color: 'blue' },
          { label: 'Article', color: 'green' },
          { label: 'Quote', color: 'purple' },
        ],
      },
      {
        name: 'Tags',
        type: 'multi_select',
        width: 180,
        options: [
          { label: 'growth', color: 'green' },
          { label: 'product', color: 'purple' },
          { label: 'mindset', color: 'orange' },
          { label: 'systems', color: 'blue' },
        ],
      },
      { name: 'Source', type: 'url', width: 200 },
      { name: 'Captured', type: 'date', width: 130 },
    ],
    views: [
      { name: 'All Notes', type: 'table' },
      { name: 'Gallery', type: 'gallery' },
    ],
    records: [
      { Title: 'Solo founders should automate before they hire', Type: 'Idea', Tags: ['systems', 'growth'], Source: '', Captured: '2026-05-13' },
      { Title: 'The 1-Person Business playbook', Type: 'Article', Tags: ['growth'], Source: 'https://example.com/opc', Captured: '2026-05-15' },
      { Title: 'Pricing: charge for value, not time', Type: 'Reference', Tags: ['product'], Source: '', Captured: '2026-05-16' },
      { Title: '“The best time to plant a tree was 20 years ago.”', Type: 'Quote', Tags: ['mindset'], Source: '', Captured: '2026-05-17' },
    ],
  },
]

// ------------------------------------------------------------- instantiate
// Templates are added from the Workspace section, so they instantiate as
// 'shared' pages — visible to the whole team straight away.
export async function instantiateTemplate(def: TemplateDef, sortOrder: number): Promise<Page> {
  const page: Page = {
    id: uid(),
    parent_id: null,
    title: def.name,
    icon: def.icon,
    kind: def.kind,
    cover: null,
    sort_order: sortOrder,
    archived: false,
    visibility: 'shared',
  }
  await dbCreate('pages', page)

  if (def.kind === 'doc' && def.blocks) {
    let so = 1
    for (const b of def.blocks) {
      const blockId = uid()
      await dbCreate('blocks', {
        id: blockId,
        page_id: page.id,
        parent_id: null,
        type: b.type,
        text: b.text,
        checked: !!b.checked,
        props: b.emoji ? { emoji: b.emoji } : {},
        sort_order: so++,
      })
      if (b.children) {
        let cso = 1
        for (const c of b.children) {
          await dbCreate('blocks', {
            id: uid(),
            page_id: page.id,
            parent_id: blockId,
            type: c.type,
            text: c.text,
            checked: !!c.checked,
            props: {},
            sort_order: cso++,
          })
        }
      }
    }
  }

  if (def.kind === 'database') {
    const fieldByName = new Map<string, { id: string; type: FieldType; options: SelectOption[] }>()
    let fso = 1
    for (const tf of def.fields || []) {
      const options: SelectOption[] = (tf.options || []).map((o) => ({
        id: uid(),
        label: o.label,
        color: o.color,
      }))
      const field = {
        id: uid(),
        page_id: page.id,
        name: tf.name,
        type: tf.type,
        options,
        width: tf.width || 170,
        sort_order: fso++,
      }
      await dbCreate('db_fields', field)
      fieldByName.set(tf.name, { id: field.id, type: tf.type, options })
    }

    let vso = 1
    for (const tv of def.views || []) {
      const groupId = tv.groupBy ? fieldByName.get(tv.groupBy)?.id : undefined
      await dbCreate('db_views', {
        id: uid(),
        page_id: page.id,
        name: tv.name,
        type: tv.type,
        config: groupId ? { groupBy: groupId } : {},
        sort_order: vso++,
      })
    }

    let rso = 1
    for (const rec of def.records || []) {
      const props: Record<string, any> = {}
      for (const fname of Object.keys(rec)) {
        const f = fieldByName.get(fname)
        if (!f) continue
        const raw = rec[fname]
        if (f.type === 'select') {
          props[f.id] = f.options.find((o) => o.label === raw)?.id ?? null
        } else if (f.type === 'multi_select') {
          const labels = Array.isArray(raw) ? raw : [raw]
          props[f.id] = labels
            .map((l) => f.options.find((o) => o.label === l)?.id)
            .filter((x): x is string => !!x)
        } else {
          props[f.id] = raw
        }
      }
      await dbCreate('db_records', {
        id: uid(),
        page_id: page.id,
        props,
        sub_page_id: null,
        sort_order: rso++,
      })
    }
  }

  return page
}
