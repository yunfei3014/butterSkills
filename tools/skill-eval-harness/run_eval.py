#!/usr/bin/env python3
"""Run trigger evaluation for a skill description.

Tests whether a skill's description causes Claude to trigger (read the skill)
for a set of queries. Outputs results as JSON.
"""

import argparse
import atexit
import json
import os
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from scripts.utils import parse_skill_md


def find_project_root() -> Path:
    """Find the project root by walking up from cwd looking for .claude/.

    Used only to locate the user's installed skills; the eval itself runs
    each `claude -p` from a fresh, empty working directory (see
    run_single_query) so project-scoped memory and CLAUDE.md don't leak in.
    """
    current = Path.cwd()
    for parent in [current, *current.parents]:
        if (parent / ".claude").is_dir():
            return parent
    return current


def _skill_in_input(tool_input: dict, skill_name: str) -> bool:
    """True if a Skill tool's input invokes the given skill.

    Claude Code namespaces plugin skills (e.g. "caveman:caveman"); the
    skill-under-test is matched by its bare name or as the last path
    segment of a namespaced reference.
    """
    invoked = (tool_input or {}).get("skill", "")
    if not isinstance(invoked, str):
        return False
    return invoked == skill_name or invoked.split(":")[-1] == skill_name


def run_single_query(
    query: str,
    skill_name: str,
    skill_description: str,
    timeout: int,
    project_root: str,
    model: str | None = None,
) -> bool:
    """Run a single query and return whether the skill was triggered.

    Runs `claude -p` against the user's REAL installed skill (the one in
    ~/.claude/skills/<skill_name>), and detects triggering by watching for
    a `Skill` tool_use whose `skill` input equals `skill_name`.

    Two environment fixes vs. the original implementation:

    1. The original scaffolded a *slash-command* file in .claude/commands/
       and looked for `<name>-skill-<uid>` in a Skill/Read tool input.
       Slash commands are NOT model-invokable as the `Skill` tool, so a
       correct trigger was undetectable — the 0%-recall bug. We now test
       the real installed skill and match its real name.

    2. The original ran with cwd = project_root (the user's home / repo),
       which made `claude -p` load that project's CLAUDE.md and memory
       files. When the memory already contains the answer, the subprocess
       answers from memory and never needs any skill. We now run from a
       fresh empty temp directory with no .claude/, so no project memory
       or project CLAUDE.md leaks in. The user-level ~/.claude/skills/
       (where the skill-under-test lives) still loads normally.

    The candidate `skill_description` is applied by the caller (run_eval),
    which temporarily swaps it into the real SKILL.md frontmatter for the
    duration of the eval batch. `skill_description` is unused here.
    """
    del skill_description  # applied by run_eval via SKILL.md frontmatter swap

    # Fresh, empty cwd: no .claude/ -> no project memory / CLAUDE.md leakage.
    tmp_cwd = tempfile.mkdtemp(prefix="skilleval_")

    try:
        cmd = [
            "claude",
            "-p", query,
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
        ]
        if model:
            cmd.extend(["--model", model])

        # Remove CLAUDECODE env var to allow nesting claude -p inside a
        # Claude Code session. The guard is for interactive terminal conflicts;
        # programmatic subprocess usage is safe.
        #
        # Also strip API-key / token env vars. If ANTHROPIC_API_KEY (or a
        # token / base-url override) is present, `claude -p` routes billing
        # to that account instead of the CLI's stored subscription auth. A
        # dead/empty API account makes every subprocess exit 1 with
        # "Credit balance is too low". Dropping these vars lets the CLI fall
        # back to its own logged-in credentials.
        _strip = {
            "CLAUDECODE", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
        }
        env = {k: v for k, v in os.environ.items() if k not in _strip}

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            cwd=tmp_cwd,
            env=env,
        )

        triggered = False
        start_time = time.time()
        buffer = ""
        # Track state for stream event detection
        pending_tool_name = None
        accumulated_json = ""

        try:
            while time.time() - start_time < timeout:
                if process.poll() is not None:
                    remaining = process.stdout.read()
                    if remaining:
                        buffer += remaining.decode("utf-8", errors="replace")
                    break

                ready, _, _ = select.select([process.stdout], [], [], 1.0)
                if not ready:
                    continue

                chunk = os.read(process.stdout.fileno(), 8192)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue

                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    # Early detection via stream events.
                    #
                    # We return True the instant a `Skill` tool_use whose
                    # `skill` input equals skill_name is seen. We do NOT
                    # return False on unrelated tools or on `message_stop`:
                    # with --include-partial-messages a `message_stop` fires
                    # at the END OF EVERY assistant turn, and a typical run
                    # has many tool-using turns before it finishes.
                    # Concluding a non-trigger on the first message_stop
                    # truncates every multi-turn run. The only reliable
                    # end-of-run marker is the `result` event.
                    if event.get("type") == "stream_event":
                        se = event.get("event", {})
                        se_type = se.get("type", "")

                        if se_type == "content_block_start":
                            cb = se.get("content_block", {})
                            if cb.get("type") == "tool_use":
                                tool_name = cb.get("name", "")
                                if tool_name == "Skill":
                                    pending_tool_name = tool_name
                                    accumulated_json = ""
                                    # The skill name may already be in the
                                    # initial (non-streamed) input payload.
                                    if _skill_in_input(cb.get("input", {}), skill_name):
                                        return True
                                else:
                                    # Unrelated tool — keep watching, don't
                                    # accumulate JSON for it.
                                    pending_tool_name = None
                                    accumulated_json = ""

                        elif se_type == "content_block_delta" and pending_tool_name:
                            delta = se.get("delta", {})
                            if delta.get("type") == "input_json_delta":
                                accumulated_json += delta.get("partial_json", "")
                                # Match the skill name as a JSON string value.
                                if f'"{skill_name}"' in accumulated_json:
                                    return True

                        elif se_type == "content_block_stop":
                            # A Skill block finished. If it referenced the
                            # skill we'd already have returned True above.
                            pending_tool_name = None
                            accumulated_json = ""

                    # Fallback: full assistant message. Scan every tool_use
                    # in the message and mark `triggered` if the skill is
                    # invoked; never early-return here — later turns may
                    # still invoke the skill, and the run ends at `result`.
                    elif event.get("type") == "assistant":
                        message = event.get("message", {})
                        for content_item in message.get("content", []):
                            if content_item.get("type") != "tool_use":
                                continue
                            if content_item.get("name", "") != "Skill":
                                continue
                            if _skill_in_input(content_item.get("input", {}), skill_name):
                                return True

                    # The run is genuinely over. If we'd seen the skill we
                    # would already have returned True; reaching here means
                    # it never triggered.
                    elif event.get("type") == "result":
                        return triggered
        finally:
            # Clean up process on any exit path (return, exception, timeout)
            if process.poll() is None:
                process.kill()
                process.wait()

        return triggered
    finally:
        shutil.rmtree(tmp_cwd, ignore_errors=True)


def _backup_path(skill_md: Path) -> Path:
    """Sidecar file holding the original SKILL.md while a swap is active."""
    return skill_md.with_name(skill_md.name + ".skilleval-backup")


def restore_skill_md_if_needed(skill_md: Path) -> bool:
    """If a swap-backup sidecar exists, restore SKILL.md from it.

    Crash recovery: the eval swaps the candidate description INTO the real
    SKILL.md, leaving a `.skilleval-backup` sidecar with the original. A
    normal run deletes the sidecar after restoring. If the process is
    SIGKILLed mid-eval the sidecar survives — calling this on the next run
    (or manually) puts SKILL.md back. Returns True if a restore happened.
    """
    bak = _backup_path(skill_md)
    if bak.exists():
        skill_md.write_text(bak.read_text())
        bak.unlink()
        return True
    return False


def _swap_skill_description(skill_path: Path, new_description: str) -> str:
    """Write new_description into SKILL.md frontmatter; return the old text.

    Returns the full original SKILL.md content so the caller can restore it
    verbatim. Before mutating, the original is also written to a
    `.skilleval-backup` sidecar so a hard kill (SIGKILL / timeout) can be
    recovered from on the next run — a `finally` block alone does not
    survive SIGKILL. The candidate description is written as a YAML block
    scalar so quotes/newlines can't corrupt the frontmatter.
    """
    skill_md = skill_path / "SKILL.md"
    original = skill_md.read_text()
    # Crash-recovery sidecar — written BEFORE the mutation.
    _backup_path(skill_md).write_text(original)
    lines = original.split("\n")
    if lines[0].strip() != "---":
        raise ValueError("SKILL.md missing opening ---")
    # Locate the closing --- of the frontmatter.
    end_idx = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")

    # Find the `description:` key and the span of its value (key line plus
    # any indented continuation lines for a multiline scalar).
    desc_start = next(
        i for i in range(1, end_idx) if lines[i].startswith("description:")
    )
    desc_end = desc_start + 1
    while desc_end < end_idx and (
        lines[desc_end].startswith("  ") or lines[desc_end].startswith("\t")
    ):
        desc_end += 1

    indented = "\n".join("  " + ln for ln in new_description.split("\n"))
    new_block = ["description: |-", indented]
    new_lines = lines[:desc_start] + new_block + lines[desc_end:]
    skill_md.write_text("\n".join(new_lines))
    return original


def run_eval(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    num_workers: int,
    timeout: int,
    project_root: Path,
    runs_per_query: int = 1,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    skill_path: Path | None = None,
) -> dict:
    """Run the full eval set and return results.

    If skill_path is given and `description` differs from what's on disk,
    the candidate description is temporarily written into the real
    SKILL.md frontmatter for the duration of the eval, then restored. This
    is required because the eval now triggers the user's REAL installed
    skill — the only way to test a candidate description is to make the
    real skill carry it while the batch runs.
    """
    skill_md = (skill_path / "SKILL.md") if skill_path else None
    swapped = False

    if skill_md and skill_md.exists():
        # Recover from any prior crashed run before reading the on-disk desc.
        restore_skill_md_if_needed(skill_md)
        _, on_disk_desc, _ = parse_skill_md(skill_path)
        if description.strip() != on_disk_desc.strip():
            _swap_skill_description(skill_path, description)
            swapped = True

    def _restore():
        if swapped:
            restore_skill_md_if_needed(skill_md)

    # A `finally` block does not run on SIGTERM/SIGKILL — and the loop is
    # often wrapped in `timeout`, which SIGTERMs. Install a SIGTERM handler
    # plus an atexit backstop so a killed run still restores SKILL.md. (The
    # .skilleval-backup sidecar is the last-resort recovery for SIGKILL,
    # picked up by restore_skill_md_if_needed() on the next run.)
    prev_handler = None
    if swapped:
        atexit.register(_restore)

        def _sigterm(signum, frame):
            _restore()
            # Re-raise default behaviour so the process still terminates.
            signal.signal(signal.SIGTERM, signal.SIG_DFL)
            os.kill(os.getpid(), signal.SIGTERM)

        prev_handler = signal.signal(signal.SIGTERM, _sigterm)

    try:
        return _run_eval_inner(
            eval_set, skill_name, description, num_workers, timeout,
            project_root, runs_per_query, trigger_threshold, model,
        )
    finally:
        _restore()
        if prev_handler is not None:
            signal.signal(signal.SIGTERM, prev_handler)


def _run_eval_inner(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    num_workers: int,
    timeout: int,
    project_root: Path,
    runs_per_query: int,
    trigger_threshold: float,
    model: str | None,
) -> dict:
    """Run the eval batch (description already applied to SKILL.md)."""
    results = []

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        future_to_info = {}
        for item in eval_set:
            for run_idx in range(runs_per_query):
                future = executor.submit(
                    run_single_query,
                    item["query"],
                    skill_name,
                    description,
                    timeout,
                    str(project_root),
                    model,
                )
                future_to_info[future] = (item, run_idx)

        query_triggers: dict[str, list[bool]] = {}
        query_items: dict[str, dict] = {}
        for future in as_completed(future_to_info):
            item, _ = future_to_info[future]
            query = item["query"]
            query_items[query] = item
            if query not in query_triggers:
                query_triggers[query] = []
            try:
                query_triggers[query].append(future.result())
            except Exception as e:
                print(f"Warning: query failed: {e}", file=sys.stderr)
                query_triggers[query].append(False)

    for query, triggers in query_triggers.items():
        item = query_items[query]
        trigger_rate = sum(triggers) / len(triggers)
        should_trigger = item["should_trigger"]
        if should_trigger:
            did_pass = trigger_rate >= trigger_threshold
        else:
            did_pass = trigger_rate < trigger_threshold
        results.append({
            "query": query,
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": sum(triggers),
            "runs": len(triggers),
            "pass": did_pass,
        })

    passed = sum(1 for r in results if r["pass"])
    total = len(results)

    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Run trigger evaluation for a skill description")
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON file")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--description", default=None, help="Override description to test")
    parser.add_argument("--num-workers", type=int, default=10, help="Number of parallel workers")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout per query in seconds")
    parser.add_argument("--runs-per-query", type=int, default=3, help="Number of runs per query")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="Trigger rate threshold")
    parser.add_argument("--model", default=None, help="Model to use for claude -p (default: user's configured model)")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_path = Path(args.skill_path)

    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    name, original_description, content = parse_skill_md(skill_path)
    description = args.description or original_description
    project_root = find_project_root()

    if args.verbose:
        print(f"Evaluating: {description}", file=sys.stderr)

    output = run_eval(
        eval_set=eval_set,
        skill_name=name,
        description=description,
        num_workers=args.num_workers,
        timeout=args.timeout,
        project_root=project_root,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        model=args.model,
        skill_path=skill_path,
    )

    if args.verbose:
        summary = output["summary"]
        print(f"Results: {summary['passed']}/{summary['total']} passed", file=sys.stderr)
        for r in output["results"]:
            status = "PASS" if r["pass"] else "FAIL"
            rate_str = f"{r['triggers']}/{r['runs']}"
            print(f"  [{status}] rate={rate_str} expected={r['should_trigger']}: {r['query'][:70]}", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
