#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TIER_ORDER = ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5"];
const CONFIG_PATH = path.join(os.homedir(), ".claude", "orch.config.json");

function readConfiguredCeiling() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (TIER_ORDER.includes(parsed.maxModel)) {
      return parsed.maxModel;
    }
  } catch {
    // no config yet, or unreadable
  }
  return null;
}

function buildPolicyText(configuredCeiling) {
  const lines = ["orch: model-routing policy for this session"];

  if (configuredCeiling) {
    lines.push(
      `- Ceiling (user-set, via /orch:set-max): ${configuredCeiling}. Never spawn a subagent above this tier.`,
      "- Near the start of this session, briefly confirm this ceiling with the user before relying on it" +
        " (they may want to change it) — don't wait for them to ask."
    );
  } else {
    lines.push(
      "- No ceiling configured yet. Default the ceiling to whatever model is currently powering this session" +
        " (your own model right now).",
      "- Near the start of this session, tell the user you're defaulting the ceiling to the current session" +
        " model and ask them to confirm or override it with /orch:set-max before you rely on it for delegation."
    );
  }

  lines.push(
    "- Tiers, cheapest first: claude-haiku-4-5-20251001, claude-sonnet-5, claude-opus-5. Only tiers at or" +
      " below the confirmed ceiling are usable.",
    "- When delegating via the Agent tool, pick the cheapest tier that fits the subtask:",
    "  mechanical/read-only work (grep, file reads, status checks) -> cheapest tier;",
    "  standard implementation/debugging -> middle tier;",
    "  architecture, ambiguous scope, or high-stakes review -> ceiling tier.",
    "- Escalation: if a subtask fails twice at its assigned tier, retry once at the next tier up,",
    "  but never above the ceiling. If the ceiling tier still fails, surface the failure to the user",
    "  instead of silently giving up.",
    "- This policy only applies to work you delegate via Agent; it does not change your own model."
  );

  return lines.join("\n");
}

function main() {
  const configuredCeiling = readConfiguredCeiling();
  const output = {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: buildPolicyText(configuredCeiling) }
  };
  process.stdout.write(JSON.stringify(output));
}

main();
