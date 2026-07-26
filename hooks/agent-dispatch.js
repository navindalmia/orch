#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readState, writeState, captureLiveEffort } = require("./turn-state.js");
const { tierIndexForModel, tierNameForModel } = require("./tiers.js");

const CONFIG_PATH = path.join(os.homedir(), ".claude", "orch.config.json");
const SESSION_CAP_PATH = path.join(os.homedir(), ".claude", "orch.session-cap.json");

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

// Written by session-start.js from SessionStart's `model` field — the one
// place Claude Code actually reports which model is running the session.
// PreToolUse hooks never receive a model field themselves, so this file is
// the only way this hook can know the true session model.
function readSessionCap() {
  try {
    const raw = fs.readFileSync(SESSION_CAP_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (tierIndexForModel(parsed.model) >= 0) {
      return parsed.model;
    }
  } catch {
    // no session cap captured yet (e.g. plugin just installed, or SessionStart didn't report a model)
  }
  return null;
}

// Effective ceiling is the lower of the configured ceiling and the actual
// session model — never let a looser/stale config value override the real cap.
function effectiveCeiling() {
  const configured = readConfiguredCeiling();
  const sessionCap = readSessionCap();
  const configuredIndex = configured ? tierIndexForModel(configured) : Infinity;
  const sessionIndex = sessionCap ? tierIndexForModel(sessionCap) : Infinity;
  if (configuredIndex === Infinity && sessionIndex === Infinity) {
    return null;
  }
  return configuredIndex <= sessionIndex ? configured : sessionCap;
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
  // Capture live effort on every PreToolUse fire — our only fresh read on
  // the session's own current effort level (model has no equivalent).
  writeState(captureLiveEffort(readState()));

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
  // which is by definition never above the true hard cap — nothing to enforce here.
  if (model) {
    const ceiling = effectiveCeiling();
    if (ceiling) {
      const requestedIndex = tierIndexForModel(model);
      const ceilingIndex = tierIndexForModel(ceiling);
      // Unrecognized model names aren't blocked here — we can only enforce tiers we know about.
      if (requestedIndex >= 0 && requestedIndex > ceilingIndex) {
        deny(
          `[orch] Denied: requested tier "${tierNameForModel(model)}" exceeds the effective ceiling` +
            ` "${tierNameForModel(ceiling)}" (${ceiling} — the lower of your configured ceiling and this` +
            " session's actual model). Re-dispatch at or below it, or run /orch:set-max to raise the" +
            " configured ceiling (still capped at the session's real model)."
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
