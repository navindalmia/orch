# orch

A small Claude Code plugin: you set one maximum model ceiling, and `orch` injects a routing policy each session so subagent delegation steps down to cheaper models when the task doesn't need the ceiling model — with visible dispatch, verification of results, and a feedback log it uses as routing memory.

## Why

By default, every subagent spawned during a session runs at whatever model the main session is using — even trivial work like a file read or a grep. `orch` doesn't change your own model; it only shapes how you delegate to the `Agent` tool, so mechanical work goes to a cheap tier and only work that actually needs it uses your ceiling.

## What it does

- **Ceiling.** On session start, reads your configured ceiling from `~/.claude/orch.config.json`. If none is set yet, it defaults to whatever model is currently powering the session, and the agent confirms that default with you near the start of the session rather than assuming it silently.
- **Tier decision rubric.** The injected policy classifies each delegated subtask by concrete signals — read-only/mechanical work goes to the cheapest tier, standard implementation/debugging to the middle tier, architecture-level or high-stakes work to the ceiling tier.
- **Context isolation.** Multi-file grep/search/analysis work is never done inline in the main session — it's always delegated to an independent `Agent` call, so only the synthesized result comes back and the session's own context doesn't fill up with raw intermediate data.
- **Visible dispatch.** A `PreToolUse` hook deterministically prints which tier/agent is being spawned and for what task, every time — this isn't left to the model to remember to narrate.
- **Verification.** Every subagent result is reviewed by the current session model before being relied on — no silent pass-through.
- **Feedback loop.** If a result is unsatisfactory, `orch` gets a second opinion one tier up (capped at the ceiling), logs the outcome to `~/.claude/orch.feedback.jsonl`, and treats that log as routing memory — future similar subtasks get routed a tier higher than the rubric alone would suggest.
- Two commands to manage the ceiling: `/orch:status`, `/orch:set-max <tier>`.

## What it deliberately doesn't do (v1)

- No hard blocking of tool calls for tier selection itself — dispatch visibility is enforced by a hook, but tier *choice* is still a policy the main agent follows, not a programmatic gate.
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
/orch:set-max sonnet
```

Valid ceilings: `haiku` (`claude-haiku-4-5-20251001`), `sonnet` (`claude-sonnet-5`), `opus` (`claude-opus-5`).

## Files it creates

- `~/.claude/orch.config.json` — your configured ceiling (written by `/orch:set-max`)
- `~/.claude/orch.feedback.jsonl` — append-only log of verification/escalation outcomes, used as routing memory

## Compatibility

Hooks: `SessionStart` (injects policy) and `PreToolUse` matched only to the `Agent` tool (prints dispatch info, never blocks). No shared config paths with other plugins. Designed to coexist with other Claude Code plugins (developed alongside `compound-engineering`) without interference.
