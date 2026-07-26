#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readState, writeState } = require("./turn-state.js");
const { tierIndexForModel, tierNameForModel } = require("./tiers.js");

const CONFIG_PATH = path.join(os.homedir(), ".claude", "orch.config.json");

function readConfiguredCeiling() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (tierIndexForModel(parsed.maxModel) >= 0) {
      return parsed.maxModel;
    }
  } catch {
    // no config yet, or unreadable
  }
  return null;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason
      }
    })
  );
  process.exit(0);
}

async function main() {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
    return;
  }

  const toolInput = input.tool_input || {};
  const model = toolInput.model;

  // No explicit model on the call means it inherits the session's own model,
  // which is by definition never above whatever is running this session —
  // nothing to enforce here.
  if (model) {
    const ceiling = readConfiguredCeiling();
    if (ceiling) {
      const requestedIndex = tierIndexForModel(model);
      const ceilingIndex = tierIndexForModel(ceiling);
      // Unrecognized model names aren't blocked here — we can only enforce
      // tiers we know about. Note: this checks against the *configured*
      // ceiling in orch.config.json, not the live session model — a hook
      // has no way to know which model is actually running this session,
      // so keep the config ceiling in sync via /orch:set-max for this to
      // mean what you expect.
      if (requestedIndex >= 0 && requestedIndex > ceilingIndex) {
        deny(
          `[orch] Denied: requested tier "${tierNameForModel(model)}" exceeds the configured ceiling` +
            ` "${tierNameForModel(ceiling)}" (${ceiling}). Re-dispatch at or below the ceiling, or run` +
            " /orch:set-max to raise it first (subject to the hard cap of your own current session model)."
        );
        return;
      }
    }
  }

  const tierName = model ? tierNameForModel(model) : "(session default)";
  const subagentType = toolInput.subagent_type || "general-purpose";
  const effort = toolInput.effort || toolInput.reasoning_effort || "unspecified";
  const description = toolInput.description || toolInput.prompt || "(no description)";
  const shortDescription = String(description).slice(0, 120);

  process.stderr.write(
    `[orch] -> dispatching ${tierName} (${subagentType}, effort=${effort}): ${shortDescription}\n`
  );

  const state = readState();
  state.delegatedThisTurn = true;
  state.dispatches = state.dispatches || [];
  state.dispatches.push({ tier: tierName, effort, subagentType });
  writeState(state);

  // Allowed: let the tool call through unmodified.
  process.exit(0);
}

main();
