---
name: butterOPC
description: Apply Feii's three-tier operating framework (butterOPC) — Direction (Mission/Vision/Strategy/OKRs) × Operating Model (vertical customer-value pillars × horizontal stakeholder support) × Operating Rhythm (Annual to Daily) — on a settling Foundation. The OKR is the framework's spine, the single linkage between Strategy (upstream) and execution priorities (living inside operating model cells downstream). Use this skill whenever the user wants to plan, refresh, audit, or apply the framework to any venture — Butterbase, Beta Network (Beta Fund + Beta University), consulting, the fund. Trigger on phrases like "operating framework," "butterOPC," "operating model," "OKRs," "priorities," "company OS," "operating rhythm," "weekly review," "quarterly planning," or any strategy-to-execution question. CRITICAL — when activated, ALWAYS start with clarifying questions (which venture, current state, session goal, time horizon, multi-venture context) before producing output. Never skip this step.
---

# butterOPC — Operating Framework

Feii's three-tier operating framework with a settling foundation. Used across Butterbase, Beta Network (Beta Fund + Beta University), consulting, and the fund.

## ALWAYS start with clarifying questions

When this skill triggers, **do not jump to applying the framework**. The quality of the output depends on the quality of upfront context-gathering. Ask the user the following — adjust based on what's already clear from conversation context:

1. **Which venture or instance?**
   - Butterbase
   - Beta Network as a whole, or Beta Fund / Beta University as separate instances
   - Consulting
   - The fund (separate from Beta Fund)
   - A new instance entirely

2. **What's the current state?**
   - Fresh start (no existing Direction doc)
   - Refreshing existing setup (have a doc but it's stale or needs updates)
   - Mid-quarter execution (reviewing what's in flight)
   - End-of-period audit (looking back to inform next cycle)

3. **What's the goal of this session?**
   - Draft a full venture page (M/V, Strategy, OKRs, cell priorities)
   - Set or refresh OKRs for a period
   - Allocate priorities into operating model cells
   - Audit existing OKRs/priorities for cell-mapping and balance
   - Design the operating rhythm (cadence)
   - Render the framework diagram for sharing

4. **Time horizon?** This week, this month, this quarter, this year?

5. **Multi-venture context?** How does this venture sit alongside the others? Is there cross-venture overlap (resources, talent, attention) to surface?

Ask these in prose, not all at once — start with the venture and goal, then drill into specifics. Wait for answers before producing framework output. If the user says "just give me the framework already," respect that and proceed — but err on the side of asking when context is thin.

## Framework structure

Three tiers + settling foundation:

### Direction (Why and what)

Three components, cascading:

- **Mission · Vision** — why we exist, where we're going (enduring; refreshed annually at most)
- **Strategy** — how we win (annual refresh)
- **OKRs** — what we measure (quarterly; each OKR tagged to a specific operating model cell)

**Important: Priorities are NOT a separate Direction concept.** They live inside Operating Model cells (see below). The Direction tier ends at OKRs.

Bidirectional flow between Strategy and OKRs: Strategy drives → OKRs. Learning returns: OKRs → Strategy.

### OKR · the key linkage (the spine)

The OKR is the **single linkage** between strategic direction and operational execution. Every OKR has two pointers:

- **UP:** to Strategy (the why this OKR matters)
- **DOWN:** to a specific Operating Model cell (the where the work happens, with priority stack living inside the cell)

If an OKR doesn't map cleanly to a cell, it's a vanity metric or strategic ambiguity. The mapping forces clarity AND surfaces investment imbalance immediately.

The framework's spine is: **Strategy → OKR → Cell (with priority stack)**. The OKR is the connective tissue. Everything else hangs off this.

### Operating Model (How)

A grid: three vertical customer-value pillars × one horizontal stakeholder support layer.

**Three vertical customer-value pillars** (sequential gates, not parallel):
- **Create value · Engagement** (Product function)
- **Capture value · Monetize** (Sales function)
- **Scale value · Growth** (GTM function)

The keywords (Engagement → Monetize → Growth) are a FUNNEL — sequential gates, not a list. You can't monetize without engagement, you can't scale before monetization works. A common startup failure is trying to scale (third gate) before closing monetization (second gate).

**Each pillar contains a priority stack:**
- Each cell holds the current priorities serving its OKR(s)
- Max 3 priorities per cell
- **Most cells should be empty in a given quarter** — the empty cells are the focus signal
- If every cell is full, you haven't chosen; you've just listed

**Horizontal stakeholder support layer** (supports all three pillars equally):
- Talent · People · Employees
- Capital · Finance · Investors
- License · Legal · Regulators

Stakeholder cells also have priority stacks operationally, but they're typically background work unless a particular quarter is dominated by a stakeholder bet (e.g., fundraising quarter = Capital · Finance is loud).

### Operating Rhythm (When)

Cadence translates direction into action:

- **Annual** — refresh Direction (Mission/Vision/Strategy/yearly OKRs); rebalance investment across cells
- **Quarterly** — set quarterly OKRs; pick bets; walk every Op Model cell
- **Monthly** — review OKR progress; check each cell's metrics
- **Weekly** — refresh priority stacks in each cell; plan next week
- **Daily** — ship work; capture artifacts in workspace

### Foundation · the settling layer

Where everything **settles** for future insight. The Chinese term 沉淀 (chéndiàn — to sediment, to precipitate) captures this exactly: workspace artifacts don't just accumulate, they SEDIMENT into knowledge over time.

What settles here:
- Mission/Vision statements
- Strategy docs (versions across years)
- OKR cycles (Q1, Q2, ...)
- Priority stacks per cell (week by week, quarter by quarter)
- Operating rhythm outputs (meeting notes, weekly reviews, monthly reviews, quarterly retros, annual offsites)
- Decisions and learnings (the explicitly-distilled knowledge layer)

**Tools that hold the workspace (live state):**
- **Granola** — meeting recordings, transcripts
- **Google Workspace** — email, calendar, files
- **Linear** — task management

**The knowledge layer (what persists):**
- Distilled decisions, learnings, playbooks — compressed from workspace artifacts on a weekly cadence
- Available for future strategic analysis, retros, AI-assisted reviews

The discipline of compressing weekly artifacts into "what we decided / what we learned" is what turns workspace data into compounding institutional intelligence. Workspace fills itself; knowledge does not — someone has to do the settling.

## How to apply the framework

After clarifying questions are answered, work through the user's request using these moves:

1. **Identify which tier the question lives in.** Purpose → Direction (M/V). Measurement → Direction (OKRs). Value-creation → Op Model. Cadence → Op Rhythm. Tooling/memory → Foundation.

2. **Check the spine.** For any OKR mentioned: which cell? For any priority mentioned: which OKR does it ladder up to? For any cadence: what gets captured and where does it settle?

3. **Surface investment imbalance.** If most OKRs cluster in one cell, name the cell being avoided and ask why. (Common pattern: founders avoid Capture value because monetization conversations feel premature.)

4. **Apply the priority test.** If priorities are an inbox (5+ items per cell, all "ongoing"), they're not priorities. Force a cut. Remember: most cells should be empty.

5. **Apply the settling test.** If the user describes a process that doesn't end with something landing in a persistent location, the foundation is broken. Name it.

6. **Render the diagram when useful.** When a visual would help — explaining the framework, showing where a piece fits, refreshing someone's mental model — use the SVG template in `references/diagram-template.svg` via the visualizer tool.

## Multi-venture pattern

For founders running multiple ventures, each venture is its own instance of the framework:
- Each gets its own Direction doc, Operating Model dashboard, Operating Rhythm
- Foundation is shared (one settling layer across all ventures)
- Integration point is the founder: a monthly cross-venture review where attention is rebalanced

**Do NOT merge OKRs across ventures.** They serve different stakeholders, customers, and timelines. Keep them parallel; the founder is the integrator.

**Special case: Beta Network = Beta Fund + Beta University.** These are two divisions of one entity. Two valid setups:
- **One instance** with both divisions under one Direction doc, separate priority stacks per division within shared cells
- **Two instances** with separate Direction docs, integration at the "Beta Network" level via the founder

Choose based on whether Strategy/OKRs are deeply intertwined (one instance) or independently planned (two instances). When unsure, ask the user.

## Anti-patterns to flag

- **OKR without a cell.** Vanity or strategic ambiguity. Push back, ask which cell.
- **Every cell full.** Not allocation — that's an inbox. Force a cut.
- **No empty cells in the quarter.** Means no focus has been chosen. Question.
- **Foundation as decoration.** Workspace exists but knowledge never gets distilled. Settling layer is fiction.
- **Stale Direction doc.** Months old. The framework is correct only if the doc is current.
- **Cross-venture OKR merging.** Loses clarity. Keep ventures parallel.
- **Scaling before monetizing.** Resources going into Scale value while Capture value has unsolved gates. Funnel order violation.

## Worked example: bad OKR vs good OKR

**Bad:** "Improve developer experience."

Why it's bad: doesn't map to a specific cell. Is this Create value (Engagement)? Capture value (Monetize)? Talent · People (reducing support load)? The lack of mapping reveals strategic ambiguity.

**Better:** "Reduce time-to-first-deploy from 30 minutes to 5 minutes by end of Q1."

Why: maps clearly to Create value / Engagement (specifically activation). Measurable. Time-bound. Implies specific priorities in the Create value cell.

## Reference files

- `references/diagram-template.svg` — Canonical SVG for the framework diagram. Use via the visualizer tool.
- `references/venture-page-template.md` — Notion-ready template for a full venture instance (Direction, Operating Model dashboard, Rhythm pointers, Foundation pointers).
