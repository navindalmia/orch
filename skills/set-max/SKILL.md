---
name: set-max
description: Set the user's maximum model ceiling for orch's routing policy. Use when the user says "set my max model to X", "cap orch at X", or wants to change the routing ceiling.
---

# orch set-max

Valid ceiling values, cheapest to most capable: `claude-haiku-4-5-20251001`, `claude-sonnet-5`, `claude-opus-5`.

1. Confirm the requested value is one of the three valid values above (accept common aliases like "haiku", "sonnet", "opus" and map them to the full model id — `opus` maps to `claude-opus-5`, etc).
2. Write `{"maxModel": "<full-model-id>"}` to `~/.claude/orch.config.json`, creating the `~/.claude` directory first if it doesn't exist. Preserve any other keys already in that file if it exists — only overwrite `maxModel`.
3. Tell the user the new ceiling takes effect next session (the policy is injected at `SessionStart`, not read mid-session).

If the requested value isn't one of the three valid tiers, tell the user the valid options instead of guessing or writing an invalid value.
