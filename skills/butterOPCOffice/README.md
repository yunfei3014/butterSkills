# butterOPCOffice

A one-command **team operating office** — a deployable Notion-style workspace on
[Butterbase](https://butterbase.ai), pre-seeded with the **butterOPC** operating
framework (Direction · Operating Model · Operating Rhythm).

This repo is a **Claude Code skill**. Run it and it provisions a fresh office for
your team end-to-end: backend, schema, row-level security, a semantic search
index, a deployed frontend, and a seeded operating framework.

## What you get

- **Notion-style workspace** — nested pages, a block editor, and typed databases
  with table / board / gallery views.
- **Team workspace + private pages** — shared pages every teammate can edit, and
  any page can be made private to its owner.
- **⌘K universal search** — a floating "What are you looking for?" bar with
  semantic search across every shared page and record.
- **Email-gated team auth** — only your team's email domains can sign in.
- **Pre-seeded butterOPC framework** — the office opens with Direction, OKRs,
  Operating Model, Operating Rhythm, and Priorities already in place.

## Install

Copy this folder into your Claude Code skills directory:

```
cp -r butterOPCOffice ~/.claude/skills/
```

## Use

In Claude Code:

```
/butterOPCOffice
```

It asks for an office name, your team's email domain(s), and an optional custom
domain, then provisions everything on **your own** Butterbase account.

## Layout

- `SKILL.md` — the provisioning workflow.
- `setup/schema.json` — the Butterbase database schema (6 tables).
- `setup/rls.md` — the team-workspace row-level-security policies.
- `template/` — the office frontend (Vite + React + TypeScript), deployed per office.

## Requirements

- A [Butterbase](https://butterbase.ai) account — the office is provisioned on it.
- `node` and `npm`.
- Claude Code with the Butterbase MCP tools available.

## License

MIT — see `LICENSE`.
