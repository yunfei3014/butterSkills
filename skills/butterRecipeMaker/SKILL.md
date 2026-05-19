---
name: butterRecipeMaker
description: >-
  Turn an open-source app into a clonable Butterbase recipe. Searches the OSS
  landscape for a given need, scores candidates on license + GitHub stars +
  security + maintenance, picks the best one, then clean-room rebuilds it as a
  Butterbase-native app (Postgres + functions + frontend), QAs it with
  butterbuild, scans it for leaked secrets and personal/API info, ships it to a
  public GitHub repo, and registers it with the
  Butterbase Recipes Hub so anyone can one-click clone it. Use when the user
  says "butterRecipeMaker", "make a recipe", "rebuild <OSS tool> on Butterbase",
  "find an OSS app to recipe-ify", or "turn <category> into a Butterbase app".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - AskUserQuestion
  - Skill
  - Agent
---

# butterRecipeMaker — OSS → Butterbase recipe pipeline

Take a need ("a form builder", "a CRM", "a status page"). Find the best
open-source app for it. Rebuild it clean-room as a Butterbase recipe. Ship it
public. Make it clonable.

A **recipe** = a Butterbase app (Postgres schema + serverless functions +
static frontend) that anyone can clone into their own Butterbase account from
the Recipes Hub. Existing family: pantry-CRM, butterNotion, butterForms.

Worked reference build: **butterForms** — github.com/yunfei3014/butter-forms,
live at butter-forms.butterbase.dev. Read it when in doubt; it is the template.

---

## The one rule that governs everything

**Every recipe is a clean-room rebuild. Always. No exceptions.**

Two independent reasons:

1. **Technical.** Butterbase is a BaaS — Postgres-as-REST, serverless
   functions, static hosting, auth, storage. It does not run MongoDB, Redis, or
   arbitrary long-running containers. Almost every self-hostable OSS app ships
   as a monolith that needs exactly those. You cannot lift-and-shift. You
   rebuild on Butterbase primitives.

2. **Legal.** A clean-room rebuild reimplements the *concept* (a form builder, a
   CRM). Concepts are not copyrightable. Source code is. So the license check
   below decides only one thing: **may you read the original source as
   reference, or must you treat it as a black-box feature spec.**

You never copy source files. You study the product, list its features, then
build fresh on Butterbase.

---

## Phase 0 — Scope

Get the need. If the user said "butterRecipe" with no target, ask via
AskUserQuestion: what category/job (form builder, CRM, status page, link-in-bio,
feedback board, scheduling, etc.). One question, then move.

Decide the recipe name now: `butter<Thing>` (butterForms, butterCRM) or the
butterGraveyard pattern if reviving a dead startup. Slug = kebab-case.

---

## Phase 0.5 — Check the Recipes Hub first (don't rebuild what exists)

Before any OSS discovery, check whether this need is *already* a clonable
recipe. The whole point of the recipe family is that work compounds — building
a second butterForms is wasted effort when the first is one click away.

Read the Recipes Hub registry on `app_lcvgh8fc301s` (its `recipes` table or
config) via the `mcp__butterbase__*` tools and compare the user's need against
the registered recipes.

- **Close match exists** — stop. Tell the user the recipe already exists, give
  the hub link (`https://butterbase-recipes-hub.butterbase.dev`), and offer to
  walk them through cloning it into their account. Cloning an existing recipe
  beats a fresh rebuild on every axis — speed, reliability, consistency.
- **Partial match** (a recipe is close but missing something) — surface it,
  and let the user choose: clone-then-extend, or a fresh build. Don't decide
  for them; this is a genuine fork.
- **No match** — proceed to Phase 1.

This check is cheap and it is the build/recipe loop closing on itself: every
recipe shipped makes the next "build" a clone instead of a rebuild.

---

## Phase 1 — OSS discovery

Find 4–8 candidate open-source projects for the need.

```
WebSearch: "open source <need> self-hosted"
WebSearch: "best open source <need> github 2026"
WebSearch: "<commercial leader> open source alternative"   # e.g. Typeform, Tally
```

For each candidate, capture: repo `owner/name`, one-line description, the
commercial product it clones.

Drop anything that is not actually open source (no public repo, "source
available" marketing only) — note it and move on.

---

## Phase 2 — Scorecard

Score every candidate on four axes. Pull hard data, do not guess.

### License — `gh` or fetch the LICENSE file

```bash
gh api repos/<owner>/<name> --jq '.license.spdx_id'
```

| Tier | Licenses | What it means for the recipe |
|------|----------|------------------------------|
| 🟢 Green | MIT, Apache-2.0, BSD-*, ISC, MPL-2.0 | Read the source freely as reference. Still clean-room rebuild. |
| 🟡 Yellow | GPL-2.0/3.0, AGPL-3.0, SSPL, BSL, Elastic | **Do not read or copy source.** Treat as a black-box feature spec — use the live product / docs / screenshots only. Clean-room rebuild stays MIT. |
| 🔴 Red | No license, proprietary, custom "no commercial" | Concept only. Strongly prefer a different candidate. |

The recipe you ship is always **MIT** — it is your own code.

### Stars — demand proof

```bash
gh api repos/<owner>/<name> --jq '.stargazers_count'
```

More stars = more validated demand for the *concept*. This is the main "is it
worth recipe-ifying" signal.

### Security — you study this code, don't inherit its mistakes

```bash
# open advisories
gh api repos/<owner>/<name>/security-advisories --jq 'length' 2>/dev/null
# known vulns via OSV
curl -s "https://api.osv.dev/v1/query" -d '{"package":{"name":"<name>","ecosystem":"npm"}}' | head -c 400
```

Note CVE history and whether the project handles auth/RLS/input-validation
well. The point: design the rebuild to *not* repeat known classes of bug. A
project with a bad security past is still a fine recipe target — you just fix
it on the way through.

### Maintenance

```bash
gh api repos/<owner>/<name> --jq '{pushed:.pushed_at,issues:.open_issues_count}'
```

Last push + open-issue load. A *loved but dead* project is a great recipe
candidate (same spirit as the butterGraveyard skills) — demand exists, nobody
maintains it, you revive it.

### Output — the scorecard table

```
| Project | Clones | License | ⭐ Stars | Security | Last push | Verdict |
|---------|--------|---------|---------|----------|-----------|---------|
| heyform | Typeform/Tally | 🟡 AGPL | 8.8k | clean | active | clean-room only |
| ...     |        |         |         |          |           |         |
```

Pick the winner: highest demand (stars) × cleanest fit for Butterbase
primitives. License tier does NOT eliminate a candidate — it only sets
read-source vs black-box. Present the pick with one line of reasoning, then
proceed (autonomous — do not wait for approval unless the user asked to choose).

---

## Phase 3 — Plan the Butterbase rebuild

Map the chosen product onto Butterbase primitives.

- **Schema** — tables in Butterbase's declarative DSL. JSON-shaped columns:
  store as `text`, not `jsonb` (platform REST has a nested-jsonb insert bug).
  FKs with `onDelete: CASCADE` where children belong to parents.
- **Functions** — one HTTP serverless function per surface. Public reads/writes
  = `auth: "none"` (guard manually). Owner/admin CRUD = a single scoped
  function keyed by a token or `ctx.user`. Always handle `OPTIONS` + send CORS
  headers — the static frontend is on a different origin.
- **Frontend** — single self-contained `index.html`, vanilla JS, hash router,
  zero build step. Deploy as framework `static`. (React-vite is fine for bigger
  recipes; default to single-file for reliability.)

Write a short build plan: table list, function list, frontend routes. Keep it
to a screen.

---

## Phase 4 — Build on Butterbase

Use the `mcp__butterbase__*` MCP tools directly. Sequence:

1. `init_app` — name `butter-<thing>`. Capture `app_id` + URLs.
2. `manage_schema` action `apply` — the schema from Phase 3.
3. `deploy_function` — each function (independent ones can deploy in parallel).
4. Smoke-test every function with `curl` before touching the frontend — create,
   read, update, validation-rejection, delete. Catch contract bugs early.
5. Build `index.html`. Set the `API` base const to the app's `/fn` URL.
6. `create_frontend_deployment` (framework `static`) → `PUT` the zip to the
   returned upload URL → `manage_frontend` action `start_deployment`.

This is exactly the butterForms build. If anything is unclear, read the
butterForms repo (github.com/yunfei3014/butter-forms) — schema.json,
functions/, index.html.

If the build is large, you may dispatch the schema/function/frontend work to
parallel `Agent` runs — but only when the pieces are genuinely independent.

---

## Phase 5 — QA with butterbuild

Do not hand-wave QA. Run the real thing.

1. **Smoke** — `/browse` (butterbuild browse binary): load the live site, check
   console for errors, screenshot, walk the core flow.
2. **Full QA** — invoke the `/qa` skill (butterbuild-qa) on the live recipe
   URL. It tests like a user, finds bugs, fixes them in source with atomic
   commits, re-verifies, and produces a before/after health score.

Do not ship a recipe that QA left below a healthy score. Fix or flag.

---

## Phase 5.5 — Secret & PII gate (HARD STOP before any public push)

The recipe goes to a **public GitHub repo** and a **public clone hub**. Anything
secret or personal in the recipe directory becomes world-readable and stays in
git history forever. This gate runs **before** Phase 6. It is not optional and
it is not advisory — if it finds a hit, you stop, strip, and re-scan until clean.

### What must never ship

- **API keys / tokens** — Butterbase `bb_sk_*` / `bb_pk_*`, `sk-*` (OpenAI),
  `sk-ant-*` (Anthropic), `ghp_*` / `gho_*` (GitHub), `AKIA*` (AWS),
  `nvapi-*` (NVIDIA NIM), Slack `xox*`, Stripe `sk_live_*`, JWT signing
  secrets, webhook URL-tokens, any `*_SECRET` / `*_TOKEN` / `*_PASSWORD` value.
- **Credential files** — `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`,
  `credentials.json`, `service-account*.json`, `.npmrc` with auth.
- **Personal / private info** — the repo owner's personal email (allowed *only*
  in `LICENSE` copyright and the git commit author; nowhere else), phone
  numbers, home address, other people's emails, internal app_ids for unrelated
  private apps.
- **Real data in seed/fixtures** — seed scripts and demo fixtures must contain
  only synthetic data. No real CRM contacts, no real customer rows, no scraped
  PII. If the build pulled from a real Butterbase app, scrub the seed.

### What is allowed to ship

- The recipe's own **public** URLs — `*.butterbase.dev` live demo, the `/fn`
  API base const in `index.html` (public endpoint, guarded server-side).
- The recipe's own source `app_id` (it is the public demo app).
- The repo owner's own email in `LICENSE` + commit author only.

### Run the scan

From the recipe directory, before `git init`:

```bash
cd <recipe-dir>
# 1. no credential files present
find . -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' \
  -o -name '*.key' -o -name 'id_rsa' -o -name 'service-account*.json' \
  -o -name 'credentials.json' \) -not -path './.git/*'

# 2. no secret-shaped strings in tracked content
grep -rnIE \
  'bb_sk_|bb_pk_|sk-ant-|sk-[A-Za-z0-9]{20}|ghp_[A-Za-z0-9]{20}|gho_[A-Za-z0-9]{20}|AKIA[A-Z0-9]{16}|nvapi-|xox[baprs]-|sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  . --exclude-dir=.git || echo "clean: no secret patterns"

# 3. secret-looking assignments
grep -rnIE '(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)\s*[:=]\s*["'\''][^"'\'' ]{8,}' \
  . --exclude-dir=.git || echo "clean: no secret assignments"

# 4. any email address outside LICENSE — review each hit; only the repo
#    owner's own email, in LICENSE / the commit author, is acceptable
grep -rnIoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' . --exclude-dir=.git | grep -vi 'LICENSE'
```

Also have an `Agent` (or read directly) review `index.html`, every
`functions/*.js`, and any seed/fixture file specifically for the four
categories above — regex misses context (a hardcoded key passed as a literal,
a real person's data in a demo row).

### Verdict — the gate

- **Any credential file, any secret string, any real PII → STOP.** Move the
  value to a Butterbase function env var (or delete the file), confirm the code
  reads it from `ctx.env` / process env, re-run the whole scan. Repeat until
  every check prints `clean`.
- A secret that already reached git history is not fixed by deleting the file —
  the recipe dir must be a fresh `git init` with no such commit. Never
  `git rm` a leaked secret and push; rebuild the history clean.
- Only when all four checks are clean **and** the manual review passed does
  Phase 6 begin. Record "secret/PII scan: clean" in the Phase 8 report.

---

## Phase 6 — Ship to public GitHub

The recipe code lives in a public repo under your own GitHub account.

Repo contents:
- `index.html` — the frontend
- `functions/*.js` — one file per Butterbase function
- `schema.json` — the declarative schema
- `LICENSE` — MIT, copyright the repo owner
- `README.md` — what it is, the clean-room note (why not a fork of the
  original), architecture (app_id, tables, functions), and self-host steps

```bash
cd <recipe-dir>
git init -q && git add -A
git commit -q -m "<recipe> — <one-line>. MIT.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
gh repo create butter-<thing> --public --source=. \
  --remote=origin --push --description "<one-line>. A Butterbase recipe."
```

The README clean-room note is mandatory when the original was 🟡 Yellow — state
plainly that this is a from-scratch implementation, no original source used, so
the MIT license is clean.

---

## Phase 7 — Make it clonable (Recipes Hub)

The Butterbase Recipes Hub lets anyone paste a `bb_sk_` key, pick a recipe, and
clone it into their own account:
**https://butterbase-recipes-hub.butterbase.dev/?v=polish3** (app
`app_lcvgh8fc301s`).

Register the finished recipe with the hub so it shows up as a clone target:

1. Read the hub's current recipe registry (its schema / a `recipes` table or
   config) via the `mcp__butterbase__*` tools on `app_lcvgh8fc301s`.
2. Add an entry: recipe name, slug, description, GitHub repo URL, live demo URL,
   source `app_id`, table list, function list.
3. Verify the recipe now appears on the hub and the clone action works
   end-to-end (clone into a scratch account, confirm tables + functions +
   frontend land).

If the hub's registry shape is unclear, inspect `app_lcvgh8fc301s` first and
match whatever pantry-CRM / butterNotion entries already use. Do not invent a
new format.

---

## Phase 8 — Report

Hand back, tight:

- Recipe name + live URL + GitHub URL
- The scorecard (what you evaluated, why this one won)
- License verdict (fork-readable vs black-box) and the MIT result
- QA health score
- Hub status: registered + clone verified

Then update memory: append the new recipe to `MEMORY.md` under the recipe
family, with app_id and URLs.

---

## Notes

- Caveman / voice settings of the session still apply to chat. Code, commits,
  README, and the README clean-room note are always written normally.
- Never copy source from a 🟡 Yellow project. The whole legal safety of the
  recipe family depends on this.
- Butterbase gotchas to carry into every build: JSON columns as `text`;
  PATCH/DELETE REST needs `/{table}/{id}` path params; `ctx.db.query`
  UPDATE/DELETE has no `rowCount` (use `RETURNING id`); functions need explicit
  CORS + `OPTIONS` handling.
