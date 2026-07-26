#!/usr/bin/env node
"use strict";

const { readState, writeState, captureLiveEffort } = require("./turn-state.js");

// Tools that indicate the main session is doing exploratory/mechanical work
// itself instead of delegating it to a scout-tier subagent. Deliberately
// excludes Read: the main session legitimately re-reads files it just
// edited or that a subagent returned, and that shouldn't be nudged.
const WORK_TOOLS = new Set(["Bash", "Edit", "Write", "Glob", "Grep", "MultiEdit", "NotebookEdit"]);

function isRunningInsideSubagent() {
  // Subagents execute the delegated work — never nudge them for doing it.
  return Boolean(process.env.CLAUDE_PARENT_SESSION_ID || process.env.CLAUDE_AGENT_ID);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

function messageFor(count) {
  if (count <= 0) return null;
  if (count === 1) {
    return "[orch] This is mechanical/exploratory work — consider delegating it to a scout-tier Agent" +
      " instead of doing it inline, so it runs at low cost and out of this session's context.";
  }
  if (count === 2) {
    return "[orch] 2nd direct work-tool call this turn without delegating. Scout-tier work belongs in an" +
      " isolated Agent call, not inline — you're paying session-model cost for cheap work.";
  }
  return `[orch] ${count} direct work-tool calls this turn without delegating. Re-check whether this whole` +
    " task should have been handed to a scout/builder Agent from the start.";
}

async function main() {
  if (isRunningInsideSubagent()) {
    process.exit(0);
    return;
  }

  // Capture live effort on every PreToolUse fire, regardless of which tool —
  // this is our only fresh read on the session's own current effort level.
  writeState(captureLiveEffort(readState()));

  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
    return;
  }

  const toolName = String(input.tool_name || "");
  if (!WORK_TOOLS.has(toolName)) {
    process.exit(0);
    return;
  }

  const state = readState();

  // Once a delegation has happened this turn, the main session may legitimately
  // do a bit of direct follow-up (e.g. verifying a subagent's result) — don't nag.
  if (state.delegatedThisTurn) {
    process.exit(0);
    return;
  }

  state.violations = (state.violations || 0) + 1;
  writeState(state);

  const message = messageFor(state.violations);
  if (message) {
    process.stderr.write(message + "\n");
  }

  // Always non-blocking — this is a nudge, never a gate.
  process.exit(0);
}

main();
