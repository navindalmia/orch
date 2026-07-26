#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { tierIndexForModel, tierNameForModel } = require("./tiers.js");

const CONFIG_PATH = path.join(os.homedir(), ".claude", "orch.config.json");
const FEEDBACK_LOG_PATH = path.join(os.homedir(), ".claude", "orch.feedback.jsonl");
const TURN_STATE_PATH = path.join(os.homedir(), ".claude", "orch.turn-state.json");
const SESSION_CAP_PATH = path.join(os.homedir(), ".claude", "orch.session-cap.json");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

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

// The `model` field on SessionStart input is the actual model running this
// session — not guaranteed present (e.g. after /clear or compaction). When
// present, persist it so PreToolUse hooks (which never receive a model
// field themselves, per Claude Code's hooks reference) can enforce the true
// hard cap, not just whatever's saved in orch.config.json.
function persistSessionModel(model) {
  if (!model) return;
  try {
    fs.mkdirSync(path.dirname(SESSION_CAP_PATH), { recursive: true });
    fs.writeFileSync(SESSION_CAP_PATH, JSON.stringify({ model }));
  } catch {
    // best-effort — a failed write just means PreToolUse falls back to config-only enforcement
  }
}

function buildCeilingSection(configuredCeiling, sessionModel) {
  const lines = [];

  if (sessionModel) {
    const sessionTierName = tierNameForModel(sessionModel);
    lines.push(
      `- HARD CAP (hook-enforced): this session's own model is ${sessionModel} (${sessionTierName}). A` +
        " PreToolUse hook actually denies any Agent dispatch above this, regardless of what's saved in" +
        " config — this is a real gate now, not just something you're trusted to follow."
    );
  } else {
    lines.push(
      "- HARD CAP: this session's model wasn't reported to this hook this time (happens after /clear or" +
        " compaction) — the previously captured session model, if any, is still enforced by the PreToolUse" +
        " hook. Treat your own current model as the ceiling in your own behavior regardless."
    );
  }

  if (configuredCeiling) {
    lines.push(
      `- Configured ceiling (via /orch:set-max): ${configuredCeiling}. The PreToolUse hook enforces` +
        " whichever is LOWER of this and the hard cap above — also a real gate, not policy-only.",
      "- Near the start of this session, briefly confirm this ceiling with the user before relying on it" +
        " (they may want to change it) — don't wait for them to ask."
    );
  } else {
    lines.push(
      "- No ceiling configured beyond the hard cap itself. Tell the user near the start of this session" +
        " that the effective ceiling is the session's own model, and they can lower it with /orch:set-max."
    );
  }

  return lines;
}

function buildPolicyText(configuredCeiling, sessionModel) {
  const lines = [
    "orch: model-routing policy for this session",
    ...buildCeilingSection(configuredCeiling, sessionModel)
  ];

  lines.push(
    "",
    "ALWAYS ON, NO INVOCATION NEEDED: apply this policy automatically to every task the user gives you in" +
      " this session — coding or not. The user will never say \"use orch\" or \"delegate this\" or hint at" +
      " routing in any way; that is the whole point. Every single turn, before you act, silently check: does" +
      " this task (or any sub-step of it) qualify for delegation per the rubric below? If yes, delegate it" +
      " that way by default, without announcing that you're following a policy or asking permission first." +
      " This applies to ANY kind of task, not just software engineering — research, web lookups, writing," +
      " analysis, anything you'd otherwise do inline yourself.",
    "",
    "TIERS (cheapest first, never exceed the hard cap above) — domain-agnostic, applies to coding AND" +
      " general tasks (research, web search, writing, analysis, etc.):",
    "- scout (claude-haiku-4-5-20251001): read-only, retrieval, or mechanical work with no judgment call —" +
      " grep/search, reading a known file, listing/status checks, simple lookups, a single web search for" +
      " factual/comparison information (e.g. \"find a good laptop\", \"what's the price of X\"), anything" +
      " where a wrong answer is cheap to catch and redo.",
    "- builder (claude-sonnet-5): writing or editing code, standard debugging within a bounded scope," +
      " multi-step reasoning over a known problem, synthesizing/comparing results already gathered by scout" +
      " (e.g. turning several scout-gathered laptop options into a reasoned recommendation).",
    "- architect (claude-opus-5): architecture-level judgment, ambiguous or underspecified scope," +
      " security-sensitive review, cross-cutting analysis where a wrong answer is expensive, or acting as" +
      " a second-opinion verifier above another tier's output.",
    "- When a task mixes signals, classify by its hardest sub-step, not its average. Retrieval/search steps" +
      " are almost always scout even when the overall task ends at builder or architect for synthesis.",
    "",
    "TWO-DIMENSIONAL ESCALATION — within a tier, escalate effort before ever escalating tier:",
    "1. Pick the cheapest tier the task's hardest sub-step calls for (per the rubric above, capped at the" +
      " hard cap).",
    "2. Spawn that tier's agent at its LOWEST reasoning effort first. This is the default for every dispatch" +
      " — never start at high effort.",
    "3. If the result is unsatisfactory on your review, retry the SAME tier at its HIGHEST reasoning effort" +
      " before considering a different tier at all. Effort-within-tier is always cheaper than a bigger model.",
    "4. Only if the same tier still fails at its highest effort do you move to the next tier up, again" +
      " starting that tier at its lowest effort — repeating steps 2-3 there. Never skip this effort-first" +
      " step when moving to a new tier.",
    "5. Never move to a tier above the hard cap. If the hard-cap tier fails even at its highest effort," +
      " stop escalating and tell the user directly instead of silently giving up or exceeding the cap.",
    "",
    "STRICT RULES (non-negotiable, no exceptions even if you believe a task warrants otherwise):",
    "1. Never spawn a subagent above the hard cap (your own current model).",
    "2. Never start a dispatch at anything but the lowest effort for its tier — effort only escalates after" +
      " a review finds the lower-effort result unsatisfactory.",
    "3. Never perform multi-file exploration, grep-and-analyze, or bulk reading inline in this session's own" +
      " context. That work is always delegated to an independent Agent call so raw search/file output never" +
      " enters this session — only the subagent's synthesized result comes back. This keeps this session's" +
      " context from filling up with intermediate data.",
    "4. Every subagent result must be reviewed by you (the current session model) before you rely on it" +
      " further. No silent pass-through of unverified subagent output.",
    "5. If your review finds a result unsatisfactory, do not silently retry. Follow the escalation ladder" +
      " above (effort first, then tier) and the feedback protocol below.",
    "",
    "VISIBILITY: a companion PreToolUse hook automatically prints which tier/effort is being dispatched and" +
      " for what task each time you call Agent — you don't need to narrate this yourself, but you should" +
      " briefly summarize each subagent's result back to the user when it returns.",
    "",
    "VERIFICATION & FEEDBACK PROTOCOL (runs every time a delegated result is unsatisfactory on your review):",
    "1. Do not use the result as-is. Note specifically what's wrong with it.",
    "2. Follow the escalation ladder above (same tier, higher effort; then next tier, lowest effort) to get" +
      " a corrected result, never exceeding the hard cap.",
    "3. Append one line to " + FEEDBACK_LOG_PATH + " (create the file/dir if missing) as JSON:" +
      ' {"timestamp": ISO-8601, "task": short description, "tierUsed": tier that produced the bad result,' +
      ' "effortUsed": effort level that produced the bad result, "escalatedTo": {"tier": ..., "effort": ...},' +
      ' "escalationConfirmedFix": true|false — did the escalation actually produce a better result?,' +
      ' "note": one line on what was wrong}.',
    "4. Treat that log as your own routing memory: before classifying a new subtask, if its description is" +
      " similar to a recent failed entry, start at the effort/tier that fixed it last time instead of" +
      " restarting from the cheapest option.",
    "",
    "END-OF-RESPONSE SUMMARY (mandatory, every response, no exceptions):",
    "Before finishing each response, append a short summary line reporting what ran this turn. Do not" +
      " recall this from memory or guess — read " + TURN_STATE_PATH + " (its `dispatches` array) as the" +
      " source of truth for what was actually delegated this turn; it lists each dispatch's tier and effort" +
      " in the order they happened.",
    "- If dispatches is empty: state that you handled the turn directly yourself, plus a one-word complexity" +
      " label for the main task (trivial / standard / complex) based on the same rubric signals used for" +
      " tier classification above.",
    "- If dispatches is non-empty: list each one as `<tier>(<effort>)`, e.g." +
      ' "orch: scout(low) x2, builder(high) x1" — plus whether you did any direct work yourself alongside them.',
    "- Keep it to one line, plainly labelled so the user can spot it, e.g. starting with \"orch:\".",
    "",
    "This policy only shapes how you delegate via the Agent tool; it does not change your own model."
  );

  return lines.join("\n");
}

async function main() {
  const raw = await readStdin();
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    // proceed with an empty input — sessionModel just won't be available this run
  }

  const sessionModel = input.model || null;
  persistSessionModel(sessionModel);

  const configuredCeiling = readConfiguredCeiling();
  const output = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: buildPolicyText(configuredCeiling, sessionModel)
    }
  };
  process.stdout.write(JSON.stringify(output));
}

main();
