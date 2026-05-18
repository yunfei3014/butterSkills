# butterSkills

The **butter skill family** — the company lifecycle as installable Claude Code skills.

```
butterOPC  ──▶  butterOPCOffice  ──▶  butterBuild  ⇄  butterRecipeMaker
  design            run                  build         recipe-ify
```

## Start here — which skill?

**Building a company?** Start with **butterOPC**. It designs the company — mission, vision, strategy, OKRs, the operating model, the operating rhythm. Then **butterOPCOffice** stands up a live team workspace to run it.

**Just building an app or a tool?** Skip the company layer. Go straight to **butterBuild** (or Butterbase directly) and ship it. You do not need OKRs and an operating rhythm to build a form builder. Add butterOPC later — when you genuinely have a company to run, not before. Most builds never need the company layer at all.

> The whole routing rule: **company → butterOPC. just building → butterBuild.**

## The family

| Skill | Stage | What it does | Bundled |
|-------|-------|--------------|---------|
| `butterOPC` | Design | Three-tier operating framework — Direction × Operating Model × Operating Rhythm. Design and audit a company. | ✅ |
| `butterOPCOffice` | Run | Deploys a team workspace on Butterbase — Notion-style pages, ⌘K search, domain-gated auth, pre-seeded with the butterOPC framework. | ✅ |
| `butterBuild` | Build | The build / QA / ship toolchain — browser, QA, codex review, design review, ship, deploy (47 skills). | ⏷ separate |
| `butterRecipeMaker` | Recipe | Turns a build (or an OSS app) into a clonable Butterbase recipe. Checks the Recipes Hub first, scans for leaked secrets/PII, ships public, registers to the Hub. | ✅ |

The loop closes inside `butterRecipeMaker`: it checks the Recipes Hub **before** building (clone what exists) and registers **after** building (so the next build finds it). Every recipe shipped makes the next build a clone.

## Install

```
/plugin marketplace add yunfei3014/butterSkills
/plugin install butterSkills
```

This installs **butterOPC**, **butterOPCOffice**, and **butterRecipeMaker**.

**butterBuild** is a heavy toolchain (~1 GB — headless-browser binaries, 47 sub-skills) and ships on its own track, not bundled here. Install it separately when you need the build/QA/ship workflow.

## /butterSkills

Run `/butterSkills` any time for the live catalog — what each skill does, when to use it, and where to start. The catalog (`catalog.json`) is the living source of truth and is updated as the family grows.

## License

MIT — Yunfei Ma
