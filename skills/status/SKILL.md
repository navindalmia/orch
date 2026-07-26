---
name: status
description: Show the current orch model-routing ceiling and allowed tiers for this machine. Use when the user asks "what's my max model", "orch status", or wants to check the current routing policy.
---

# orch status

Read `~/.claude/orch.config.json`. If it exists and has a valid `maxModel`, report that value. If missing or invalid, report that no ceiling has been explicitly set — the current session's own model is being used as the ceiling for this session, and the user can persist a specific choice with `/orch:set-max`.

Also list the tiers at or below the ceiling, in order: `claude-haiku-4-5-20251001` (cheapest) → `claude-sonnet-5` → `claude-opus-5` (most capable). Only include tiers up to and including the current ceiling.

Keep the response short — a couple of lines, not a report.
