# orch

A small Claude Code plugin: `orch` injects a routing policy each session so subagent delegation steps down to cheaper models and lower effort when the task doesn't need the full session model — with visible dispatch, verification of results, and a feedback log it uses as routing memory.

## Why

By default, every subagent spawned during a session runs at whatever model the main session is using, at full effort — even trivial work like a file read or a grep. `orch` doesn't change your own model; it only shapes how you delegate to the `Agent` tool, so mechanical work goes to a cheap tier at low effort, and only work that actually needs it climbs from there.

## Tiers

| Tier | Model | For |
|------|-------|-----|
| `scout` | `claude-haiku-4-5-20251001` | Read-only/mechanical: grep, reading a known file, status checks, simple lookups |
| `builder` | `claude-sonnet-5` | Standard implementation, debugging, synthesizing scout's results |
| `architect` | `claude-opus-5` | Architecture judgment, ambiguous scope, security-sensitive review, second-opinion verification |

## What's actually enforced vs. policy-trusted

Be clear-eyed about this before relying on it:

| Enforced by a hook (deterministic) | Policy-trusted (the model has to choose to comply) |
|---|---|
| **True hard cap:** `SessionStart` captures the session's actual model (Claude Code reports it in the `model` field on that event only) to `~/.claude/orch.session-cap.json`; every `Agent` dispatch is checked against the lower of that and your configured ceiling, and denied if it exceeds either | If `SessionStart` didn't report a model this run (happens after `/clear` or compaction), the previously captured cap is reused — if none was ever captured, there's nothing to enforce yet until a normal session start occurs |
| Dispatch visibility: tier/effort is printed on every `Agent` call, unconditionally | Which tier/effort is *chosen* for a given task — the rubric is text, not a classifier |
| Delegation nudges: escalating reminders on direct `Bash`/`Edit`/`Write`/`Glob`/`Grep`/`MultiEdit`/`NotebookEdit` use, every time, reset every turn | Whether the model actually delegates after being nudged — nudges can be ignored |
| **Live session effort:** `$CLAUDE_EFFORT` is set by Claude Code on every `PreToolUse` call and captured into `orch.turn-state.json` on every fire — this is genuinely fresh every turn, no staleness | **Live session model:** confirmed against Claude Code's own hooks reference — there is no hook event for a mid-session `/model` switch, and no hook after `SessionStart` ever receives a model field again. If the model changes mid-session, `orch` has no way to detect it automatically; the policy instructs the agent to self-update `orch.session-cap.json` if it becomes aware of a switch, but that's a manual mitigation for a real platform gap, not enforcement |
| — | Effort-before-tier escalation order, reviewing subagent results before use, writing feedback-log entries, and the end-of-response summary — none of these have a hook checking they happened |

## What it does

- **True hard cap.** `SessionStart` reads the actual model running this session straight from Claude Code's own hook input and persists it. A `PreToolUse` hook then denies any `Agent` dispatch above the lower of that captured model and your configured ceiling — a real, deterministic gate, not something the model is trusted to self-enforce.
- **Ceiling.** On session start, reads your configured ceiling from `~/.claude/orch.config.json`. If none is set, the effective ceiling is just the session's own model (still hook-enforced), and the agent confirms that with you near the start of the session.
- **Tier decision rubric.** Classifies each delegated subtask by concrete signals from the table above; classify by the task's hardest sub-step, not its average.
- **Effort before tier.** Every dispatch starts at the cheapest viable tier's *lowest* reasoning effort. If the result is unsatisfactory, retry the *same* tier at its *highest* effort before ever moving to a pricier tier. Only after a tier fails at its highest effort does escalation move up a tier — again starting at that tier's lowest effort.
- **Context isolation.** Multi-file grep/search/analysis work is never done inline in the main session — it's always delegated to an independent `Agent` call, so only the synthesized result comes back and the session's own context doesn't fill up with raw intermediate data.
- **Visible dispatch.** A `PreToolUse` hook deterministically prints which tier, agent type, and effort is being spawned and for what task, every time — this isn't left to the model to remember to narrate.
- **Escalating delegation nudges.** A second `PreToolUse` hook watches the main session's own direct tool calls (`Bash`, `Edit`, `Write`, `Glob`, `Grep`, `MultiEdit`, `NotebookEdit`). Each one used inline instead of via a delegated `Agent` call gets a nudge, escalating in severity per call — 1st is a suggestion, 2nd/3rd+ are sharper. Never blocks, just gets louder. The nudge is skipped entirely once an `Agent` has actually been dispatched that turn (the session is then in supervisory mode, not avoiding delegation), and never fires inside a subagent doing the delegated work itself. A `UserPromptSubmit` hook resets the counter at the start of every new user turn, so nudging pressure doesn't carry across turns.
- **Verification.** Every subagent result is reviewed by the current session model before being relied on — no silent pass-through.
- **Feedback loop.** If a result is unsatisfactory, `orch` escalates per the effort-then-tier ladder above, logs the outcome to `~/.claude/orch.feedback.jsonl`, and treats that log as routing memory — future similar subtasks start at whatever effort/tier fixed it last time.
- **Live session effort.** `$CLAUDE_EFFORT` (set by Claude Code on every `PreToolUse` call when the model supports it) is captured into `orch.turn-state.json` every time either `PreToolUse` hook fires, and persists across turns until it actually changes — a real, always-fresh read on the session's own effort level.
- **End-of-response summary.** Every response ends with a one-line `orch:` summary of what actually ran that turn — the tier(effort) of each delegated dispatch (e.g. `scout(low) x2, builder(high) x1`), or a complexity label (trivial/standard/complex) if the session handled it directly with no delegation, plus the live session effort if known. Sourced from `orch.turn-state.json`, not recalled from memory.
- Two commands to manage the ceiling: `/orch:status`, `/orch:set-max <tier>` (set-max also enforces the hard cap — it refuses to set a ceiling above your current session model).

## What it deliberately doesn't do (v1)

- The ceiling denial (both true-hard-cap and configured-ceiling forms) is the only hard block. Dispatch visibility and delegation nudges are deterministic but non-blocking; the *choice* of tier/effort, whether to delegate at all, and the end-of-response summary remain policy the main agent follows, not something a hook can force. See the enforcement table above.
- No multi-provider routing (Codex/Gemini/etc.) — Claude tiers only.
- No workflow DSL, no named profiles. The feedback log is a flat JSONL file, not a trained model.

## Install

```bash
/plugin marketplace add navindalmia/orch
/plugin install orch@orch
```

## Usage

```
/orch:status
/orch:set-max builder
```

## Files it creates

- `~/.claude/orch.config.json` — your configured ceiling (written by `/orch:set-max`)
- `~/.claude/orch.session-cap.json` — the actual session model, captured from `SessionStart`'s `model` field; the true hard cap is enforced against this
- `~/.claude/orch.feedback.jsonl` — append-only log of verification/escalation outcomes, used as routing memory
- `~/.claude/orch.turn-state.json` — per-turn delegation-nudge and dispatch-log state, reset every user message

All of these are single-session scope: if you run two Claude Code sessions from this machine at once, they currently share these files.

## Compatibility

Hooks: `SessionStart` (captures the session model, injects policy), `UserPromptSubmit` (resets per-turn state), and `PreToolUse` matched to `Agent` (enforces the ceiling, denies violations, prints dispatch info) and to `Bash|Edit|Write|Glob|Grep|MultiEdit|NotebookEdit` (escalating delegation nudges, never blocks). No shared config paths with other plugins. Designed to coexist with other Claude Code plugins (developed alongside `compound-engineering`) without interference.
