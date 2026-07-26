---
name: set-max
description: Set the user's maximum model ceiling for orch's routing policy. Use when the user says "set my max model to X", "cap orch at X", or wants to change the routing ceiling.
---

# orch set-max

Tiers, cheapest to most capable: `scout` (`claude-haiku-4-5-20251001`), `builder` (`claude-sonnet-5`),
`architect` (`claude-opus-5`).

1. Confirm the requested value maps to one of the three tiers above (accept the tier name, a raw model
   name like "haiku"/"sonnet"/"opus", or the full model id) and resolve it to the full model id.
2. **Hard cap check:** the ceiling can never be set above whatever model is currently running this session
   — the user cannot afford to spawn agents pricier than themselves. If the requested tier is above your
   own current model, refuse it, explain why, and offer to set it to your own current tier instead (the
   highest they can actually use right now).
3. Write `{"maxModel": "<full-model-id>"}` to `~/.claude/orch.config.json`, creating the `~/.claude`
   directory first if it doesn't exist. Preserve any other keys already in that file if it exists — only
   overwrite `maxModel`.
4. Tell the user the new ceiling takes effect next session (the policy is injected at `SessionStart`, not
   read mid-session), and that it's still subject to the hard cap of whatever model is running that future
   session.

If the requested value isn't one of the three valid tiers, tell the user the valid options instead of
guessing or writing an invalid value.
