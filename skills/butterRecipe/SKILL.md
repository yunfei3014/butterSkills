---
name: butterRecipe
description: >-
  Browse and review every cloneable recipe on the Butterbase Recipes Hub — the
  catalog of ready-made apps (CRMs, form builders, Notion clones, status pages,
  and more) that anyone can one-click clone into their own Butterbase account.
  Reads the live Hub registry, presents the recipes with what each does, its
  GitHub repo and demo, and helps the user compare and clone the right one
  instead of building from scratch. Use when the user says "what recipes are
  available", "show me Butterbase recipes", "browse the recipes hub", "is there
  a recipe for X", "what can I clone", or whenever someone is about to build
  something — check the catalog first. Sibling of butterRecipeMaker, which
  builds NEW recipes; butterRecipe only reads and clones EXISTING ones.
allowed-tools:
  - Bash
  - Read
  - WebFetch
  - WebSearch
  - AskUserQuestion
  - Skill
---

# butterRecipe — browse the cloneable recipe catalog

Take a question — "is there a recipe for a CRM?", "what can I clone?", "show me
what's on the Hub" — and answer it from the live Butterbase Recipes Hub. This
skill is the **read side** of the recipe family: it never builds anything, it
shows the user what already exists and helps them clone it.

A **recipe** = a Butterbase app (Postgres schema + serverless functions +
static frontend) published so anyone can clone it into their own Butterbase
account. Cloning an existing recipe beats a fresh build on every axis — speed,
reliability, consistency. The first move before building should always be:
*does a recipe already exist?*

**The Recipes Hub:**
- Live: https://butterbase-recipes-hub.butterbase.dev
- App: `app_lcvgh8fc301s`
- Clone flow: paste a `bb_sk_` service key → pick a recipe → it clones into
  your account (tables + functions + frontend).

## Step 1 — Read the catalog

Pull the current recipe list. Two ways, prefer whichever is available:

1. **Hub registry (authoritative)** — read the `recipes` table (or config) on
   `app_lcvgh8fc301s` via the `mcp__butterbase__*` tools (`select_rows`). This
   is the live source of truth.
2. **Hub site** — `WebFetch` https://butterbase-recipes-hub.butterbase.dev and
   parse the rendered recipe cards.

For each recipe capture: name, what commercial product it echoes, one-line
description, GitHub repo, live demo URL, table list, function list, license.

## Step 2 — Present the catalog

Show the user a clean, scannable table. Default columns:

```
| Recipe | Clones | What it does | Demo | Repo |
|--------|--------|--------------|------|------|
```

If the user named a need ("a CRM", "a feedback board"), filter to the matches
and rank by fit — don't dump the whole list when they asked a specific question.
If nothing matches, say so plainly and point them at the build path (Step 4).

## Step 3 — Help them clone

When the user picks a recipe, walk them through the Hub clone flow:

1. Open https://butterbase-recipes-hub.butterbase.dev
2. Paste their Butterbase `bb_sk_` service key (their own account).
3. Select the recipe; the Hub clones schema + functions + frontend.
4. Confirm the clone landed — tables, functions, and a live frontend URL.

If a clone can be driven programmatically via the `mcp__butterbase__*` tools or
the Hub's API, offer to do it directly rather than making the user click. Never
ask for or handle the user's `bb_sk_` key in chat — it stays in the Hub UI.

## Step 4 — When there is no recipe (hand off)

If the catalog has nothing close, this skill's job is done — say so and hand
off: invoke **butterRecipeMaker** to build the recipe from scratch (find the
best OSS app, clean-room rebuild it on Butterbase, ship it, register it back to
the Hub). That closes the loop — the next person who runs butterRecipe finds it.

## Operating notes

- **Read-only.** butterRecipe inspects and clones; it never builds or modifies a
  recipe. Building is butterRecipeMaker's job.
- **Catalog is live.** Always read the Hub fresh — recipes are added over time.
  Don't answer "what's available" from memory.
- **Partial match is a fork.** If a recipe is close but missing something,
  surface it and let the user choose: clone-then-extend, or a fresh build via
  butterRecipeMaker. Don't decide for them.
- Never request, display, or store a user's `bb_sk_` service key.
