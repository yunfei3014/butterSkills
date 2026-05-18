---
description: Show the butterSkills family catalog — what each skill does, when to use it, and where to start.
---

Read `${CLAUDE_PLUGIN_ROOT}/catalog.json` and present it to the user as a clear, scannable catalog.

Render it in this order:

1. **The lifecycle line** — `butterOPC -> butterOPCOffice -> butterBuild <-> butterRecipeMaker`, with the one-word stage under each (design / run / build / recipe).

2. **Where to start** — surface the `start_here` block prominently, before the table. This is the most important part. Two paths:
   - **Building a company?** Start with **butterOPC** — design the company first, then butterOPCOffice to run it.
   - **Just building an app or tool?** Skip the company layer. Go straight to **butterBuild**. You do not need OKRs and an operating rhythm to ship a tool — add butterOPC later, only when you actually have a company to run.
   - State the rule plainly: **company -> butterOPC, just building -> butterBuild.**

3. **The skill table** — one row per skill: name, stage, what it does, when to use it, when to skip it. Mark which skills are bundled in this plugin and which install separately (butterBuild).

Keep it tight. `catalog.json` is the living source of truth — it is updated as the family grows, so always read it fresh rather than answering from memory.
