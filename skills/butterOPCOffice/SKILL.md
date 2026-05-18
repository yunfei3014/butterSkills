---
name: butterOPCOffice
description: Stand up your own butterOPCOffice — a team workspace app on Butterbase with Notion-style pages and databases, ⌘K semantic search over everything, email-domain-gated team auth, a shared workspace plus private pages, pre-seeded with the butterOPC operating framework (Direction, Operating Model, Operating Rhythm). Use when someone wants their own OPC office: "set up butterOPCOffice", "deploy an OPC workspace", "stand up an operating office for my team", "give my team an operating office".
---

# butterOPCOffice — stand up your team's operating office

butterOPCOffice is a deployable **team workspace**: a Notion-style app (nested pages, block editor, typed databases with table/board/gallery views) on a Butterbase backend, plus:
- a **shared team workspace** and **private pages** (Notion-style page visibility),
- **⌘K semantic search** — a floating "What are you looking for?" bar over every shared page and record, powered by Butterbase RAG,
- **email-domain-gated auth** — only your team's email domains can sign in,
- pre-seeded with the **butterOPC** operating framework so the team starts with Direction, Operating Model, and Operating Rhythm already in place.

This skill provisions one fresh office end-to-end on the running user's own Butterbase account.

**Prerequisites:** Butterbase MCP tools available; `node` and `npm` on PATH. Every office is provisioned on the running user's own Butterbase account — never a shared one.

## Step 0 — Gather inputs
Ask the user (AskUserQuestion or plain prose):
- **Office name** — e.g. "Acme office".
- **Team email domain(s)** — who may sign in, e.g. `acme.com` (one or more).
- **Custom domain** (optional) — e.g. `office.acme.com`. Skip and the office stays on its `{slug}.butterbase.dev` URL.

## Step 1 — Create the Butterbase app
`init_app`, name = a lowercase-hyphen slug of the office name (e.g. `acme-office`). Record the returned **`app_id`** — every later step needs it.

## Step 2 — Schema
`manage_schema` action `apply`, the app_id, `schema` = the parsed contents of `setup/schema.json` (6 tables: `pages`, `blocks`, `db_fields`, `db_records`, `db_views`, `shares`).
GOTCHA — a text column's `default` is a raw SQL expression: it must be quoted (`"'shared'"`, `"'doc'"`). An unquoted word is read as a column reference and the apply fails. `setup/schema.json` is already correct — keep it as-is.

## Step 3 — Row-Level Security
Follow `setup/rls.md` exactly: `enable` RLS on all 6 tables, then create the team-workspace policies. Verify with the `select_rows` `as_role` checks at the bottom of that file (anon → `[]`; a teammate → all shared pages). Never create an `anon` policy.

## Step 4 — RAG search index
`manage_rag_content` `create_collection`: name `butteropcoffice`, `access_mode` `shared`. The whole team queries one semantic index; only `visibility='shared'` pages are ingested, so private pages never surface in team search.

## Step 5 — Deploy the frontend
1. Copy `template/` to a working directory.
2. Edit `template/src/bb.ts`:
   - `APP_ID` default → the new `app_id`.
   - `ALLOWED_EMAIL_DOMAINS` → the team's email domain(s).
   Optionally edit `OFFICE_NAME` in `template/src/WorkspaceSettings.tsx` for a custom display name.
3. `npm install && npm run build && npm run zip` → produces `frontend.zip`.
4. `create_frontend_deployment` (app_id, framework `react-vite`) → returns an upload URL and deployment_id.
5. `curl -X PUT --data-binary @frontend.zip -H "Content-Type: application/zip" "<uploadUrl>"`.
6. `manage_frontend` `start_deployment` with the deployment_id. Poll to READY.

The office is now live at `https://{slug}.butterbase.dev`.

## Step 6 — Seed the butterOPC framework
Create these starter pages so the team opens to a structured office, not a blank one. All `visibility: 'shared'`. Insert via `insert_row` (a `pages` row, then its `blocks` / `db_fields` / `db_views` / `db_records`). JSON columns (`props`, `options`, `config`) are stored as text — JSON-stringify them on write.
- **Direction** — a `doc` page. Blocks: h1 "Direction", then h2 "Mission", "Vision", "Strategy", each with an empty paragraph to fill.
- **OKRs** — a `database` page. Fields: Objective (text, the title field), Key Result (text), Owner (select), Quarter (select), Status (select: On track / At risk / Off track), Progress (text). Add a Table view and a Board view grouped by Status.
- **Operating Model** — a `doc` page. h1 "Operating Model" plus a callout explaining vertical customer-value pillars × horizontal stakeholder support.
- **Operating Rhythm** — a `doc` page. h1 "Operating Rhythm" plus a to-do list: Annual / Quarterly / Monthly / Weekly / Daily cadence checkpoints.
- **Priorities** — a `database` page. Fields: Priority (text, the title field), Owner (select), Due (text), Status (select), Linked OKR (text).
For the full framework content, the team can run the `butterOPC` skill inside the office.

## Step 7 — Optional: custom domain and Google sign-in
- **Custom domain:** `manage_frontend` `configure_custom_domain` action `add` with the hostname. Relay the returned CNAME to the user to add at their DNS host; it auto-verifies and issues SSL. Then add the new origin (and the `.butterbase.dev` origin) to the app via `manage_app` `update_cors` so OAuth `redirect_to` is accepted.
- **Google sign-in:** the user creates a Google OAuth client (Web application; redirect URI `https://api.butterbase.ai/auth/{app_id}/oauth/google/callback`) and supplies the client id + secret; configure via `manage_oauth` `configure` provider `google`. Email/password auth works without this. The consent screen must be External + In production for outside-org domains to sign in.

## Step 8 — Report
Give the user the live URL. Tell them: the first person to sign in (with an allowed-domain email) creates the office; then click **"⟳ Reindex workspace"** in the sidebar once to populate the search index. Invite teammates by sharing the URL — anyone with an allowed-domain email signs in and is instantly a member with edit access to every shared page.

## Gotchas
- Schema text `default` values must be SQL-quoted (Step 2).
- RAG ingest/query REST endpoints accept only an end-user JWT, never a service key — the frontend handles this. Don't try to reindex with a service key.
- OAuth `redirect_to` origin must be in the app's `allowed_origins` or the auth start 400s.
- The search index starts empty — it fills on the first "Reindex workspace" click and stays fresh as records are edited.
- Never put a Butterbase service key, OAuth client secret, or any personal email into the deployed frontend — it ships only an app id and the allowed email domains.
