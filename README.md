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
| Ceiling denial: an `Agent` call requesting a model above the *configured* ceiling in `orch.config.json` is actually denied, not just discouraged | The *true* hard cap — "never above whatever model is running this session" — since no hook can see which model is running the session, only what's saved in config. Keep the config ceiling in sync with reality via `/orch:set-max`. |
| Dispatch visibility: tier/effort is printed on every `Agent` call, unconditionally | Which tier/effort is *chosen* for a given task — the rubric is text, not a classifier |
| Delegation nudges: escalating reminders on direct `Bash`/`Edit`/`Write`/`Glob`/`Grep`/`MultiEdit`/`NotebookEdit` use, every time, reset every turn | Whether the model actually delegates after being nudged — nudges can be ignored |
| — | Effort-before-tier escalation order, reviewing subagent results before use, writing feedback-log entries, and the end-of-response summary — none of these have a hook checking they happened |

The practical upshot: **set a ceiling with `/orch:set-max` if you want the cost cap to be a real gate.** Without a configured ceiling, everything is policy-only.

## What it does

- **Hard cap (config-enforced part).** A `PreToolUse` hook denies any `Agent` dispatch requesting a model above the ceiling saved in `~/.claude/orch.config.json`. The stronger claim — never above whatever model is *currently running the session* — is policy-only, since a hook has no way to know that at runtime; keep the saved ceiling accurate for the enforced part to matter.
- **Ceiling.** On session start, reads your configured ceiling from `~/.claude/orch.config.json`. If none is set, it defaults to your own current model in the model's own behavior (policy-only until you set one), and the agent confirms that default with you near the start of the session.
- **Tier decision rubric.** Classifies each delegated subtask by concrete signals from the table above; classify by the task's hardest sub-step, not its average.
- **Effort before tier.** Every dispatch starts at the cheapest viable tier's *lowest* reasoning effort. If the result is unsatisfactory, retry the *same* tier at its *highest* effort before ever moving to a pricier tier. Only after a tier fails at its highest effort does escalation move up a tier — again starting at that tier's lowest effort.
- **Context isolation.** Multi-file grep/search/analysis work is never done inline in the main session — it's always delegated to an independent `Agent` call, so only the synthesized result comes back and the session's own context doesn't fill up with raw intermediate data.
- **Visible dispatch.** A `PreToolUse` hook deterministically prints which tier, agent type, and effort is being spawned and for what task, every time — this isn't left to the model to remember to narrate.
- **Escalating delegation nudges.** A second `PreToolUse` hook watches the main session's own direct tool calls (`Bash`, `Edit`, `Write`, `Glob`, `Grep`, `MultiEdit`, `NotebookEdit`). Each one used inline instead of via a delegated `Agent` call gets a nudge, escalating in severity per call — 1st is a suggestion, 2nd/3rd+ are sharper. Never blocks, just gets louder. The nudge is skipped entirely once an `Agent` has actually been dispatched that turn (the session is then in supervisory mode, not avoiding delegation), and never fires inside a subagent doing the delegated work itself. A `UserPromptSubmit` hook resets the counter at the start of every new user turn, so nudging pressure doesn't carry across turns.
- **Verification.** Every subagent result is reviewed by the current session model before being relied on — no silent pass-through.
- **Feedback loop.** If a result is unsatisfactory, `orch` escalates per the effort-then-tier ladder above, logs the outcome to `~/.claude/orch.feedback.jsonl`, and treats that log as routing memory — future similar subtasks start at whatever effort/tier fixed it last time.
- **End-of-response summary.** Every response ends with a one-line `orch:` summary of what actually ran that turn — either the tier(effort) of each delegated dispatch (e.g. `scout(low) x2, builder(high) x1`), or a complexity label (trivial/standard/complex) if the session handled it directly with no delegation. Sourced from the same `orch.turn-state.json` dispatch log the visible-dispatch hook writes to, not recalled from memory.
- Two commands to manage the ceiling: `/orch:status`, `/orch:set-max <tier>` (set-max also enforces the hard cap — it refuses to set a ceiling above your current session model).

## What it deliberately doesn't do (v1)

- The ceiling denial is the only hard block. Dispatch visibility and delegation nudges are deterministic but non-blocking; the *choice* of tier/effort, whether to delegate at all, and the end-of-response summary remain policy the main agent follows, not something a hook can force. See the enforcement table above.
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
- `~/.claude/orch.feedback.jsonl` — append-only log of verification/escalation outcomes, used as routing memory
- `~/.claude/orch.turn-state.json` — per-turn delegation-nudge counter, reset every user message. Single-session scope: if you run two Claude Code sessions from this machine at once, they currently share this file.

## Compatibility

Hooks: `SessionStart` (injects policy), `UserPromptSubmit` (resets the per-turn nudge counter), and `PreToolUse` matched to `Agent` (prints dispatch info) and to `Bash|Edit|Write|Glob|Grep|MultiEdit|NotebookEdit` (escalating delegation nudges). None of these block; they only print to stderr or inject context. No shared config paths with other plugins. Designed to coexist with other Claude Code plugins (developed alongside `compound-engineering`) without interference.
