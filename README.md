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

## What it does

- **Hard cap.** The ceiling can never exceed whatever model is currently running the session — regardless of what's saved in config. You can't spawn something pricier than yourself.
- **Ceiling.** On session start, reads your configured ceiling from `~/.claude/orch.config.json` (subject to the hard cap above). If none is set, it defaults to your own current model, and the agent confirms that default with you near the start of the session.
- **Tier decision rubric.** Classifies each delegated subtask by concrete signals from the table above; classify by the task's hardest sub-step, not its average.
- **Effort before tier.** Every dispatch starts at the cheapest viable tier's *lowest* reasoning effort. If the result is unsatisfactory, retry the *same* tier at its *highest* effort before ever moving to a pricier tier. Only after a tier fails at its highest effort does escalation move up a tier — again starting at that tier's lowest effort.
- **Context isolation.** Multi-file grep/search/analysis work is never done inline in the main session — it's always delegated to an independent `Agent` call, so only the synthesized result comes back and the session's own context doesn't fill up with raw intermediate data.
- **Visible dispatch.** A `PreToolUse` hook deterministically prints which tier, agent type, and effort is being spawned and for what task, every time — this isn't left to the model to remember to narrate.
- **Verification.** Every subagent result is reviewed by the current session model before being relied on — no silent pass-through.
- **Feedback loop.** If a result is unsatisfactory, `orch` escalates per the effort-then-tier ladder above, logs the outcome to `~/.claude/orch.feedback.jsonl`, and treats that log as routing memory — future similar subtasks start at whatever effort/tier fixed it last time.
- Two commands to manage the ceiling: `/orch:status`, `/orch:set-max <tier>` (set-max also enforces the hard cap — it refuses to set a ceiling above your current session model).

## What it deliberately doesn't do (v1)

- No hard blocking of tool calls for tier/effort selection itself — dispatch visibility is enforced by a hook, but the *choice* of tier/effort is still a policy the main agent follows, not a programmatic gate.
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

## Compatibility

Hooks: `SessionStart` (injects policy) and `PreToolUse` matched only to the `Agent` tool (prints dispatch info, never blocks). No shared config paths with other plugins. Designed to coexist with other Claude Code plugins (developed alongside `compound-engineering`) without interference.
