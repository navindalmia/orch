#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TIER_ORDER = ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5"];
const CONFIG_PATH = path.join(os.homedir(), ".claude", "orch.config.json");
const FEEDBACK_LOG_PATH = path.join(os.homedir(), ".claude", "orch.feedback.jsonl");

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

function buildCeilingSection(configuredCeiling) {
  if (configuredCeiling) {
    return [
      `- Ceiling (user-set, via /orch:set-max): ${configuredCeiling}. Never spawn a subagent above this tier.`,
      "- Near the start of this session, briefly confirm this ceiling with the user before relying on it" +
        " (they may want to change it) — don't wait for them to ask."
    ];
  }
  return [
    "- No ceiling configured yet. Default the ceiling to whatever model is currently powering this session" +
      " (your own model right now).",
    "- Near the start of this session, tell the user you're defaulting the ceiling to the current session" +
      " model and ask them to confirm or override it with /orch:set-max before you rely on it for delegation."
  ];
}

function buildPolicyText(configuredCeiling) {
  const lines = ["orch: model-routing policy for this session", ...buildCeilingSection(configuredCeiling)];

  lines.push(
    "",
    "TIER DECISION RUBRIC — classify each delegated subtask against these signals before picking a tier:",
    "- Cheapest tier: read-only or mechanical — grep/search, reading a known file, listing/status checks," +
      " simple lookups, no judgment call, a wrong answer is cheap to catch and redo.",
    "- Middle tier: writing or editing code, standard debugging within a bounded scope, multi-step reasoning" +
      " over a known problem, synthesizing results already gathered by a cheaper-tier subagent.",
    "- Ceiling tier: architecture-level judgment, ambiguous or underspecified scope, security-sensitive review," +
      " cross-cutting analysis where a wrong answer is expensive, or acting as a second-opinion verifier" +
      " above another tier's output.",
    "- When a task mixes signals, classify by its hardest sub-step, not its average.",
    "",
    "STRICT RULES (non-negotiable, no exceptions even if you believe a task warrants otherwise):",
    "1. Never spawn a subagent above the confirmed ceiling.",
    "2. Never perform multi-file exploration, grep-and-analyze, or bulk reading inline in this session's own" +
      " context. That work is always delegated to an independent Agent call so raw search/file output never" +
      " enters this session — only the subagent's synthesized result comes back. This keeps this session's" +
      " context from filling up with intermediate data.",
    "3. Every subagent result must be reviewed by you (the current session model) before you rely on it" +
      " further. No silent pass-through of unverified subagent output.",
    "4. If your review finds a result unsatisfactory, do not silently retry. Follow the verification and" +
      " feedback protocol below before proceeding.",
    "",
    "VISIBILITY: a companion PreToolUse hook automatically prints which agent/tier is being dispatched and" +
      " for what task each time you call Agent — you don't need to narrate this yourself, but you should" +
      " briefly summarize each subagent's result back to the user when it returns.",
    "",
    "VERIFICATION & FEEDBACK PROTOCOL (runs every time a delegated result is unsatisfactory on your review):",
    "1. Do not use the result as-is. Note specifically what's wrong with it.",
    "2. Get a second opinion: re-run the same subtask one tier above the tier that produced it (still capped" +
      " at the ceiling — if the tier that produced it was already the ceiling, tell the user the ceiling" +
      " itself may be insufficient for this task rather than escalating further).",
    "3. Append one line to " + FEEDBACK_LOG_PATH + " (create the file/dir if missing) as JSON:" +
      ' {"timestamp": ISO-8601, "task": short description, "tierUsed": tier that produced the bad result,' +
      ' "verifierTier": your own tier, "outcome": "escalated", "secondOpinionTier": tier used for the retry,' +
      ' "secondOpinionAgreed": true|false — did the second-opinion result confirm the first was wrong?,' +
      ' "note": one line on what was wrong}.',
    "4. Treat that log as your own routing memory: before classifying a new subtask, if its description is" +
      " similar to a recent failed entry, route it one tier higher than the rubric alone would suggest.",
    "",
    "This policy only shapes how you delegate via the Agent tool; it does not change your own model."
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
