# butterSkills

The **butter skill family** — the company lifecycle as installable Claude Code skills.

```
butterOPC  ──▶  butterOPCOffice  ──▶  butterBuild  ⇄  butterRecipe / butterRecipeMaker
  design            run                  build         browse / make recipes
```

## Start here — which skill?

**Building a company?** Start with **butterOPC**. It designs the company — mission, vision, strategy, OKRs, the operating model, the operating rhythm. Then **butterOPCOffice** stands up a live team workspace to run it.

**Just building an app or a tool?** Skip the company layer. First run **butterRecipe** — check the Recipes Hub for a ready-made clone of what you need. If it exists, clone it and you're done. If not, **butterBuild** builds it, and **butterRecipeMaker** can turn that build into a recipe so the next person just clones. You do not need OKRs and an operating rhythm to ship a tool. Add butterOPC later — when you genuinely have a company to run, not before.

> The routing rule: **company → butterOPC. just building → butterRecipe first (clone if it exists), then butterBuild.**

## The family

| Skill | Stage | What it does | Plugin |
|-------|-------|--------------|--------|
| `butterOPC` | Design | Three-tier operating framework — Direction × Operating Model × Operating Rhythm. Design and audit a company. | butterSkills |
| `butterOPCOffice` | Run | Deploys a team workspace on Butterbase — Notion-style pages, ⌘K search, domain-gated auth, pre-seeded with the butterOPC framework. | butterSkills |
| `butterBuild` | Build | The build / QA / ship toolchain — browser, QA, codex review, design review, ship, deploy (~50 skills). | butterBuild (sibling) |
| `butterRecipe` | Browse | Browses the Recipes Hub — the catalog of cloneable apps. Find a ready-made recipe and clone it instead of building. | butterSkills |
| `butterRecipeMaker` | Recipe | Turns a build (or an OSS app) into a clonable Butterbase recipe. Checks the Hub first, scans for leaked secrets/PII, ships public, registers to the Hub. | butterSkills |

The recipe loop closes itself: **butterRecipe** checks the Hub *before* a build (clone what exists), **butterRecipeMaker** registers *after* a build (so the next `butterRecipe` finds it). Every recipe shipped makes the next build a clone.

## Install

`butterSkills` is a marketplace with two plugins.

**Core plugin** — butterOPC, butterOPCOffice, butterRecipe, butterRecipeMaker:

```
/plugin marketplace add yunfei3014/butterSkills
/plugin install butterSkills
```

**butterBuild** — the build/QA/ship toolchain — is a large monorepo with its own build system (~50 skills, browser binaries). It ships as a **sibling plugin** in the same marketplace and installs separately:

```
/plugin install butterBuild
```

> butterBuild's repo lands its compiled artifacts via its own build step — `node_modules` and binaries are never committed; they regenerate on install.

## /butterSkills

Run `/butterSkills` any time for the live catalog — what each skill does, when to use it, and where to start. The catalog (`catalog.json`) is the living source of truth and is updated as the family grows.

## License

MIT — Yunfei Ma
