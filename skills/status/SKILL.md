---
name: status
description: Show the current orch model-routing ceiling and allowed tiers for this machine. Use when the user asks "what's my max model", "orch status", or wants to check the current routing policy.
---

# orch status

Read `~/.claude/orch.config.json`. If it exists and has a valid `maxModel`, report that value. If missing or invalid, report that no ceiling has been explicitly set — the current session's own model is being used as the ceiling for this session, and the user can persist a specific choice with `/orch:set-max`.

Remind the user of the hard cap: the effective ceiling can never exceed whatever model is currently running the session, regardless of what's saved in config — if the saved value is above that, say so explicitly.

Also list the tiers at or below the effective ceiling, in order: `scout` (`claude-haiku-4-5-20251001`, cheapest) → `builder` (`claude-sonnet-5`) → `architect` (`claude-opus-5`, most capable). Only include tiers up to and including the effective ceiling.

Keep the response short — a couple of lines, not a report.
