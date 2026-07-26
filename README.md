# orch

A small Claude Code plugin: you set one maximum model ceiling, and `orch` injects a routing policy each session so subagent delegation steps down to cheaper models when the task doesn't need the ceiling model.

## Why

By default, every subagent spawned during a session runs at whatever model the main session is using — even trivial work like a file read or a grep. `orch` doesn't change your own model; it only shapes how you delegate to the `Agent` tool, so mechanical work goes to a cheap tier and only work that actually needs it uses your ceiling.

## What it does

- On session start, reads your configured ceiling from `~/.claude/orch.config.json`. If none is set yet, the ceiling defaults to whatever model is currently powering the session — and the agent confirms that default with you near the start of the session rather than assuming it silently.
- Injects a short routing policy into context: pick the cheapest tier that fits each delegated subtask, never exceed the ceiling, escalate one tier on repeated failure (capped at the ceiling).
- Two commands to manage the ceiling: `/orch:status`, `/orch:set-max <tier>`.

## What it deliberately doesn't do (v1)

- No hard blocking of tool calls — it's a policy the main agent follows, not an enforced gate.
- No multi-provider routing (Codex/Gemini/etc.) — Claude tiers only.
- No workflow DSL, no named profiles, no telemetry/logging. One config value, one policy.

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

## Compatibility

No hooks other than `SessionStart`, no shared config paths with other plugins. Designed to coexist with other Claude Code plugins (developed alongside `compound-engineering`) without interference.
