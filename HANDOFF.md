# orch — session handoff

Read this before making changes. It captures state, decisions, and open issues that aren't derivable from the code alone.

## What orch is

A Claude Code plugin (`~/.claude/plugins/marketplaces/orch`, source at `github.com/navindalmia/orch`) that routes subagent delegation to cheaper models/lower effort automatically, capped at a hard ceiling, with visible dispatch and an enforced end-of-turn summary. Built from scratch this session — not based on any prior tool, though the design was informed by studying (not copying) several other Claude Code orchestration plugins: `barkain/claude-code-workflow-orchestration` (soft-enforcement nudge pattern, `UserPromptSubmit`+`PreToolUse` combo), Gearbox (tier/escalation concept), `oh-my-claudecode` (for scale/polish reference only).

## Current status: functional, version 0.2.1, verified working in a live session

As of the last test, the plugin loads (`claude plugin list` → `✔ enabled`) and all mechanisms fired correctly in a real session: hard-cap enforcement, dispatch visibility, delegation nudges, and the `Stop`-hook-enforced summary line.

## Architecture (all hooks, no external deps beyond Node)

- `.claude-plugin/plugin.json` / `marketplace.json` — manifest + self-marketplace. **Do NOT add a `"hooks"` field to plugin.json** — Claude Code auto-loads `hooks/hooks.json` by convention; an explicit reference causes a duplicate-load conflict and the whole plugin silently fails to load. (This was the root cause of a full-session debugging episode — see "Debugging history" below.)
- `hooks/tiers.js` — shared tier/model mapping: `scout`=`claude-haiku-4-5-20251001`, `builder`=`claude-sonnet-5`, `architect`=`claude-opus-5`.
- `hooks/turn-state.js` — shared state file (`~/.claude/orch.turn-state.json`): violations, delegatedThisTurn, dispatches[], sessionEffort, summaryNudges. Reset per-turn by `user-prompt-submit.js`, except `sessionEffort` which persists across turns (it's session-wide, not per-turn).
- `hooks/session-start.js` (`SessionStart`) — reads the session's actual model from the `model` field (only `SessionStart` ever receives this, confirmed against Claude Code's official hooks docs), persists it to `~/.claude/orch.session-cap.json`, and injects the full routing policy as `additionalContext`.
- `hooks/agent-dispatch.js` (`PreToolUse`, matcher `Agent`) — computes `effectiveCeiling()` = lower of configured ceiling (`orch.config.json`) and captured session model (`orch.session-cap.json`); **denies** (`permissionDecision: "deny"`) any dispatch requesting a model above that. If allowed, prints the dispatch line and logs tier/effort to turn-state.
- `hooks/require-delegation.js` (`PreToolUse`, matcher `Bash|Edit|Write|Glob|Grep|MultiEdit|NotebookEdit`) — escalating nudges (never blocks) when the main session does this work inline instead of delegating. Skips subagents (checks `CLAUDE_PARENT_SESSION_ID`/`CLAUDE_AGENT_ID`) and skips once a delegation has happened that turn.
- `hooks/check-summary.js` (`Stop`) — reads `last_assistant_message` (a real field Claude Code provides on `Stop`), checks for an `orch:` marker; if missing, **blocks** the stop with the exact data to report, capped at one nudge per turn (`summaryNudges`) to avoid an infinite loop.
- `hooks/user-prompt-submit.js` (`UserPromptSubmit`) — resets per-turn state at the start of every user message.
- `skills/status/SKILL.md`, `skills/set-max/SKILL.md` — `/orch:status`, `/orch:set-max <tier>`.

## Key design decisions and why

- **Named tiers** (scout/builder/architect) instead of raw model IDs, per explicit user request, for readability in dispatch logs and summaries.
- **Hard cap is real, not just configured**: originally only enforced against `orch.config.json`'s `maxModel`. User pushed back ("don't you have a way to fetch the current model"), which led to discovering `SessionStart`'s `model` field — now the *true* session model is captured and enforced, not just a manually-set value that could drift from reality.
- **Effort tracked live via `$CLAUDE_EFFORT`**: confirmed via official docs this is a real env var on every `PreToolUse`/`PostToolUse`/`Stop`/`SubagentStop` call. No live equivalent exists for model changes mid-session (confirmed: no hook event fires on `/model` switch, and no hook after `SessionStart` ever gets a model field again) — this is a documented, unfixable platform gap, not something orch failed to build. The policy tells the agent to self-update `orch.session-cap.json` if it becomes aware of a mid-session model switch, as the only available mitigation.
- **`Stop` hook > policy text alone for the summary requirement**: the summary was originally just an instruction in the `SessionStart`-injected policy, and it reliably got forgotten over a session (reported directly by the user testing a real session). Fixed by adding `check-summary.js`, which actually reads the final response text and force-corrects a missing summary — capped at one retry per turn.
- **Escalation is effort-before-tier**: user explicitly wants cheapest-tier-lowest-effort tried first, only escalating effort within the same tier before ever moving to a pricier tier.
- **Policy is domain-agnostic**: originally the rubric leaned code/file-search-heavy; user clarified it must apply to any task type (web search, research, writing), with zero explicit invocation needed from the user ("always on, no hinting").

## Debugging history worth knowing

1. **The plugin never actually loaded, for the entire first 9 commits.** `plugin.json` had `"hooks": "./hooks/hooks.json"`, which conflicts with Claude Code's auto-loading convention. `claude plugin list` showed `Status: ✘ failed to load` the whole time — none of the hooks had ever executed in a real session; only verified via manual stdin/stdout script testing, which doesn't catch a plugin-load failure. Fixed in commit `54f1d3f`.
2. **Plugin cache is version-keyed and doesn't auto-invalidate.** After fixing the manifest, `claude plugin update` reported "already at latest" and the marketplace clone had the fix, but the *cache* directory (`~/.claude/plugins/cache/orch/orch/0.1.0/`) was stale because the version number never changed. Had to bump `version` in both `plugin.json` and `marketplace.json` (0.1.0 → 0.2.0 → 0.2.1 so far) and manually `rm -rf` the cache dir once to force a clean re-fetch. **Lesson: bump the version on every hook-content change going forward**, or updates silently won't take effect.
3. If a *different, already-running* session has the old cache path loaded in memory, it'll error with "Plugin directory does not exist" after a cache wipe — that session needs `/plugin` reinstall or a restart, not a fix on the repo side.
4. The `Stop` hook's `decision: "block"` renders under Claude Code's own "Stop hook error" UI chrome no matter what the `reason` text says — this is not fixable from the hook's JSON output without giving up the actual enforcement (the non-blocking alternative, `additionalContext`, wouldn't force compliance). Only the message text itself was softened (commit `9eba255`).

## Known open gaps (by design, not oversight)

- No hard block on tier/effort *choice* itself — only the ceiling and the summary are hook-enforced. Which tier/effort to pick, effort-before-tier ordering, and reviewing subagent results before use are all still policy the model has to choose to follow.
- No mid-session model-switch detection (platform limitation, see above).
- Single-session-scope state files — two concurrent Claude Code sessions on the same machine would currently share `orch.turn-state.json` etc.
- No multi-provider routing (Codex/Gemini/etc.), no workflow DSL, no named profiles — deliberately out of scope for v1 per "keep it simple."

## Next candidate refinements (not yet requested, just visible from testing)

- Feedback-log-driven learning (`orch.feedback.jsonl`) is specified in the policy but never observed in practice yet — worth checking after more real usage whether the model actually writes to it.
- Consider whether `check-summary.js`'s single-nudge cap is too permissive (a model that ignores the nudge once just gets away with it) or exactly right (avoids infinite stalls) — no real-world data yet on how often the second attempt still fails.
- The "always on, no invocation" ambient application to *non-coding* tasks (e.g. "find a good laptop") has been specified in policy but not yet observed/tested in a live session.
