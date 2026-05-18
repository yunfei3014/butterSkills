# RLS — team-workspace model

The office is a **team workspace**: a page with `visibility='shared'` is visible
and editable by every signed-in teammate; `visibility='private'` restricts it to
its owner plus anyone in the `shares` table. Anonymous (no-login) requests get
nothing — never create an `anon` policy.

Apply with `manage_rls`. First `enable` RLS on each of the 6 tables (this also
auto-creates the `*_service_bypass` policy for the platform key — leave it).
Then create these policies, all scoped to `role: "user"`.

`U` below = `(current_user_id())::uuid`.

## pages

- **pages_select** (SELECT) — `using`:
  `visibility = 'shared' OR owner_id = U OR EXISTS (SELECT 1 FROM shares s WHERE s.page_id = pages.id AND s.invitee_id = U)`
- **pages_insert** (INSERT) — `with_check`: `owner_id = U`
- **pages_update** (UPDATE) — `using` AND `with_check`:
  `visibility = 'shared' OR owner_id = U OR EXISTS (SELECT 1 FROM shares s WHERE s.page_id = pages.id AND s.invitee_id = U AND s.role = 'editor')`
- **pages_delete** (DELETE) — `using`: same expression as pages_update.

## blocks, db_fields, db_records, db_views

For each table `T`, the access follows the parent page. `_select` uses the
read expression, `_insert`/`_update`/`_delete` use the write expression.

- **T_select** (SELECT) — `using`:
  `EXISTS (SELECT 1 FROM pages p WHERE p.id = T.page_id AND (p.visibility = 'shared' OR p.owner_id = U OR EXISTS (SELECT 1 FROM shares s WHERE s.page_id = p.id AND s.invitee_id = U)))`
- **T_insert** (INSERT) — `with_check`: the write expression below.
- **T_update** (UPDATE) — `using` AND `with_check`: the write expression below.
- **T_delete** (DELETE) — `using`: the write expression below.

Write expression:
`EXISTS (SELECT 1 FROM pages p WHERE p.id = T.page_id AND (p.visibility = 'shared' OR p.owner_id = U OR EXISTS (SELECT 1 FROM shares s WHERE s.page_id = p.id AND s.invitee_id = U AND s.role = 'editor')))`

## shares

- **shares_select** (SELECT) — `using`: `owner_id = U OR invitee_id = U`
- **shares_insert** (INSERT) — `with_check`: `owner_id = U AND EXISTS (SELECT 1 FROM pages p WHERE p.id = shares.page_id AND p.owner_id = U)`
- **shares_update** (UPDATE) — `using` AND `with_check`: `owner_id = U`
- **shares_delete** (DELETE) — `using`: `owner_id = U`

## Verify

After applying, confirm with `select_rows`:
- `as_role: "anon"` on `pages` and `db_records` → must return `[]` (anon locked out).
- `as_role: "user", as_user: "<any user id>"` on `pages` → returns all `visibility='shared'` pages (team-wide visibility works).
