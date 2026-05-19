# skill-eval-harness — patched copies

Backup of three patched scripts from `skill-creator`'s description-optimizer
harness. The harness lives at `~/.claude/skills/skill-creator/scripts/` — a
local, non-repo, Anthropic-bundled skill. A skill-creator update would
overwrite these patches with no trace, so they are mirrored here.

These are **backup copies, not a runnable package.** To use them, copy back
over the originals in `~/.claude/skills/skill-creator/scripts/`.

## What was broken

The optimizer measured trigger accuracy at 0% recall even on verbatim queries,
then crashed on the improve step. Three bugs:

1. **`run_eval.py` — 0% recall.** `run_single_query` scaffolded a *slash-command*
   file and detected triggering by looking for it in a `Skill`/`Read` tool
   input. A slash command is a user-typed expansion, not model-invokable as the
   `Skill` tool — a correct trigger could never be detected. It also ran
   `claude -p` from `/Users/feiyun`, so the subprocess loaded the project
   `CLAUDE.md` + entire `memory/` dir (incl. the recipes-hub memo) and answered
   from memory instead of needing the skill.

2. **`improve_description.py` — `claude -p exited 1`.** No retry around the
   `claude -p` call, so one transient API failure crashed the whole loop.

3. **`run_eval.py` — SKILL.md corrupted on kill.** The swap-test edits the real
   `SKILL.md` and restores via `finally`, which does not run on SIGTERM. An
   outer `timeout` firing mid-batch left the candidate description in the file.

## The fixes

- `run_eval.py` — run `claude -p` from a fresh empty tempdir (no project memory
  leak; user-level skills still load); detect a real `Skill` tool_use by exact
  skill name; `.skilleval-backup` sidecar written before any `SKILL.md` mutation
  + SIGTERM handler + `atexit` backstop for SIGKILL recovery; new `skill_path`
  param on `run_eval`.
- `run_loop.py` — passes `skill_path` through to `run_eval`.
- `improve_description.py` — `_call_claude` wrapped in a 4-attempt retry
  (5/10/15s backoff); stderr captured in error messages.

## Caveat

Each eval `claude -p` is a ~60-90s cold start in this environment (SessionStart
hooks + 60+ skills load per spawn). A 60-invocation batch ≈ 7 min; a
3-iteration run ≈ 25-30 min. Do not wrap `run_loop` in a short `timeout`.

Patched and verified 2026-05-18.
